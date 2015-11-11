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
var swPrecache = promisify(require('sw-precache'));
var chalk = require('chalk');
var ghslug = promisify(require('github-slug'));
var glob = require('glob');

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    var rootDir = config.rootDir || './';

    // Ensure root directory ends with slash so we strip leading slash from paths
    // of files to cache, so they're relative paths, and the offline worker
    // will match them regardless of whether the app is deployed to a top-level
    // directory for a custom domain (f.e. https://example.com/) or a subdirectory
    // of a GitHub Pages domain (f.e. https://mykmelez.github.io/example/).
    if (rootDir.lastIndexOf('/') !== rootDir.length -1) {
      rootDir = rootDir + '/';
    }

    var fileGlobs = config.fileGlobs || ['**/*'];

    // Remove the existing service worker, if any, so sw-precache doesn't include
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

    resolve(ghslug('./').catch(function() {
      // Use the name from package.json if there's an error while fetching the GitHub slug.
      try {
        return JSON.parse(fs.readFileSync('package.json')).name;
      } catch (ex) {
        return '';
      }
    }).then(function(cacheId) {
      var staticFileGlobs = fileGlobs.map(function(v) {
        return path.join(rootDir, v);
      });

      staticFileGlobs.forEach(function(globPattern) {
        glob.sync(globPattern.replace(path.sep, '/')).forEach(function(file) {
          var stat = fs.statSync(file);

          if (stat.isFile() && stat.size > 2 * 1024 * 1024 && staticFileGlobs.indexOf(file) === -1) {
            console.log(chalk.yellow.bold(file + ' is bigger than 2 MiB. Are you sure you want to cache it? To suppress this warning, explicitly include the file in the fileGlobs list.'));
          }
        });
      });

      var importScripts = config.importScripts || [];
      importScripts.forEach(function(script) {
        var stat;
        try {
          stat = fs.statSync(path.join(rootDir, script));
        } catch (ex) {
          console.log(chalk.red.bold(script + ' doesn\'t exist.'));
          throw ex;
        }

        if (!stat.isFile()) {
          console.log(chalk.red.bold(script + ' is not a file.'));
          throw new Error(script + ' is not a file.');
        }
      });

      return swPrecache.write(path.join(rootDir, 'offline-worker.js'), {
        staticFileGlobs: staticFileGlobs,
        stripPrefix: rootDir,
        verbose: true,
        logger: console.log,
        importScripts: importScripts,
        cacheId: cacheId,
        ignoreUrlParametersMatching: config.ignoreUrlParametersMatching || [/./],
        maximumFileSizeToCacheInBytes: Infinity,
      });
    }));
  });
};
