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

var chalk = require('chalk');
var childProcess = require('child_process');
var cli = require('cli');
var ghslug = promisify(require('github-slug'));
var promptly = require('promisified-promptly');
var readYaml = require('read-yaml');
var travisEncrypt = promisify(require('travis-encrypt'));
var writeYaml = require('write-yaml');
var gitRemoteUrl = require('git-remote-url');
var urlFromGit = require('github-url-from-git');
var url = require('url');

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

// The active spinner message.  Used by interruptSpinner to replace
// the active spinner message with an interrupted version of it.
var activeSpinnerMessage = null;

function startSpinner(message) {
  cli.spinner('  ' + message);
  activeSpinnerMessage = message;
}

function stopSpinner(message, error) {
  var symbol = error ? chalk.bold.red('×') : chalk.bold.green('✓');
  var result = error ? 'error' : 'done';
  cli.spinner(symbol + ' ' + message + ' ' + result + '!', true);
  activeSpinnerMessage = null;
}

/**
 * Interrupt the active spinner, replacing the active spinner message with
 * an interrupted version of it.  Used by handleCredentialErrors to interrupt
 * an active spinner before prompting the user to re-enter credentials.
 */
function interruptSpinner() {
  if (!activeSpinnerMessage) {
    return;
  }
  cli.spinner('  ' + activeSpinnerMessage, true);
  activeSpinnerMessage = null;
}

