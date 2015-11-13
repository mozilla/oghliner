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
var conflict = require('gulp-conflict');
var path = require('path');
var chalk = require('chalk');
var glob = require('glob');
var template = require('gulp-template');
var crypto = require('crypto');
var gulp = require('gulp');
var ghslug = promisify(require('github-slug'));
var prettyBytes = require('pretty-bytes');

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    'use strict';

    var rootDir = config.rootDir || './';

    console.log('Offlining ' + chalk.bold(rootDir) + ' to ' + chalk.bold(path.join(rootDir, 'offline-worker.js')) + '…\n');

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

    // Remove the existing service worker, if any, so the worker doesn't include
    // it in the list of files to cache.
    try {
      fs.unlinkSync(path.join(rootDir, 'offline-worker.js'));
    } catch (ex) {
      // Only ignore the error if it's a 'file not found' error.
      if (!ex.code || ex.code !== 'ENOENT') {
        reject(ex);
        return;
      }
    }

    ghslug('./').catch(function() {
      // Use the name from package.json if there's an error while fetching the GitHub slug.
      try {
        return JSON.parse(fs.readFileSync('package.json')).name;
      } catch (ex) {
        return '';
      }
    }).then(function(cacheId) {
      checkImports(importScripts, rootDir);

      var absoluteGlobs = fileGlobs.map(function (v) {
        return path.join(rootDir, v);
      });
      var files = flatGlobs(absoluteGlobs);
      var filesAndHashes = getFilesAndHashes(files, rootDir, absoluteGlobs);

      var replacements = {
        cacheId: cacheId,
        ignoreUrlParametersMatching: config.ignoreUrlParametersMatching || [/./], //TODO: Not implemented in template
        cacheVersion: getHashOfHashes(pluckHashes(filesAndHashes)),
        resources: filesAndHashes,
        importScripts: importScripts,
      };

      var stream = gulp.src([__dirname + '/../templates/app/offline-worker.js'])
        .pipe(template(replacements))
        .pipe(conflict(rootDir))
        .pipe(gulp.dest(rootDir));

      return new Promise(function (resolve, reject) {
        stream.on('finish', function () { resolve(); });
        stream.on('error', function (e) { reject(e); });
      });
    }).then(resolve, reject);

    function flatGlobs(fileGlobs) {
      return Object.keys(fileGlobs.reduce(function (matches, fileGlob) {
        fileGlob = fileGlob.replace(path.sep, '/');
        glob.sync(fileGlob, { nodir: true }).forEach(function (filepath) {
          matches[filepath] = filepath;
        });
        return matches;
      }, {}));
    }

    function getFilesAndHashes(files, rootDir, sizeWhiteList) {
      var totalSize = 0;
      var filesAndHashes = files.map(function (filepath) {
        totalSize += countFileSize(filepath, sizeWhiteList);
        var data = fs.readFileSync(filepath);
        var hash = getHash(data);
        logOk(filepath);
        return {
          path: filepath.replace(rootDir, function (match, offset) {
            //XXX: The root must be the worker's directory
            return offset === 0 ? './' : match;
          }),
          hash: hash,
        };
      });

      console.log('Total precache size is about ' + prettyBytes(totalSize) +
                  ' for ' + files.length + ' resources.');

      return filesAndHashes;
    }

    function checkImports(imports, rootDir) {
      imports.forEach(function (filepath) {
        //TODO: I think we should warn, not fail
        assertExists(path.join(rootDir, filepath));
      });
    }

    function pluckHashes(entries) {
      return entries.map(function (entry) { return entry.hash; });
    }

    function assertExists(filepath) {
      var stat;
      try {
        stat = fs.statSync(filepath);
      } catch (ex) {
        console.log(chalk.red.bold(filepath + ' doesn\'t exist.'));
        throw ex;
      }

      if (!stat.isFile()) {
        console.log(chalk.red.bold(filepath + ' is not a file.'));
        throw new Error(filepath + ' is not a file.');
      }
    }

    function countFileSize(filepath, whiteList) {
      var stat = fs.statSync(filepath);
      if (stat.isFile() && stat.size > 2 * 1024 * 1024 && whiteList.indexOf(filepath) === -1) {
        console.log(chalk.yellow.bold(filepath + ' is bigger than 2 MiB. Are you sure you want to cache it? To suppress this warning, explicitly include the file in the fileGlobs list.'));
      }
      return stat.size;
    }

    function logOk(filepath) {
      console.log(chalk.bold.green('✓ ') + 'Caching ' + filepath);
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
