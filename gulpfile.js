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

gulp.task('publish', ['build'], function(callback) {
  ghPages.publish(path.join(__dirname, 'dist'), callback);
});

gulp.task('copy-app-to-dist', function(callback) {
  return gulp.src('app/**').pipe(gulp.dest('dist'));
});

gulp.task('generate-service-worker', ['copy-app-to-dist'], function(callback) {
  swPrecache.write(path.join('dist', 'ophliner-worker.js'), {
    cacheId: packageJson.name,
    staticFileGlobs: [
      'dist/**/*.css',
      'dist/**/*.html',
      'dist/**/*.js',
    ],
    stripPrefix: 'dist/',
  }, callback);
});
