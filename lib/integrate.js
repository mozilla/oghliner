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

var fs = promisify(require('fs'));
var path = require('path');
var gutil = require('gulp-util');

function copyFile(src, dest) {
  return new Promise(function(resolve, reject) {
    var srcStream = fs.createReadStream(src);

    srcStream.pipe(fs.createWriteStream(dest));

    srcStream.on('error', reject);

    srcStream.on('end', function() {
      console.log(gutil.colors.blue(
        'Your app needs to load the script offline-manager.js in order to register the service\n' +
        'worker that offlines your app. To load the script, add this line to your app\'s HTML\n' +
        'page(s)/template(s):\n\n' +
        '\t<script src="' + dest + '"></script>'
      ));

      resolve();
    });
  });
}

module.exports = function(config) {
  var dir = config.dir || './';

  return fs.stat(dir).then(function(stat) {
    if (!stat.isDirectory()) {
      throw new Error(dir + ' isn\'t a directory.');
    }

    return copyFile(path.join(path.dirname(__dirname), 'app', 'scripts', 'offline-manager.js'),
                    path.join(dir, 'offline-manager.js'));
  }, function() {
    throw new Error(dir + ' doesn\'t exist.');
  });
};
