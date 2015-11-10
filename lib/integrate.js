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
var fse = require('fs-extra');
var cli = require('cli');
var chalk = require('chalk');

var spinnerMessage;

function startSpinner(message) {
  spinnerMessage = message;
  cli.spinner(message);
}

function stopSpinner(error) {
  var symbol = error ? chalk.bold.red('× ') : chalk.bold.green('✓ ');
  var result = error ? 'error' : 'done';
  cli.spinner(symbol + spinnerMessage + ' ' + result + '!\n', true);
}

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    var dir = config.dir || './';

    console.log('Integrating Oghliner into the app in the current directory…\n');

    startSpinner('Copying offline-manager.js to ' + dir + '…');

    fs.stat(dir, function(err, stat) {
      if (err) {
        reject(new Error(dir + ' doesn\'t exist or is not accessible.'));
        return;
      }

      if (!stat.isDirectory()) {
        reject(new Error(dir + ' isn\'t a directory.'));
        return;
      }

      var dest = path.join(dir, 'offline-manager.js');

      fse.copy(path.join(path.dirname(__dirname), 'templates', 'app', 'scripts', 'offline-manager.js'), dest, function(err) {
        if (err) {
          reject(err);
        } else {
          stopSpinner();

          console.log(
            'Oghliner has been integrated into the app!\n\n' +

            'The app needs to load the script offline-manager.js in order to register\n' +
            'the service worker that offlines the app. To load the script, add this line\n' +
            'to the app\'s HTML page(s)/template(s):\n\n' +
            chalk.bold('<script src="' + dest + '"></script>') + '\n\n' +
            'And commit the changes and push the commit to the origin/master branch:\n\n' +
            chalk.bold('git commit -m"integrate Oghliner" --all') + '\n' +
            chalk.bold('git push origin master') + '\n\n' +
            'Then you can offline and deploy the app using the ' + chalk.bold.italic('offline') + ' and ' + chalk.bold.italic('deploy') + ' commands.\n\n' +
            chalk.bold.blue('ℹ For more information about offlining and deployment, see:\n' +
            '    https://mozilla.github.io/oghliner/')
          );

          resolve();
        }
      });
    });
  }).catch(function(err) {
    stopSpinner(err);
    throw err;
  });
};
