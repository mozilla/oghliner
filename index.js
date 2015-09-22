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
var path = require('path');
var promptly = require('promptly');
var swPrecache = require('sw-precache');
var readYaml = require('read-yaml');
var travisEncrypt = promisify(require('travis-encrypt'));
var writeYaml = require('write-yaml');

var Travis = require('travis-ci');
var travis = new Travis({ version: '2.0.0' });

var GitHub = require('github');
var github = new GitHub({
  version: "3.0.0",
  // debug: true,
  protocol: "https", // XXX Determine if this is already the default.
  headers: {
    "user-agent": "Oghliner",
  },
});

// promisify should be able to wrap the entire promptly API
// via promisify(promptly), but that didn't seem to work, so here
// we wrap the individual methods we use.
promptly.prompt = promisify(promptly.prompt);
promptly.password = promisify(promptly.password);

// Wrap individual methods for complex APIs that I'm scared to wrap in toto.
github.authorization.create = promisify(github.authorization.create);
github.authorization.delete = promisify(github.authorization.delete);
github.authorization.getAll = promisify(github.authorization.getAll);
travis.authenticate = promisify(travis.authenticate);
travis.hooks.get = promisify(travis.hooks.get);
travis.users.get = promisify(travis.users.get);
travis.users.sync.post = promisify(travis.users.sync.post);

/**
 * Get the slug (GitHub username/repo combination) for the 'origin' remote
 * in the repository that contains the current working directory.
 * XXX Replace with github-slug module?
 */
