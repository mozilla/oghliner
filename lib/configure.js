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
var promisify = require('promisify-node');

var childProcess = require('child_process');
var ghslug = promisify(require('github-slug'));
var promptly = require('promisified-promptly');
var readYaml = require('read-yaml');
var travisEncrypt = promisify(require('travis-encrypt'));
var writeYaml = require('write-yaml');

// Uncomment this to record network requests/responses when writing automated
// tests.
//
// NB: if we ever implement live tests against real GitHub repositories,
// then we should enable this by default when those tests are running to help
// debug the tests.
//
// However, note that we can't use this to debug test runs against the mocks,
// since enabling this feature disables the mocks.  To debug such tests, see
// https://github.com/pgte/nock#debugging / https://github.com/pgte/nock#logging.
//
// var nock = require('nock');
// nock.recorder.rec();

var Travis = require('travis-ci');
var travis = new Travis({ version: '2.0.0' });

var GitHub = require('github');
var github = new GitHub({
  version: '3.0.0',
  // debug: true,
  protocol: 'https',
  headers: {
    'user-agent': 'Oghliner',
  },
});

// Wrap individual methods for complex APIs that I'm scared to wrap in toto.
github.authorization.create = promisify(github.authorization.create);
github.authorization.delete = promisify(github.authorization.delete);
github.authorization.getAll = promisify(github.authorization.getAll);
travis.authenticate = promisify(travis.authenticate);
travis.hooks.get = promisify(travis.hooks.get);
travis.users.get = promisify(travis.users.get);
travis.users.sync.post = promisify(travis.users.sync.post);

// The URL of this project, which we specify in the note_url field
// when creating GitHub tokens.
var noteUrl = 'https://github.com/mozilla/oghliner';

