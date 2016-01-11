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
var mocha = require('gulp-mocha');
var istanbul = require('gulp-istanbul');
var eslint = require('gulp-eslint');
var template = require('gulp-template');
var marked = require('marked');
var argv = require('yargs').argv;
var fs = require('fs-extra');
var karma = require('karma');

var oghliner = require('./index.js');

gulp.task('default', ['build', 'offline']);

gulp.task('build', ['build-app', 'build-tabzilla']);

gulp.task('build-app', ['copy-files'], function() {
  return gulp.src('dist/index.html')
    .pipe(template({
      content: marked(require('fs').readFileSync('README.md', 'utf8'))
    }))
    .pipe(gulp.dest('dist'));
});

gulp.task('copy-files', function() {
  return gulp.src('app/**').pipe(gulp.dest('dist'));
});

gulp.task('build-tabzilla', ['copy-files'], function() {
  return gulp.src('node_modules/mozilla-tabzilla/**/*.{css,png}').pipe(gulp.dest('dist/styles/tabzilla'));
});

gulp.task('configure', oghliner.configure);

gulp.task('deploy', function() {
  return oghliner.deploy({
    rootDir: 'dist',
    remote: argv.remote,
  });
});

gulp.task('offline', ['build'], function() {
  return oghliner.offline({
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

gulp.task('sw-test', function () {
  var testingDir = __dirname + '/testing';
  fs.ensureDirSync(testingDir);

  return oghliner.offline({
    rootDir: testingDir
  }).then(function () {
    return new Promise(function (fulfill) {
      var server = new karma.Server({
        configFile: __dirname + '/karma-sw.conf.js'
      });
      server.on('run_complete', fulfill);
      server.start();
    });
  });
});

gulp.task('pre-test', function () {
  return gulp.src(['lib/**/*.js'])
    .pipe(istanbul({ includeUntested: true }))
    .pipe(istanbul.hookRequire());
});

gulp.task('test', ['lint', 'pre-test'], function () {
  return gulp.src(argv.file ? argv.file : 'test/test*.js', {read: false})
    // gulp-mocha needs filepaths so you can't have any plugins before it
    .pipe(mocha())
    .pipe(istanbul.writeReports());
});

gulp.task('lint', function() {
  return gulp.src('lib/**').pipe(eslint({
    'rules':{
        'quotes': [1, 'single'],
        'semi': [1, 'always'],
        'comma-dangle': [1, 'always-multiline'],
        'quote-props': [1, 'as-needed']
    }
  })).pipe(eslint.format());
});