function getSlug(callback) {
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
getSlug = promisify(getSlug);

function configure(callback) {
  process.stdout.write(
    '\n' +
    'Oghliner will configure your repository to automatically deploy your app\n' +
    'to GitHub Pages using Travis CI.\n' +
    '\n'
  );

  // The URL of this project, which we specify in the note_url field
  // when creating GitHub tokens.
  var noteUrl = 'https://github.com/mozilla/oghliner';

  // Save some values in the closure so we can use them across the promise chain
  // without having to pass them down the chain.
  var slug, user, repo, username, password, otpCode, token, tempToken, tempTokenId;

  // Will users sometimes want to configure Travis to deploy changes to a
  // non-"origin" repository?  For example, origin is mykmelez/test-app, but I
  // want to configure Travis to deploy changes to mozilla/test-app, which has
  // a different remote name (like upstream).  If so, then we'll need to prompt
  // the user to choose the remote for which to configure deployment. For now,
  // though, we assume they are configuring the origin remote.

  function promptCredentials() {
    return promptly.prompt('Username: ', { default: username })
    .then(function(res) {
      username = res;
      return promptly.password('Password: ');
    })
    .then(function(res) {
      password = res;
      github.authenticate({
        type: 'basic',
        username: username,
        password: password
      });
    });
  }

  function promptOtpCode() {
    if (otpCode) {
      process.stdout.write(
        'Your authentication code is incorrect or has expired.  Please try again.\n' +
        '\n'
      );
    } else {
      process.stdout.write(
        'You\'re using two-factor authentication with GitHub.  Please enter the code\n' +
        'provided by your authentication software.\n' +
        '\n'
      );
    }
    return promptly.prompt('Auth Code: ')
    .then(function(res) {
      otpCode = res;
    });
  }

  function handleCredentialErrors(err) {
    var error = JSON.parse(err.message);

    if (error.message === 'Bad credentials') {
      // We can say this because we know that the configuration flow prompts
      // the user to enter their credentials before doing anything that might
      // end up in this error handler.  So if we see "Bad credentials" here,
      // then we know the user entered them incorrectly.
      process.stdout.write(
        'The username and/or password you entered is incorrect.  Please try again…\n' +
        '\n'
      );
      return promptCredentials();
    }

    if (error.message === 'Must specify two-factor authentication OTP code.') {
      // This error is the same whether the user hasn't specified a code yet,
      // has specified an incorrect code, or has specified an expired one.
      // Which is ok, since in all cases our response is to (re)prompt them
      // to specify one.
      return promptOtpCode();
    }

    throw err;
  }

  function createToken(scopes, note, noteUrl) {
    return github.authorization.create({
      scopes: scopes,
      note: note,
      note_url: noteUrl,
      headers: otpCode ? { 'X-GitHub-OTP': otpCode } : {},
    })
    .catch(function(err) {
      return handleCredentialErrors(err)
      .then(function() {
        return createToken(scopes, note, noteUrl);
      })
    })
    .catch(function(err) {
      var error = JSON.parse(err.message);
      if (error.message === 'Validation Failed' && error.errors[0].code === 'already_exists') {
        // XXX Should we prompt the user to confirm the deletion?
        // Perhaps they don't want to lose the existing token.
        process.stdout.write(
          'You already have the GitHub token "' + note + '".\n' +
          'Deleting it…\n' +
          '\n'
        );
        return getTokenId(note, noteUrl).then(deleteToken).then(function() {
          return createToken(scopes, note, noteUrl);
        });
      }
      throw err;
    })
  }

  function getTokenId(note, noteUrl, page) {
    page = page || 1;

    return github.authorization.getAll({
      page: page,
      headers: otpCode ? { 'X-GitHub-OTP': otpCode } : {},
    })
    .then(function(res) {
      for (var i = 0; i < res.length; i++) {
        // XXX Should we ensure |res[i].note_url === noteUrl| too?
        if (res[i].note === note) {
          return res[i].id;
        }
      }
      // XXX How do we determine that we've reached the end of the pages?
      return getTokenId(note, noteUrl, ++page);
    })
    .catch(function(err) {
      return handleCredentialErrors(err)
      .then(function() {
        return getTokenId(note, noteUrl, page);
      })
    });
  }

  function deleteToken(id) {
    return github.authorization.delete({
      id: id,
      headers: otpCode ? { 'X-GitHub-OTP': otpCode } : {},
    })
    .catch(function(err) {
      return handleCredentialErrors(err)
      .then(function() {
        return deleteToken(id);
      })
    });
  }

  getSlug()

  .then(function(res) {
    slug = res;
    var slugParts = slug.split('/');
    user = slugParts[0];
    repo = slugParts[1];

    // Set the username to the value of the user half of the slug to provide
    // a default value when prompting the user for their username.
    // XXX Figure out if user and username will always be the same and, if so,
    // consider never even prompting the user to specify their username.
    username = user;

    process.stdout.write(
      'The "origin" remote of your repository is "' + slug + '".\n' +
      '\n' +
      'Make sure Travis knows about your repository by going to https://travis-ci.org/profile\n' +
      'and pressing the Sync button if it isn\'t already in the list of your repositories.\n' +
      '\n' +
      'Requesting a GitHub personal access token that Travis will use\n' +
      'to deploy your app.  In order to get the token, I need your username\n' +
      'and password (and two-factor authentication code, if appropriate).\n' +
      '\n' +
      'For more information about personal access tokens or to view the entry\n' +
      'for the token I create, see https://github.com/settings/tokens.\n' +
      '\n'
    );
  })

  .then(promptCredentials)

  .then(function() {
    // NB: The GitHub authorization API always requires basic authentication,
    // so it isn't possible to request a token that gives us access to it.
    // Otherwise we'd do that first and then use that token to get the others.

    process.stdout.write(
      '\n' +
      'Creating permanent GitHub token for Travis to deploy to GitHub Pages…\n' +
      '\n'
    );

    return createToken(['public_repo'], 'Oghliner token for ' + slug, noteUrl)
    .then(function(res) {
      token = res.token;
    });
  })

  .then(function() {
    // Create a temporary GitHub token to get a Travis token that we can use
    // to activate the repository in Travis.  We only need this GitHub token
    // to get the Travis token, so we delete it afterward.

    process.stdout.write(
      '\n' +
      'Creating temporary GitHub token for authenticating with Travis…\n' +
      '\n'
    );

    return createToken(['read:org', 'user:email', 'repo_deployment', 'repo:status', 'write:repo_hook'],
                       'temporary Oghliner token to get Travis token for ' + slug, noteUrl)
    .then(function(res) {
      tempToken = res.token;

      // Store the ID of the temporary GitHub token so we can delete it
      // after we finish using it to get the Travis token.
      tempTokenId = res.id;
    });
  })

  .then(function() {
    process.stdout.write(
      '\n' +
      'Authenticating with Travis…\n' +
      '\n'
    );

    return travis.authenticate({ github_token: tempToken })
    .then(function(res) {
      // console.log("Travis token: " + res.access_token);

      // We don't need to save the Travis token, because the Travis module
      // caches it in the Travis instance.
    });
  })

  .then(function() {
    // Now that we have the Travis token, delete the temporary GitHub token.

    process.stdout.write(
      '\n' +
      'Deleting temporary GitHub token for authenticating with Travis…\n' +
      '\n'
    );

    return deleteToken(tempTokenId);
  })

  .then(function() {
    function ensureActiveInTravis() {
      process.stdout.write('Checking the status of your repository in Travis…\n');
      return travis.hooks.get()
      .then(function(res) {
        var hook;
        for (var i = 0; i < res.hooks.length; i++) {
          hook = res.hooks[i];
          if (hook.owner_name === user && hook.name === repo) {
            if (hook.active) {
              process.stdout.write('Good news, your repository is already active in Travis!\n');
              return;
            }
            process.stdout.write('Your repository isn\'t active in Travis yet.  Activating it…\n');
            return promisify(travis.hooks(hook.id).put)({ hook: { active: true } });
          }
        }
        throw new Error('repository not found');
      });
    }

    function travisAwaitSyncing() {
      return travis.users.get()
      .then(function(res) {
        if (res.user.is_syncing) {
          process.stdout.write('Waiting for Travis to finish syncing…\n');
          return new Promise(function(resolve, reject) { setTimeout(resolve, 5000) })
          .then(travisAwaitSyncing);
        }
      });
    }

    return ensureActiveInTravis()
    .catch(function(err) {
      if (err.message === 'repository not found') {
        process.stdout.write('I didn\'t find your repository in Travis.  Making Travis sync with GitHub…\n');
        return travis.users.sync.post()
        .then(travisAwaitSyncing)
        .then(ensureActiveInTravis);
      }
      throw err;
    });
  })

  .then(function(res) {
    // We'll only get a *res* argument if the previous step requested activation
    // from Travis.  If the repository was already active, this step is a noop.
    if (res) {
      if (res.result) {
        process.stdout.write(
          '\n' +
          'Your repository has been activated in Travis!\n' +
          '\n'
        );
      } else {
        process.stdout.write(
          '\n' +
          'Travis failed to activate your repository, so you\'ll need to do so manually\n' +
          'in Travis by going to https://travis-ci.org/profile and pressing the toggle button\n' +
          'next to the name of the repository.\n' +
          '\n'
        );
      }
    }
  })

  .then(function() {
    process.stdout.write(
      '\n' +
      'Next I\'ll encrypt the GitHub token with Travis\'s public key so I can add the token\n' +
      'to the Travis configuration without leaking it in public build logs…\n' +
      '\n'
    );

    return travisEncrypt(slug, 'GH_TOKEN=' + token, undefined, undefined);
  })

  .then(function(blob) {
    process.stdout.write(
      'I encrypted the token. Next I\'ll write it to the Travis configuration…\n' +
      '\n'
    );

    var travisYml = readYaml.sync('.travis.yml');

    if (!('env' in travisYml) || travisYml.env === null) {
      travisYml.env = {};
    }

    if (!('global' in travisYml.env) || travisYml.env.global === null) {
      travisYml.env.global = [];
    }

    travisYml.env.global.push({ secure: blob });

    // Git requires user.name and user.email to be set, and we need to set them
    // globally, since the gh-pages module re-clones the repository, and values
    // we set locally will only apply to the original clone that Travis creates.
    if (!('before_script' in travisYml) || travisYml.before_script === null) {
      travisYml.before_script = [];
    }
    var command;
    if (!travisYml.before_script.some(function(v) { return v.search(/git +config +--global +user\.name/) !== -1 })) {
      // We use the name Travis CI to make it clear that it's Travis committing
      // the changes.
      var name = 'Travis CI';
      command = 'git config --global user.name "' + name + '"';
      process.stdout.write(
        'Adding before_script: ' + command + '\n' +
        '\n'
      );
      travisYml.before_script.push(command);
    }
    if (!travisYml.before_script.some(function(v) { return v.search(/git +config +--global +user\.email/) !== -1 })) {
      var email = childProcess.execSync('git config --global user.email').toString().trim();
      // We use the current user's email address so GitHub associates the change
      // with the user whose credentials authorize Travis to deploy the changes.
      command = 'git config --global user.email "' + email + '"';
      process.stdout.write(
        'Adding before_script: ' + command + '\n' +
        '\n'
      );
      travisYml.before_script.push(command);
    }

    writeYaml.sync('.travis.yml', travisYml);
  })

  .then(function() {
    process.stdout.write(
      'I wrote the encrypted token to the Travis configuration.  You\'re ready\n' +
      'to auto-deploy using Travis!  Just commit the change to your "master" branch,\n' +
      'push the change back to the origin remote, and then visit\n' +
      'https://travis-ci.org/' + slug + '/builds to see the build status.\n' +
      '\n' +
      'If the build is successful, the "after_success" build step should show\n' +
      'that Travis deployed your app to GitHub Pages.  It should look like this:\n' +
      '\n' +
      '$ [ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && gulp deploy\n' +
      '\n'
    );
  })

  .catch(function(err) {
    callback(err);
  })

  .done(function() {
    callback();
  });

}

function offline(config, callback) {
  var rootDir = config.rootDir || './';
  var fileGlobs = config.fileGlobs || ['**/*'];
  swPrecache.write(path.join(rootDir, 'offline-worker.js'), {
    staticFileGlobs: fileGlobs.map(function(v) { return path.join(rootDir, v) }),
    stripPrefix: rootDir,
    verbose: true,
  }, callback);
}

function deploy(config, callback) {
  config = config || {};

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

        ghPages.publish(rootDir, {
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
    ghPages.publish(rootDir, {
      logger: console.log,
    }, callback);
  }
}

module.exports = {
  configure: configure,
  deploy: deploy,
  offline: offline,
};