module.exports = function() {
  // Save some values in the closure so we can use them across the promise chain
  // without having to pass them down the chain.
  var slug, user, repo, username, password, otpCode, token, tempToken, tempTokenId;

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
        '\n' +
        'Your authentication code is incorrect or has expired; please re-enter it.\n' +
        '\n'
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

  /**
   * Make a request that requires authorization to confirm that the credentials
   * are correct and trigger two-factor auth (if it's enabled).  It doesn't
   * matter what request we make, only that it requires authorization, so here
   * we get all authorizations (and ignore the result).
   */
  function checkCredentials() {
    var message = 'Checking credentials…';
    startSpinner(message);
    return github.authorization.getAll({})
    .then(function() {
      stopSpinner(message);
    })
    .catch(function(err) {
      stopSpinner(message, true);
      return handleCredentialErrors(err)
      .then(checkCredentials);
    });
  }

  function handleCredentialErrors(err) {
    var error = err;
    try {
      error = JSON.parse(err.message);
    } catch (ex) {}

    interruptSpinner();

    if (error.message === 'Bad credentials') {
      // We can say this because we know that the configuration flow prompts
      // the user to enter their credentials before doing anything that might
      // end up in this error handler.  So if we see "Bad credentials" here,
      // then we know the user entered them incorrectly.
      process.stdout.write(
        '\n' +
        'The username and/or password you entered is incorrect; please re-enter them.\n' +
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
      });
    })
    .catch(function(err) {
      var error = JSON.parse(err.message);
      if (error.message === 'Validation Failed' && error.errors[0].code === 'already_exists') {
        // XXX Should we prompt the user to confirm the deletion?
        // Perhaps they don't want to lose the existing token.

        return getTokenId(note, noteUrl)
        .then(deleteToken)
        .then(function() {
          return createToken(scopes, note, noteUrl);
        })
        .then(function(res) {
          // Identify the token as having been deleted and recreated
          // so the caller can notify the user about that.
          res.isRecreated = true;
          return res;
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
      if (res.length === 0) {
        throw new Error('Token not found');
      }

      for (var i = 0; i < res.length; i++) {
        // XXX Should we ensure |res[i].note_url === noteUrl| too?
        if (res[i].note === note) {
          return res[i].id;
        }
      }

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

  process.stdout.write('\nConfiguring Travis to auto-deploy to GitHub Pages…\n\n');

  var defaultRemote = 'origin';
  var remotes = childProcess.execSync('git remote').toString().split('\n').slice(0, -1);
  if (remotes.indexOf('upstream') !== -1) {
    defaultRemote = 'upstream';
  }

  var chosenRemote;
  var chosenRemotePromise;
  if (remotes.length === 1) {
    process.stdout.write('Your repository has a single remote, ' + remotes[0] + '.\n');
    chosenRemotePromise = Promise.resolve(remotes[0]);
  } else {
    chosenRemotePromise = promptly.prompt('Remote [default: ' + defaultRemote + ']: ', { default: defaultRemote });
  }

  return chosenRemotePromise

  .then(function(remote) {
    chosenRemote = remote;
    return gitRemoteUrl('./', remote);
  })

  .then(urlFromGit)

  .then(function(gitUrl) {
    return url.parse(gitUrl).path.slice(1);
  })

  .then(function(res) {
    process.stdout.write('Ok, I\'ll configure Travis to auto-deploy the ' + chosenRemote + ' remote (' + res + ').\n')

    slug = res;
    var slugParts = slug.split('/');
    user = slugParts[0];
    repo = slugParts[1];

    // Set the username to the value of the user half of the slug to provide
    // a default value when prompting the user for their username.
    username = user;

    process.stdout.write(
      '\n' +
      'To check the status of your repository in Travis and authorize Travis to push\n' +
      'to it, I\'ll create GitHub personal access tokens, for which I need your GitHub\n' +
      'username and password (and two-factor authentication code, if appropriate).\n' +
      '\n'
    );

    process.stdout.write(chalk.blue(
      'ℹ For more information about GitHub personal access tokens, see:\n' +
      '    https://github.com/settings/tokens\n' +
      '\n'
    ));
  })

  .then(promptCredentials)

  .then(checkCredentials)

  // NB: The GitHub authorization API always requires basic authentication,
  // so it isn't possible to request a token that gives us access to it.
  // Otherwise we'd do that first and then use that token to get the others.

  .then(function() {
    // Create a temporary GitHub token to get a Travis token that we can use
    // to activate the repository in Travis.  We only need this GitHub token
    // to get the Travis token, so we delete it afterward.

    var message = 'Creating temporary GitHub token for getting Travis token…';
    startSpinner(message);

    return createToken(['read:org', 'user:email', 'repo_deployment', 'repo:status', 'write:repo_hook'],
                       'temporary Oghliner token to get Travis token for ' + slug, noteUrl)
    .then(function(res) {
      stopSpinner(message);

      tempToken = res.token;

      // Store the ID of the temporary GitHub token so we can delete it
      // after we finish using it to get the Travis token.
      tempTokenId = res.id;
    });
  })

  .then(function() {
    var message = 'Getting Travis token…';
    startSpinner(message);

    return travis.authenticate({ github_token: tempToken })
    .then(function(res) {
      // console.log("Travis token: " + res.access_token);

      // We don't need to save the Travis token, because the Travis module
      // caches it in the Travis instance.

      stopSpinner(message);
    });
  })

  .then(function() {
    // Now that we have the Travis token, delete the temporary GitHub token.

    var message = 'Deleting temporary GitHub token for getting Travis token…';
    startSpinner(message);

    return deleteToken(tempTokenId)
    .then(function() {
      stopSpinner(message);
    });
  })

  .then(function() {
    var message = 'Creating permanent GitHub token for Travis to push to the repository…';
    startSpinner(message);

    return createToken(['public_repo'], 'Oghliner token for ' + slug, noteUrl)
    .then(function(res) {
      token = res.token;
      stopSpinner(message);
      res.isRecreated && process.stdout.write(chalk.blue(
        '\n' +
        'ℹ You had an existing token for this app, so we deleted and recreated it.\n' +
        '\n'
      ));
    });
  })

  .then(function() {
    function ensureActiveInTravis() {
      var message = 'Checking the status of your repository in Travis…';
      startSpinner(message);
      return travis.hooks.get()
      .then(function(res) {
        stopSpinner(message);
        return res.hooks;
      })
      .then(function(hooks) {
        var hook;
        for (var i = 0; i < hooks.length; i++) {
          hook = hooks[i];
          if (hook.owner_name === user && hook.name === repo) {
            if (hook.active) {
              process.stdout.write(
                '\n' +
                'Good news, your repository is active in Travis!\n' +
                '\n'
              );
              return;
            }

            var message = 'Your repository isn\'t active in Travis yet; activating it…';
            startSpinner(message);
            return promisify(travis.hooks(hook.id).put)({ hook: { active: true } })
            .then(function(res) {
              if (res.result) {
                stopSpinner(message);
              } else {
                stopSpinner(message, true);
                process.stdout.write(chalk.yellow(
                  '\n' +
                  '⚠ Travis failed to activate your repository, so you\'ll need to do so\n' +
                  '  manually in Travis by going to https://travis-ci.org/profile and pressing\n' +
                  '  the toggle button next to the name of the repository.\n' +
                  '\n'
                ));
              }
            });
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
        var message = 'I didn\'t find your repository in Travis; syncing Travis with GitHub…';
        startSpinner(message);

        return travis.users.sync.post()
        .then(travisAwaitSyncing)
        .then(function() {
          stopSpinner(message);
        })
        .then(ensureActiveInTravis)
        .catch(function(err) {
          // If we got 'repository not found' again, then we successfully
          // waited for Travis to sync and re-invoked ensureActiveInTravis.
          // But Travis still doesn't know anything about the repository.
          // So there's nothing more we can do except re-throw the error.
          if (err.message === 'repository not found') {
            throw err;
          }

          // Otherwise, the error happened in travis.users.sync.post
          // (or possibly travisAwaitSyncing), and there is more we can do
          // to recover from it.
          //
          // We ignore the exception if Travis is still syncing.  In that case,
          // travis.users.sync.post will return an error with status code 409
          // and message 'Sync already in progress. Try again later.',
          // but instead of relying on that we simply perform an explicit check.
          //
          return travisIsSyncing().then(function(isSyncing) {
            if (isSyncing) {
              return travisAwaitSyncing()
              .then(function() {
                stopSpinner(message);
              })
              .then(ensureActiveInTravis).catch(function() {
                // Throw the original error.
                throw err;
              });
            } else {
              // Check again if it's active on Travis (in case it finished syncing
              // right before we checked)
              stopSpinner(message);
              return ensureActiveInTravis().catch(function() {
                // Throw the original error.
                throw err;
              });
            }
          });
        });
      }
      throw err;
    });
  })

  .then(function() {
    var message = 'Encrypting permanent GitHub token…';
    startSpinner(message);
    return travisEncrypt(slug, 'GH_TOKEN=' + token, undefined, undefined)
    .then(function(blob) {
      stopSpinner(message);
      return blob;
    });
  })

  .then(function(blob) {
    var message = 'Writing configuration to .travis.yml file…';
    startSpinner(message);

    var travisYml;
    var hasTravisYml = false;
    try {
      travisYml = readYaml.sync('.travis.yml');
      hasTravisYml = true;
    } catch(err) {
      if (err.code === 'ENOENT') {
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
      travisYml.before_script.push(command);
    }
    if (!travisYml.before_script.some(function(v) { return v.search(/git +config +--global +user\.email/) !== -1; })) {
      var email = childProcess.execSync('git config --global user.email').toString().trim();
      // We use the current user's email address so GitHub associates the change
      // with the user whose credentials authorize Travis to deploy the changes.
      command = 'git config --global user.email "' + email + '"';
      travisYml.before_script.push(command);
    }

    if (!('after_success' in travisYml) || travisYml.after_success === null) {
      travisYml.after_success = [];
    }

    command = 'echo "travis_fold:end:after_success" && ' +
              '[ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && ' +
              'echo "Deploying…" && gulp deploy';
    if (!travisYml.after_success.some(function(v) { return v.indexOf(command) !== -1; })) {
      travisYml.after_success.push(command);
    }

    writeYaml.sync('.travis.yml', travisYml);
    stopSpinner(message);
    if (!hasTravisYml) {
      process.stdout.write(chalk.yellow(
        '\n' +
        '⚠ You didn\'t already have a .travis.yml file, so I created one for you.\n' +
        '  For more information about the file, see:\n' +
        '    http://docs.travis-ci.com/user/customizing-the-build/\n'
      ));
    }

    return hasTravisYml;
  })

  .then(function(hasTravisYml) {
    process.stdout.write(
      '\n' +
      'You\'re ready to auto-deploy using Travis!  Just commit the changes\n' +
      'in .travis.yml and push the commit to the origin/master branch:\n' +
      '\n'
    );

    if (hasTravisYml) {
      process.stdout.write(
        chalk.bold(
          'git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml\n' +
          'git push origin master\n'
        )
      );
    } else {
      process.stdout.write(
        chalk.bold(
          'git add .travis.yml\n' +
          'git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml\n' +
          'git push origin master\n'
        )
      );
    }

    process.stdout.write(
      '\n' +
      'Then visit https://travis-ci.org/' + slug + '/builds to see the build status.\n' +
      '\n'
    );
  });
};
