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

var connect = require('gulp-connect');
var ghPages = require('gh-pages');
var gulp = require('gulp');
var oghliner = require('./index.js');
var packageJson = require('./package.json');
var path = require('path');
var swPrecache = require('sw-precache');

gulp.task('default', ['build']);

gulp.task('build', ['copy-app-to-dist', 'generate-service-worker']);

gulp.task('serve', function () {
  connect.server({
    root: 'dist',
  });
});

gulp.task('configure', oghliner.configure);

gulp.task('publish', function(callback) {
  if ('GH_TOKEN' in process.env) {
    // We're using a token to authenticate with GitHub, so we have to embed
    // the token into the repo URL (if it isn't already there).
    gitconfiglocal('./', function(error, config) {
      if (error) {
        callback(error);
        return;
      }

      if ('remote' in config && 'origin' in config.remote && 'url' in config.remote.origin) {
        var url = config.remote.origin.url;
        var match;
        if (match = url.match(/^git@github.com:([^/]+)\/([^.]+)\.git$/) ||
                    url.match(/^https:\/\/github.com\/([^/]+)\/([^.]+)\.git$/)) {
          url = 'https://' + process.env.GH_TOKEN + '@github.com/' + match[1] + '/' + match[2] + '.git';
        }

        ghPages.publish(path.join(__dirname, 'dist'), {
          repo: url,
        }, callback);
      } else {
        callback('repo has no origin url');
      }
    });
  } else {
    // We aren't using a token to authenticate with GitHub, so we don't have to
    // alter the repo URL.
    ghPages.publish(path.join(__dirname, 'dist'), callback);
  }
});

gulp.task('copy-app-to-dist', function(callback) {
  return gulp.src('app/**').pipe(gulp.dest('dist'));
});

gulp.task('generate-service-worker', ['copy-app-to-dist'], function(callback) {
  swPrecache.write(path.join('dist', 'offline-worker.js'), {
    cacheId: packageJson.name,
    staticFileGlobs: [
      'dist/**/*.css',
      'dist/**/*.html',
      // XXX It should be possible to include all JavaScript files
      // while excluding the worker itself, but sw-precache doesn't respect
      // exclude patterns.  We should fix that, but in the meantime,
      // we include JavaScript files from common subdirectories.
      // 'dist/**/*.js',
      // '!dist/offline-worker.js', // Don't cache the worker itself.
      'dist/js/**/*.js',
      'dist/scripts/**/*.js',
    ],
    stripPrefix: 'dist/',
  }, callback);
});
