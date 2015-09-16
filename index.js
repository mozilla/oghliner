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

var getGitHubToken = require('get-github-token');
var ghPages = require('gh-pages');
var gitconfiglocal = require('gitconfiglocal');
var path = require('path');
var swPrecache = require('sw-precache');
var readYaml = require('read-yaml');
var travisEncrypt = require('travis-encrypt');
var writeYaml = require('write-yaml');

// XXX Rename this to getSlug.
function getOrigin(callback) {
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
        callback(null, match[1] + '/' + match[2]);
        return;
      }
      callback('could not parse value of origin remote URL: ' + url);
      return;
    }

    callback('repo has no origin remote');
  });
}

function configure(callback) {
  getOrigin(function(err, origin) {
    if (err) {
      callback(err);
      return;
    }

    var note = 'Oghliner token for ' + origin;
    var url = 'https://github.com/mozilla/oghliner';

    getGitHubToken(['public_repo'], note, url, function(err, token) {
      if (err) {
        callback(err);
        return;
      }

      travisEncrypt(origin, 'GH_TOKEN=' + token, undefined, undefined, function (err, blob) {
        if (err) {
          callback(err);
          return;
        }

        var travisYml = readYaml.sync('.travis.yml');

        if (!('env' in travisYml)) {
          travisYml.env = {};
        }

        if (!('global' in travisYml.env)) {
          travisYml.env.global = [];
        }

        travisYml.env.global.push({ secure: blob });
        writeYaml.sync('.travis.yml', travisYml);
        callback();
      });
    });
  });
}

function offline(config, callback) {
  var rootDir = config.rootDir || './';
  var fileGlobs = config.fileGlobs || [];
  swPrecache.write(path.join(rootDir, 'offline-worker.js'), {
    staticFileGlobs: fileGlobs.map(function(v) { return path.join(rootDir, v) }),
    stripPrefix: rootDir,
    verbose: true,
  }, callback);
}

function deploy(config, callback) {
  var rootDir = 'rootDir' in config ? config.rootDir : '.';

  if ('GH_TOKEN' in process.env) {
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

        ghPages.publish(path.join(__dirname, rootDir), {
          // We can't log here because it would leak the GitHub token on Travis.
          // logger: console.log,
          repo: url,
        }, callback);
      } else {
        callback('repo has no origin url');
      }
    });
  } else {
    // We aren't using a token to authenticate with GitHub, so we don't have to
    // alter the repo URL.
    ghPages.publish(path.join(__dirname, rootDir), {
      logger: console.log,
    }, callback);
  }
}

module.exports = {
  configure: configure,
  deploy: deploy,
  offline: offline,
};
