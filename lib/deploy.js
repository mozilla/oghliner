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

var childProcess = require('child_process');
var ghPages = require('gh-pages');
var gitRemoteUrl = require('git-remote-url');
var chalk = require('chalk');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var glob = require('glob');
var temp = require('temp').track();
var cli = require('cli');

function getCommitMessage() {
  var spawn = childProcess.spawnSync('git', ['log', '--format=%B', '-n', '1']);
  var errorText = spawn.stderr.toString().trim();

  if (errorText) {
    process.stdout.write(chalk.red.bold('✗ Fatal error from `git log`.  You must have one commit before deploying.\n'));
    throw new Error(errorText);
  }

  return spawn.stdout.toString().trim();
}

var lastMessage;
function ghPagesLogger(message) {
  if (lastMessage) {
    cli.spinner(chalk.green.bold('✓ ') + lastMessage + '… done!', true);
  }

  cli.spinner('  ' + message);
  lastMessage = message;
}

module.exports = function(config) {
  return new Promise(function(resolve, reject) {
    config = config || {};
    var ghPagesConfig = {};
    var remote = config.remote ? config.remote : 'origin';
    var rootDir = config.rootDir ? config.rootDir : '.';
    var cloneDir = config.cloneDir ? config.cloneDir : null;

    if (config.fileGlobs) {
      var dir = temp.mkdirSync('oghliner');

      config.fileGlobs.map(function(v) {
        return path.join(rootDir, v);
      }).forEach(function(globPattern) {
        glob.sync(globPattern.replace(path.sep, '/')).forEach(function(file) {
          fse.copySync(file, path.join(dir, file));
        });
      });

      rootDir = dir;
    }

    var commitMessage = config.message;
    if (!commitMessage) {
      try {
        commitMessage = getCommitMessage();
      } catch (ex) {
        reject(ex);
        return;
      }
    }

    process.stdout.write('Deploying "' + commitMessage.split('\n')[0] + '" to GitHub Pages…\n');

    if (cloneDir) {
      ghPagesConfig.clone = cloneDir;
    }

    ghPagesConfig.remote = remote;
    ghPagesConfig.commitMessage = commitMessage;

    fs.stat(path.join(rootDir, 'node_modules'), function(err, stat) {
      if (!err && stat.isDirectory()) {
        process.stdout.write(chalk.yellow.bold(
          '⚠ With the current value of the \'rootDir\' option, the entire node_modules\n' +
          '  directory will be deployed.  Please make sure this is what you really want.\n'
        ));
      }

      gitRemoteUrl('./', remote).then(function(url) {
        // We can't log on Travis because it would leak the GitHub token.
        // We can't use the gh-pages silent option because it makes error messages
        // less informative (https://github.com/mozilla/oghliner/pull/58#issuecomment-147550610).
        ghPagesConfig.logger = ('GH_TOKEN' in process.env) ? function() {} : ghPagesLogger;

        if ('GH_TOKEN' in process.env) {
          var match;
          if (match = url.match(/^git@github.com:([^/]+)\/([^.]+)\.git$/) ||
                      url.match(/^https:\/\/github.com\/([^/]+)\/([^.]+)\.git$/)) {
            url = 'https://' + process.env.GH_TOKEN + '@github.com/' + match[1] + '/' + match[2] + '.git';
          }

          ghPagesConfig.repo = url;
        }

        ghPages.publish(rootDir, ghPagesConfig, function(err) {
          if (lastMessage) {
            cli.spinner(chalk.green.bold('✓ ') + lastMessage + '… done!\n', true);
          }

          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }, reject);
    });
  });
};
