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
var glob = require('glob');
var template = require('gulp-template');
var crypto = require('crypto');
var gulp = require('gulp');
var ghslug = promisify(require('github-slug'));

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

  // Remove the existing service worker, if any, so offliner doesn't include
  // it in the list of files to cache.
  try {
    fs.unlinkSync(path.join(rootDir, 'offline-worker.js'));
  } catch (ex) {
    // Only ignore the error if it's a 'file not found' error.
    if (!ex.code || ex.code !== 'ENOENT') {
      throw ex;
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
    var absoluteGlobs =
      fileGlobs.map(function (v) { return path.join(rootDir, v); });
    var files = flatGlobs(absoluteGlobs);
    var filesAndHashes = getFilesAndHashes(files, rootDir);
    var replacements = { resources: filesAndHashes, name: cacheId };

    var stream = gulp.src([__dirname + '/../templates/app/offline-worker.js'])
      .pipe(template(replacements))
      .pipe(conflict(rootDir))
      .pipe(gulp.dest(rootDir));

    stream.on('finish', function () { callback(); });
    stream.on('error', function (e) { callback(e); });
  });

  function flatGlobs(fileGlobs) {
    return Object.keys(fileGlobs.reduce(function (matchings, fileGlob) {
      fileGlob = fileGlob.replace(path.sep, '/');
      glob.sync(fileGlob, { nodir: true }).forEach(function (m) {
        matchings[m] = m;
      });
      return matchings;
    }, {}));
  }

  function getFilesAndHashes(files, stripPrefix) {
    return files
      .map(function (filepath) {
        var data = fs.readFileSync(filepath);
        var hash = getHash(data);
        return {
          filepath: filepath.replace(stripPrefix, function (match, offset) {
            return offset === 0 ? '' : match;
          }),
          hash: hash
        };
      });
  }

  function getHash(data) {
    var sha1 = crypto.createHash('sha1');
    sha1.update(data);
    return sha1.digest('hex');
  }

});