module.exports = function() {
  // Save some values in the closure so we can use them across the promise chain
  // without having to pass them down the chain.
  var slug, user, repo, username, password, otpCode, token, tempToken, tempTokenId;

  // XXX Will users sometimes want to configure Travis to deploy changes to a
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
        password: password,
      });
      process.stdout.write('\n');
    });
  }

  function promptOtpCode() {
    if (otpCode) {
      process.stdout.write(
        'Your authentication code is incorrect or has expired.\n' +
        'Please try again.\n\n'
      );
    } else {
      process.stdout.write(
        '\n' +
        'You\'re using two-factor authentication with GitHub.\n' +
        'Please enter the code provided by your authentication software.\n' +
        '\n'
      );
    }
    return promptly.prompt('Auth Code: ')
    .then(function(res) {
      otpCode = res;
      process.stdout.write('\n');
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
        'The username and/or password you entered is incorrect.\n' +
        'Please try again…\n\n'
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
      });
    })
    .catch(function(err) {
      var error = JSON.parse(err.message);
      if (error.message === 'Validation Failed' && error.errors[0].code === 'already_exists') {
        // XXX Should we prompt the user to confirm the deletion?
        // Perhaps they don't want to lose the existing token.
        process.stdout.write(
          'You already have the GitHub token "' + note + '".\n' +
          'Deleting it…\n'
        );
        return getTokenId(note, noteUrl).then(deleteToken).then(function() {
          return createToken(scopes, note, noteUrl);
        });
      }
      throw err;
    });
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
      });
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
      });
    });
  }

  return ghslug('./')
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
      '\n' +
      'Configuring ' + slug + ' to auto-deploy to GitHub Pages using Travis CI…\n' +
      '\n' +
      'To authorize Travis to push to the repository, and to check the status\n' +
      'of the repository in Travis, I\'ll need your GitHub username and password\n' +
      '(and two-factor authentication code, if appropriate) to create GitHub\n' +
      'personal access tokens.\n' +
      '\n' +
      'For more information about tokens, see: https://github.com/settings/tokens\n' +
      '\n'
    );
  })

  .then(promptCredentials)

  .then(function() {
    // NB: The GitHub authorization API always requires basic authentication,
    // so it isn't possible to request a token that gives us access to it.
    // Otherwise we'd do that first and then use that token to get the others.

    process.stdout.write('Creating GitHub token for Travis to push to the repository…\n');

    return createToken(['public_repo'], 'Oghliner token for ' + slug, noteUrl)
    .then(function(res) {
      token = res.token;
    });
  })

  .then(function() {
    // Create a temporary GitHub token to get a Travis token that we can use
    // to activate the repository in Travis.  We only need this GitHub token
    // to get the Travis token, so we delete it afterward.

    process.stdout.write('Creating temporary GitHub token for getting Travis token…\n');

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
    process.stdout.write('Getting Travis token…\n');

    return travis.authenticate({ github_token: tempToken })
    .then(function(res) {
      // console.log("Travis token: " + res.access_token);

      // We don't need to save the Travis token, because the Travis module
      // caches it in the Travis instance.
    });
  })

  .then(function() {
    // Now that we have the Travis token, delete the temporary GitHub token.

    process.stdout.write('Deleting temporary GitHub token for getting Travis token…\n');

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

    function travisIsSyncing() {
      return travis.users.get()
      .then(function(res) {
        return res.user.is_syncing;
      });
    }

    function travisAwaitSyncing() {
      process.stdout.write('Waiting for Travis to finish syncing…\n');
      return new Promise(function(resolve, reject) { setTimeout(resolve, 5000); })
      .then(travisIsSyncing)
      .then(function(isSyncing) {
        if (isSyncing) {
          return travisAwaitSyncing();
        }
      });
    }

    return ensureActiveInTravis()
    .catch(function(err) {
      if (err.message === 'repository not found') {
        process.stdout.write('I didn\'t find your repository in Travis.  Syncing Travis with GitHub…\n');
        return travis.users.sync.post()
        .catch(function(err) {
          // Ignore the exception if Travis is already syncing. The status code
          // of the error is 409 and its message is 'Sync already in progress.
          // Try again later.', but instead of relying on that we simply perform
          // an explicit check.
          return travisIsSyncing().then(function(isSyncing) {
            if (!isSyncing) {
              // Check again if it's active on Travis (in case it finished syncing
              // right before we checked)
              return ensureActiveInTravis().catch(function() {
                // Throw the original error.
                throw err;
              });
            }
          });
        })
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
        process.stdout.write('Your repository has been activated in Travis!\n');
      } else {
        process.stdout.write(
          'Travis failed to activate your repository, so you\'ll need to do so\n' +
          'manually in Travis by going to https://travis-ci.org/profile and pressing\n' +
          'the toggle button next to the name of the repository.\n\n'
        );
      }
    }
  })

  .then(function() {
    process.stdout.write('Encrypting GitHub token…\n');
    return travisEncrypt(slug, 'GH_TOKEN=' + token, undefined, undefined);
  })

  .then(function(blob) {
    process.stdout.write('Writing encrypted GitHub token to .travis.yml file…\n');

    var travisYml;
    try {
      travisYml = readYaml.sync('.travis.yml');
    } catch(err) {
      if (err.code === 'ENOENT') {
        process.stdout.write('You don\'t have a .travis.yml file.  Creating one for you…\n');
        process.stdout.write('Setting "language" to "node_js"…\n');
        process.stdout.write('Setting "node_js" to "[ "0.12" ]"…\n');
        process.stdout.write('Setting "install" to "npm install"…\n');
        process.stdout.write('Setting "script" to "gulp"…\n');
        travisYml = {
          language: 'node_js',
          node_js: [ '0.12' ],
          install: 'npm install',
          script: 'gulp',
        };
      } else {
        throw err;
      }
    }

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
    if (!travisYml.before_script.some(function(v) { return v.search(/git +config +--global +user\.name/) !== -1; })) {
      // We use the name Travis CI to make it clear that it's Travis committing
      // the changes.
      var name = 'Travis CI';
      command = 'git config --global user.name "' + name + '"';
      process.stdout.write('Adding before_script command: ' + command + '…\n');
      travisYml.before_script.push(command);
    }
    if (!travisYml.before_script.some(function(v) { return v.search(/git +config +--global +user\.email/) !== -1; })) {
      var email = childProcess.execSync('git config --global user.email').toString().trim();
      // We use the current user's email address so GitHub associates the change
      // with the user whose credentials authorize Travis to deploy the changes.
      command = 'git config --global user.email "' + email + '"';
      process.stdout.write('Adding before_script command: ' + command + '…\n');
      travisYml.before_script.push(command);
    }

    if (!('after_success' in travisYml) || travisYml.after_success === null) {
      travisYml.after_success = [];
    }

    var defaultRemote = 'origin';
    var remotes = childProcess.execSync('git remote').toString().split('\n').slice(0, -1);
    if (remotes.indexOf('upstream') !== -1) {
      defaultRemote = 'upstream';
    }

    var promise;
    if (remotes.length === 1) {
      promise = Promise.resolve(remotes[0]);
    } else {
      promise = promptly.prompt('Repository remote [default: ' + defaultRemote + ']: ', { default: defaultRemote });
    }

    return promise.then(function(remote) {
      command = 'echo "travis_fold:end:after_success" && ' +
                '[ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && ' +
                'echo "Deploying…" && gulp deploy --remote ' + remote;
      if (!travisYml.after_success.some(function(v) { return v.indexOf(command) !== -1; })) {
        process.stdout.write('Adding after_success command: ' + command + '…\n');
        travisYml.after_success.push(command);
      }

      writeYaml.sync('.travis.yml', travisYml);
    });
  })

  .then(function() {
    process.stdout.write(
      '\n' +
      'You\'re ready to auto-deploy using Travis!  Just commit the changes\n' +
      'in .travis.yml and push the commit to the origin/master branch:\n' +
      '\n' +
      'git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml\n' +
      'git push origin master\n' +
      '\n' +
      'Then visit https://travis-ci.org/' + slug + '/builds to see the build status.\n' +
      '\n'
    );
  });
};
