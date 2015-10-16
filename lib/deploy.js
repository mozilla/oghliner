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

var childProcess = require('child_process');
var ghPages = require('gh-pages');
var gitconfiglocal = require('gitconfiglocal');
var gutil = require('gulp-util');

var fs = require('fs');
var path = require('path');

module.exports = promisify(function(config, callback) {
  config = config || {};
  var ghPagesConfig = {};
  var rootDir = config.rootDir ? config.rootDir : '.';
  var cloneDir = config.cloneDir ? config.cloneDir : null;

  var commitMessage = config.message || (function() {
    var spawn = childProcess.spawnSync('git', ['log', '--format=%B', '-n', '1']);
    var errorText = spawn.stderr.toString().trim();

    if (errorText) {
      gutil.log('Fatal error from `git log`.  You must have one commit before deploying.');
      throw new Error(errorText);
    }
    else {
      return spawn.stdout.toString().trim();
    }
  })();

  gutil.log('Deploying "' + commitMessage + '"');

  if (cloneDir) {
    ghPagesConfig.clone = cloneDir;
  }

  ghPagesConfig.commitMessage = commitMessage;

  if (fs.existsSync(path.join(rootDir, 'node_modules'))) {
    gutil.log(gutil.colors.red('With the current value of the \'rootDir\' option, the entire node_modules directory is going to be deployed. Please make sure this is what you really want.'));
  }

  if ('GH_TOKEN' in process.env) {
    // We can't log here because it would leak the GitHub token on Travis.
    // We can't use the gh-pages silent option because it makes error messages
    // less informative (https://github.com/mozilla/oghliner/pull/58#issuecomment-147550610).
    // ghPagesConfig.logger = gutil.log;

    // We're using a token to authenticate with GitHub, so we have to embed
    // the token into the repo URL (if it isn't already there).
    gitconfiglocal('./', function(error, config) {
      if (error) {
        callback(error);
        return;
      }

      if ('remote' in config && 'origin' in config.remote && 'url' in config.remote.origin) {
        var url = config.remote.origin.url;
        var match;
        if (match = url.match(/^git@github.com:([^/]+)\/([^.]+)\.git$/) ||
                    url.match(/^https:\/\/github.com\/([^/]+)\/([^.]+)\.git$/)) {
          url = 'https://' + process.env.GH_TOKEN + '@github.com/' + match[1] + '/' + match[2] + '.git';
        }
        ghPagesConfig.repo = url;
        ghPages.publish(rootDir, ghPagesConfig, callback);
      } else {
        callback('repo has no origin url');
      }
    });
  } else {
    // We aren't using a token to authenticate with GitHub, so we don't have to
    // alter the repo URL.  And we can log, since we won't leak a GitHub token.
    ghPagesConfig.logger = gutil.log;
    ghPages.publish(rootDir, ghPagesConfig, callback);
  }
});
