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
var gutil = require('gulp-util');

module.exports = promisify(function(config, callback) {
  var dir = config.dir || './';

  if (!fs.existsSync(dir)) {
    throw new Error('The directory you\'ve specified doesn\'t exist');
  }

  var offlineManagerPath = path.join(path.dirname(__dirname), 'app', 'scripts', 'offline-manager.js');
  if (!fs.existsSync(offlineManagerPath)) {
    throw new Error('offline-manager.js doesn\'t exist');
  }

  var dest = path.join(dir, 'offline-manager.js');

  var srcStream = fs.createReadStream(offlineManagerPath);
  srcStream.pipe(fs.createWriteStream(dest));
  srcStream.on('end', function() {
    console.log(gutil.colors.blue(
      'Your app needs to load the script offline-manager.js in order to register the service\n' +
      'worker that offlines your app. To load the script, add this line to your app\'s HTML\n' +
      'page(s)/template(s):\n\n' +
      '\t<script src="' + path.join(dir, 'offline-manager.js') + '"></script>'
    ));

    callback();
  });
});
