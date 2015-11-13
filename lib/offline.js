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

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    var rootDir = config.rootDir || './';

    console.log('Offlining ' + chalk.bold(rootDir) + ' to ' + chalk.bold(path.join(rootDir, 'offline-worker.js')) + '…\n');

    // Ensure root directory ends with slash so we strip leading slash from paths
    // of files to cache, so they're relative paths, and the offline worker
    // will match them regardless of whether the app is deployed to a top-level
    // directory for a custom domain (f.e. https://example.com/) or a subdirectory
    // of a GitHub Pages domain (f.e. https://mykmelez.github.io/example/).
    if (rootDir.lastIndexOf('/') !== rootDir.length -1) {
      rootDir = rootDir + "/";
    }

    var fileGlobs = config.fileGlobs || ['**/*'];
    var importGlobs = config.importScripts || [];

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
      var absoluteGlobs = fileGlobs.map(function (v) {
        return path.join(rootDir, v);
      });
      var files = flatGlobs(absoluteGlobs);
      var filesAndHashes = getFilesAndHashes(files, rootDir, absoluteGlobs);

      var imports = flatGlobs(importGlobs);
      var importsAndHashes = getImportsAndHashes(imports,   

      var replacements = {
        cacheId: cacheId, //TODO: Not implemented in template
        ignoreUrlParametersMatching: config.ignoreUrlParametersMatching || [/./], //TODO: Not implemented in template
        cacheVersion: getVersion(filesAndHashes),
        resources: filesAndHashes,
        importScripts: importsAndHashes
      };

      var stream = gulp.src([__dirname + '/../templates/app/offline-worker.js'])
        .pipe(template(replacements))
        .pipe(conflict(rootDir))
        .pipe(gulp.dest(rootDir));

      stream.on('finish', function () { resolve(); });
      stream.on('error', function (e) { reject(e); });
    });

    function flatGlobs(fileGlobs) {
      return Object.keys(fileGlobs.reduce(function (matches, fileGlob) {
        fileGlob = fileGlob.replace(path.sep, '/');
        glob.sync(fileGlob, { nodir: true }).forEach(function (filepath) {
          matches[filepath] = filepath;
        });
        return matches;
      }, {}));
    }

    function getFilesAndHashes(files, stripPrefix, sizeWhiteList) {
      return files
        .map(function (path) {
          warnFileSize(path, fileGlobs);
          logOk(path);
          
          var data = fs.readFileSync(path);
          var hash = getHash(data);
          return {
            path: path.replace(stripPrefix, function (match, offset) {
              return offset === 0 ? './' : match;
            }),
            hash: hash
          };
        });
    }

    // TODO: Think about unifying this function and the previous one
    function getImportsAndHashes(imports, stripPrefix, sizeWhiteList) {
      return files
        .map(function (path) {
          // TODO: I think we should warn, not fail
          assertExists(filepath);
          
          var data = fs.readFileSync(path);
          var hash = getHash(data);
          return {
            path: path.replace(stripPrefix, function (match, offset) {
              return offset === 0 ? './' : match;
            }),
            hash: hash
          };
        });
    }

    function assertExists(path) {
      var stat;
      try {
        stat = fs.statSync(path);
      } catch (ex) {
        console.log(chalk.red.bold(script + ' doesn\'t exist.'));
      }

      if (!stat.isFile()) {
        console.log(chalk.red.bold(script + ' is not a file.'));
        throw new Error(script + ' is not a file.');
      }
    }

    function getVersion(filesAndHashes) {
      return getHashOfHashes(filesAndHashes.map((entry) => entry.hash));
    }

    function warnFileSize(filepath, whiteList) {
      var stat = fs.statSync(filepath);
      if (stat.isFile() && stat.size > 2 * 1024 * 1024 && whiteList.indexOf(filepath) === -1) {
        console.log(chalk.yellow.bold(file + ' is bigger than 2 MiB. Are you sure you want to cache it? To suppress this warning, explicitly include the file in the fileGlobs list.'));
      }
    }

    function logOk(filepath) {
      console.log(chalk.bold.green('✓ ') + 'Caching \'' + filepath + '\'');
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
