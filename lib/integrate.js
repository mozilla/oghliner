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

var fs = require('fs');
var path = require('path');
var gutil = require('gulp-util');
var fse = require('fs-extra');

module.exports = function(config) {
  var dir = config.dir || './';

  return new Promise(function(resolve, reject) {
    fs.stat(dir, function(err, stat) {
      if (err) {
        reject(new Error(dir + ' doesn\'t exist or is not accessible.'));
        return;
      }

      if (!stat.isDirectory()) {
        reject(new Error(dir + ' isn\'t a directory.'));
        return;
      }

      fse.copy(path.join(path.dirname(__dirname), 'templates', 'app', 'scripts', 'offline-manager.js'),
               path.join(dir, 'offline-manager.js'), function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
};
