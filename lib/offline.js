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
var promisify = require("promisify-node");

var fs = require('fs');
var path = require('path');
var swPrecache = require('sw-precache');
var gutil = require('gulp-util');
var ghslug = require('github-slug');

module.exports = promisify(function(config, callback) {
  var rootDir = config.rootDir || './';

  // Ensure root directory ends with slash so we strip leading slash from paths
  // of files to cache, so they're relative paths, and the offline worker
  // will match them regardless of whether the app is deployed to a top-level
  // directory for a custom domain (f.e. https://example.com/) or a subdirectory
  // of a GitHub Pages domain (f.e. https://mykmelez.github.io/example/).
  if (rootDir.lastIndexOf('/') !== rootDir.length -1) {
    rootDir = rootDir + "/";
  }

  var fileGlobs = config.fileGlobs || ['**/*'];

  // Remove the existing service worker, if any, so sw-precache doesn't include
  // it in the list of files to cache.
  try {
    fs.unlinkSync(path.join(rootDir, 'offline-worker.js'));
  } catch (ex) {
    // Only ignore the error if it's a 'file not found' error.
    if (!ex.code || ex.code !== 'ENOENT') {
      throw ex;
    }
  }

  ghslug('./', function(err, slug) {
    var cacheId = '';

    // Use the GitHub slug, or the name from package.json, or ''.
    if (err) {
      try {
        cacheId = JSON.parse(fs.readFileSync('packages.json')).name;
      } catch (ex) {
        // Ignore the error and use the default '' if there's an error while
        // reading the file or while parsing the JSON.
      }
    } else {
      cacheId = slug;
    }

    swPrecache.write(path.join(rootDir, 'offline-worker.js'), {
      staticFileGlobs: fileGlobs.map(function(v) { return path.join(rootDir, v) }),
      stripPrefix: rootDir,
      verbose: true,
      logger: gutil.log,
      importScripts: config.importScripts || [],
      cacheId: cacheId,
    }, callback);
  });
});
