/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

'use strict';

var connect = require('gulp-connect');
var gulp = require('gulp');
var oghp = require('offline-github-pages');

gulp.task('default', ['build', 'offline']);

gulp.task('build', function(callback) {
  return gulp.src('app/**').pipe(gulp.dest('dist'));
});

gulp.task('configure', oghp.configure);

gulp.task('deploy', function() {
  return oghp.deploy({
    rootDir: 'dist',
  });
});

gulp.task('offline', ['build'], function() {
  return oghp.offline({
    rootDir: 'dist/',
    fileGlobs: [
      'images/**',
      'index.html',
      'scripts/**',
      'styles/**',
    ],
  });
});

gulp.task('serve', function () {
  connect.server({
    root: 'dist',
  });
});
