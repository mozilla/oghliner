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
var gulp = require('gulp');
var oghliner = require('./index.js');

gulp.task('default', ['build', 'offline']);

gulp.task('build', function(callback) {
  return gulp.src('app/**').pipe(gulp.dest('dist'));
});

gulp.task('configure', oghliner.configure);

gulp.task('deploy', oghliner.deploy);

gulp.task('offline', ['build'], function(callback) {
  oghliner.offline({
    rootDir: './dist/',
    fileGlobs: [
      '**/*.css',
      '**/*.html',
      // XXX It should be possible to include all JavaScript files
      // while excluding the worker itself, but sw-precache doesn't respect
      // exclude patterns.  We should fix that, but in the meantime,
      // we include JavaScript files from common subdirectories.
      // 'dist/**/*.js',
      // '!dist/offline-worker.js', // Don't cache the worker itself.
      'js/**/*.js',
      'scripts/**/*.js',
    ]
  }, callback);
});

gulp.task('serve', function () {
  connect.server({
    root: 'dist',
  });
});
