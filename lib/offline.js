/**
 * Copyright 2015 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Import this first so we can use it to wrap other modules we import.
var promisify = require('promisify-node');

var fs = require('fs');
var path = require('path');
var chalk = require('chalk');
var glob = require('glob');
var template = require('gulp-template');
var crypto = require('crypto');
var gulp = require('gulp');
var ghslug = promisify(require('github-slug'));
var prettyBytes = require('pretty-bytes');
var gzipSize = require('gzip-size');
var escapeStringRegexp = require('escape-string-regexp');

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    'use strict';

    var rootDir = config.rootDir || './';

    process.stdout.write(
      'Offlining ' + chalk.bold(rootDir) + ' to ' + chalk.bold(path.join(rootDir, 'offline-worker.js')) + '…\n'
    );

    // Ensure root directory ends with slash so we strip leading slash from paths
    // of files to cache, so they're relative paths, and the offline worker
    // will match them regardless of whether the app is deployed to a top-level
    // directory for a custom domain (f.e. https://example.com/) or a subdirectory
    // of a GitHub Pages domain (f.e. https://mykmelez.github.io/example/).
    if (rootDir.lastIndexOf('/') !== rootDir.length -1) {
      rootDir = rootDir + '/';
    }

    var fileGlobs = config.fileGlobs || ['**/*'];
    var importScripts = config.importScripts || [];
    var directoryIndexes = config.directoryIndexes || ['index.html'];
    var directoryIndexMatch = new RegExp('/(' + directoryIndexes.map(escapeStringRegexp).join('|') + ')$');

    // Remove the existing service worker, if any, so the worker doesn't include
    // itself in the list of files to cache.
    try {
      fs.unlinkSync(path.join(rootDir, 'offline-worker.js'));
    } catch (ex) {
      // Only ignore the error if it's a 'file not found' error.
      if (!ex.code || ex.code !== 'ENOENT') {
        reject(ex);
        return;
      }
    }

    ghslug('./')
    .catch(function() {
      // Use the name from package.json if there's an error while fetching the GitHub slug.
      try {
        return JSON.parse(fs.readFileSync('package.json')).name;
      } catch (ex) {
        return '';
      }
    })
    .then(function(cacheId) {
      checkImports(importScripts, rootDir);

      var absoluteGlobs = fileGlobs.map(function (v) {
        return path.join(rootDir, v);
      });
      var files = flatGlobs(absoluteGlobs);
      var filesAndHashes = getFilesAndHashes(files, rootDir, absoluteGlobs);

      var replacements = {
        cacheId: cacheId,
        cacheVersion: getHashOfHashes(pluckHashes(filesAndHashes)),
        resources: filesAndHashes,
        importScripts: importScripts,
      };

      var stream = gulp.src([__dirname + '/../templates/app/offline-worker.js'])
        .pipe(template(replacements))
        .pipe(gulp.dest(rootDir));

      return new Promise(function (resolve, reject) {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });
    })
    .then(resolve, reject);

    function flatGlobs(fileGlobs) {
      return Object.keys(fileGlobs.reduce(function (matches, fileGlob) {
        fileGlob = fileGlob.replace(path.sep, '/');
        glob.sync(fileGlob, { nodir: true }).forEach(function (filepath) {
          matches[filepath] = filepath;
        });
        return matches;
      }, {}));
    }

    function getPathName(filepath, rootDir) {
       filepath = filepath.replace(directoryIndexMatch, '/');

       return filepath.replace(rootDir, function (match, offset) {
         // The root must be the worker's directory
         return offset === 0 ? './' : match;
       });
    }

    function getFilesAndHashes(files, rootDir, sizeWhiteList) {
      var totalSize = 0;
      var totalGzipSize = 0;
      var filesAndHashes = files.map(function (filepath) {
        var size = countFileSize(filepath, sizeWhiteList);
        totalSize += size;
        var data = fs.readFileSync(filepath);
        totalGzipSize += gzipSize.sync(data);
        var hash = getHash(data);
        var path = getPathName(filepath, rootDir);
        var rootMatch = new RegExp('^' + rootDir);
        var pathAtString = '';
        if (filepath.replace(rootMatch, './') !== path) {
          pathAtString = ' at path ' + path;
        }

        process.stdout.write(chalk.green.bold('✓ ') + 'Caching ' + filepath + pathAtString + ' (' + prettyBytes(size) + ')\n');
        return {
          path: path,
          hash: hash,
        };
      });

      process.stdout.write('Total cache size is ' + prettyBytes(totalSize) + ' (' + prettyBytes(totalGzipSize) + ' if served with gzip) for ' + files.length + ' files.\n');

      filesAndHashes.unshift({
        path: './'
      }); // cache always the current root to make the default page available

      // Remove duplicates from file list
      return filesAndHashes.filter(function(fileName, index) {
        return filesAndHashes.indexOf(fileName) === index;
      });
    }

    function checkImports(imports, rootDir) {
      imports.forEach(function(filepath) {
        var warning;

        try {
          if (!fs.statSync(path.join(rootDir, filepath)).isFile()) {
            warning = 'is a directory';
          }
        } catch (ex) {
          warning = 'doesn\'t exist';
        }

        if (warning) {
          process.stdout.write(chalk.yellow.bold(
            '⚠ ' + filepath + ' ' + warning + ', but you\'ve added it to importScripts.\n' +
            '  To fix this problem, ensure the path is a file or remove it from importScripts.\n'
          ));
        }
      });
    }

    function pluckHashes(entries) {
      return entries.map(function (entry) { return entry.hash; });
    }

    function countFileSize(filepath, whiteList) {
      var stat = fs.statSync(filepath);
      if (stat.isFile() && stat.size > 2 * 1024 * 1024 && whiteList.indexOf(filepath) === -1) {
        process.stdout.write(chalk.yellow.bold(
          '⚠ ' + filepath + ' is bigger than 2 MiB. Are you sure you want to cache it?\n' +
          '  To suppress this warning, explicitly include the file in the fileGlobs list.\n'
        ));
      }
      return stat.size;
    }

    function getHashOfHashes(hashArray) {
      return getHash(new Buffer(hashArray.join(''), 'hex'));
    }

    function getHash(data) {
      var sha1 = crypto.createHash('sha1');
      sha1.update(data);
      return sha1.digest('hex');
    }
  });
};
