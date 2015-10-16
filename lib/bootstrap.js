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

var gulp = require('gulp');
var conflict = require('gulp-conflict');
var template = require('gulp-template');
var install = require('gulp-install');
var rename = require('gulp-rename');
var promptly = require('promisified-promptly');
var gitconfiglocal = require('gitconfiglocal');
var through2 = require('through2');

function gitUrl(dir) {
  return new Promise(function (resolve, reject) {
    gitconfiglocal(dir, function(error, config) {
      if (error) {
        resolve(null);
        return;
      }
      if ('remote' in config && 'origin' in config.remote && 'url' in config.remote.origin) {
        resolve(config.remote.origin.url);
      }
      resolve(null);
    })
  });
}

function templateConfigPrompt(defaultConfig) {
  gutil.log('The current template configuration is:')
  gutil.log(templateConfigToString(defaultConfig));

  return promptly.confirm('Would you like to change any of the above configuration values?').then(function(fillInConfig) {
    if (!fillInConfig) {
      return defaultConfig;
    }

    var config = {};

    function prompt(message, prop) {
      return promptly.prompt(message, { default: defaultConfig[prop] }).then(function(answer) {
        config[prop] = answer;
      });
    }

    return prompt('Project name: ', 'name')
    .then(prompt.bind(null, 'Repository URL: ', 'repository'))
    .then(prompt.bind(null, 'Description: ', 'description'))
    .then(prompt.bind(null, 'License: ', 'license'))
    .then(function() {
      return config;
    });
  });
}

function templateConfigOption(defaultConfig, config) {
  for (var key in config) {
    if (typeof defaultConfig[key] === 'undefined') {
      throw new Error('Unrecognized template option: ' + key);
    }
    defaultConfig[key] = config[key];
  }
  return defaultConfig;
}

function templateConfigToString(config) {
  var out = [];
  for (var key in config) {
    out.push(key + ': ' + config[key]);
  }
  return out.join('\n');
}

function getDefaultTemplateConfig(dir) {
  var config = {
    name: 'oghliner-template-app',
    repository: 'https://oghliner-template-app.git',
    description: 'A template app bootstrapped with oghliner.',
    license: 'Apache-2.0',
  };

  return gitUrl(dir).then(function(url) {
    if (url) {
      config.repository = url;
      // Try to fill in the project named based on the repo url.
      if (url.substr(-4, 4) === '.git') {
        config.name = url.substring(url.lastIndexOf('/') + 1, url.length - 4);
      }
    }
    return config;
  })
}

function sink() {
  return through2.obj(function (file, enc, callback) {
    callback();
  });
}

module.exports = function(config) {
  config = config || {};

  var rootDir = config.rootDir ? config.rootDir : '.';
  return getDefaultTemplateConfig(rootDir)
    .then(function(defaultConfig) {
      if (config.template) {
        return templateConfigOption(defaultConfig, config.template);
      }
      return templateConfigPrompt(defaultConfig);
    })
    .then(function(templateConfig) {
      return new Promise(function(resolve, reject) {
        var contents = __dirname + '/../templates/**';
        var workerTemplate = __dirname + '/../templates/app/offliner-worker.js';
        var stream = gulp.src([contents, '!' + workerTemplate])
          .pipe(rename(function (path) {
            // NPM can't include a .gitignore file so we have to rename it.
            if (path.basename === 'gitignore') {
              path.basename = '.gitignore';
            }
          }))
          .pipe(template(templateConfig))
          .pipe(conflict(rootDir))
          .pipe(gulp.dest(rootDir))
          .pipe(install())
          .pipe(sink()); // Sink is required to trigger the finish event with install.
        stream.on('finish', resolve);
        stream.on('error', reject);
      });
    });
};
