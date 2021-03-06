'use strict';

// Import this first so we can use it to wrap other modules we import.
var promisify = require('promisify-node');

var assert = require('assert');
var expect = require('chai').expect;
var childProcess = require('child_process');
var nock = require('nock');
var readYaml = require('read-yaml');
var writeYaml = require('write-yaml');
var temp = promisify(require('temp').track());

var configure = require('../lib/configure');

describe('Configure', function() {
  var slug, user, repo;

  var write = process.stdout.write;
  var output;
  var waitingArr;

  before(function() {
    process.stdout.write = function(chunk, encoding, fd) {
      write.apply(process.stdout, arguments);
      output += chunk;
      for (var i = 0; i < waitingArr.length; i++) {
        var waitingData = waitingArr[i];

        if (output.indexOf(waitingData.data) !== -1) {
          output = output.substr(output.indexOf(waitingData.data) + waitingData.data.length);
          waitingArr.splice(i, 1);
          i--;
          waitingData.fn();
        }
      }
    };
  });

  after(function() {
    process.stdout.write = write;
  });

  function await(data) {
    return new Promise(function(resolve, reject) {
      if (output.indexOf(data) !== -1) {
        output = output.substr(output.indexOf(data) + data.length);
        resolve();
        return;
      }

      waitingArr.push({
        data: data,
        fn: resolve,
      });
    });
  }

  function emit(data) {
    // Use setTimeout to avoid some racey behavior with prompt.
    setTimeout(function() {
      process.stdin.emit('data', data);
    });
  }

  function complete() {
    return await('You\'re ready to auto-deploy using Travis!')
    .then(checkTravisYmlFile);
  }

  function checkTravisYmlFile() {
    var travisYml = readYaml.sync('.travis.yml');
    expect(travisYml.language).to.equal('node_js');
    expect(travisYml.node_js).to.deep.equal(['0.12']);
    expect(travisYml.install).to.equal('npm install');
    expect(travisYml.script).to.equal('gulp build && gulp offline');
    expect(travisYml).to.include.keys('env');
    expect(travisYml.env).to.include.keys('global');
    expect(travisYml.env.global).to.have.length(1);
    expect(travisYml.env.global[0]).to.have.keys('secure');
    expect(travisYml.before_script).to.have.length(2);
    expect(travisYml.after_success).to.have.length(1);
    expect(travisYml.after_success[0]).to.equal(
      'echo "travis_fold:end:after_success" && ' +
      '[ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && ' +
      'echo "Deploying…" && gulp deploy'
    );
  }

  var oldSetTimeout = setTimeout;
  before(function() {
    setTimeout = function(func, timeout) {
      oldSetTimeout(func, timeout / 100);
    }
  });
  after(function() {
    setTimeout = oldSetTimeout;
  })

  var oldWd;
  beforeEach(function() {
    slug = 'mozilla/oghliner', user = 'mozilla', repo = 'oghliner';

    return temp.mkdir('oghliner').then(function(dirPath) {
      oldWd = process.cwd();
      process.chdir(dirPath);
      childProcess.execSync('git init');
      childProcess.execSync('git remote add origin https://github.com/mozilla/oghliner.git');
      output = '';
      waitingArr = [];
    });
  });

  function enterUsername() {
    return await('Username:')
    .then(function() {
      emit('username\n');
    });
  }

  function enterUsernamePassword() {
    return enterUsername()
    .then(function() {
      return await('Password:');
    })
    .then(function() {
      emit('password\n');
    });
  }

  function enter2FACode() {
    return await('Auth Code:')
    .then(function() {
      emit('123456\n');
    });
  }

  function nock_GitHub_GetAuthorizations() {
    return nock('https://api.github.com:443')
    .get('/authorizations')
    .reply(200, []);
  }

  function nock_GitHub_GetAuthorizations_BadCredentials() {
    return nock('https://api.github.com:443')
    .get('/authorizations')
    .reply(401, {
      "message":"Bad credentials",
      "documentation_url":"https://developer.github.com/v3"
    });
  }

  function nock_GitHub_GetAuthorizations_Need2FACode() {
    return nock('https://api.github.com:443')
    .get('/authorizations')
    .reply(401, {
      "message":"Must specify two-factor authentication OTP code.",
      "documentation_url":"https://developer.github.com/v3/auth#working-with-two-factor-authentication"
    });
  }

  function nock_GitHub_GetTemporaryToken() {
    return nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["read:org","user:email","repo_deployment","repo:status","write:repo_hook"],
      "note":"temporary Oghliner token to get Travis token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(201, {
      "id":23157726,
      "url":"https://api.github.com/authorizations/23157726",
      "app":{"name":"temporary Oghliner token to get Travis token for " + slug,
      "url":"https://github.com/mozilla/oghliner",
      "client_id":"00000000000000000000"},
      "token":"1111111111111111111111111111111111111111",
      "hashed_token":"1111111111111111111111111111111111111111111111111111111111111111",
      "token_last_eight":"11111111",
      "note":"temporary Oghliner token to get Travis token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner",
      "created_at":"2015-10-12T21:43:00Z",
      "updated_at":"2015-10-12T21:43:00Z",
      "scopes":["read:org","user:email","repo_deployment","repo:status","write:repo_hook"],
      "fingerprint":null
    });
  }

  function nock_Travis_GetTokenAndUser() {
    return nock('https://api.travis-ci.org:443')
    .post('/auth/github', {"github_token":"1111111111111111111111111111111111111111"})
    .reply(200, {"access_token":"2222222222222222222222"})
    .get('/users', {"access_token":"2222222222222222222222"})
    .reply(200, {
      "user":{
        "id":93336,
        "name":"Myk Melez",
        "login":"mykmelez",
        "email":"myk@mozilla.org",
        "gravatar_id":"4bcc1646956acd3ee25234b34da91414",
        "locale":null,
        "is_syncing":false,
        "synced_at":"2015-10-12T07:41:47Z",
        "correct_scopes":true,
        "created_at":"2014-08-28T16:52:57Z",
        "channels":["user-93336","repo-6189247"]
      }
    });
  }

  function nock_GitHub_DeleteTemporaryToken() {
    return nock('https://api.github.com:443')
    .delete('/authorizations/23157726')
    .reply(204, "");
  }

  function nock_GitHub_GetPermanentToken_AlreadyExists() {
    return nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(422, {
      "message":"Validation Failed",
      "errors":[{"resource":"OauthAccess","code":"already_exists","field":"description"}],
      "documentation_url":"https://developer.github.com/v3/oauth_authorizations/#create-a-new-authorization"
    });
  }

  function nock_GitHub_GetPermanentToken() {
    return nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(201, {
      "id":23157724,
      "url":"https://api.github.com/authorizations/23157724",
      "app":{
        "name":"Oghliner token for " + slug,
        "url":"https://github.com/mozilla/oghliner",
        "client_id":"00000000000000000000"
      },
      "token":"0000000000000000000000000000000000000000", // removed
      "hashed_token":"0000000000000000000000000000000000000000000000000000000000000000", // removed
      "token_last_eight":"00000000", // removed
      "note":"Oghliner token for mykmelez/oghliner",
      "note_url":"https://github.com/mozilla/oghliner",
      "created_at":"2015-10-12T21:42:59Z",
      "updated_at":"2015-10-12T21:42:59Z",
      "scopes":["public_repo"],
      "fingerprint":null
    });
  }

  function nock_GitHub_GetPermanentToken_Need2FACode() {
    return nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(401, {
      "message":"Must specify two-factor authentication OTP code.",
      "documentation_url":"https://developer.github.com/v3/auth#working-with-two-factor-authentication"
    });
  }

  function nock_Travis_GetHooks() {
    return nock('https://api.travis-ci.org:443')
    .get('/hooks')
    .reply(200, {
      "hooks": [{
        "id": 5910871,
        "name": repo,
        "owner_name": user,
        "description": "template and tool for deploying Offline Web Apps to GitHub Pages",
        "active": true,
        "private": false,
        "admin": true
      }]
    });
  }

  function nock_Travis_GetHooks_RepoInactive() {
    return nock('https://api.travis-ci.org:443')
    .get('/hooks')
    .reply(200, {
      "hooks": [{
        "id": 5910871,
        "name": repo,
        "owner_name": user,
        "description": "template and tool for deploying Offline Web Apps to GitHub Pages",
        "active": false,
        "private": false,
        "admin": true
      }]
    });
  }

  function nock_Travis_ActivateRepo() {
    nock('https://api.travis-ci.org:443')
    .put('/hooks/5910871', {"hook":{"active":true}})
    .reply(200, {"result":true});
  }

  // I haven't reproduced this live, so I'm not sure if the response code
  // is really 200, nor even if the "result" will be false, but those seem
  // like the most likely values.
  function nock_Travis_ActivateRepo_Failure() {
    nock('https://api.travis-ci.org:443')
    .put('/hooks/5910871', {"hook":{"active":true}})
    .reply(200, {"result":false});
  }

  function nock_Travis_GetKey() {
    return nock('https://api.travis-ci.org:443')
    .get('/repos/' + slug + '/key')
    .reply(200, {
      "key":"-----BEGIN PUBLIC KEY-----\n" +
            "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAzOaAyFiyT1xWd346TF2l\n" +
            "sYcma5jMVjmodwpiyR0CWKUGlBjdoiXtDKK3G3RSPf617IIf8IbWTq5HUM0O1u0W\n" +
            "McCXmiJKF0WHB9+ZlNkR+XWfd203H56hBcnNkHdGTwxdu0hsdxQ09y7fDHSNPFls\n" +
            "WDqToPx2X9UzY+xbXO3P54Oa4bbfZmPSoZuwKR8s4b90ylvv6EEmpqso7msD1gZt\n" +
            "eog14RH1KtZz094XYbu/9y7DfNiDy2dyD+oU3pfnt5MWtuBk78qMgthWhXcrIUcB\n" +
            "bHylzLsyPmNUVx2FA2mhuS8gHZi3X5ja7qygolsxAAHW9suJIMfD/wZ7nRrsZtIP\n" +
            "BUGCP1ZGjL6j8trYSMMVnzYSBD+heUyhd6NvxYRUMt9Thon7LGV2Dq/oEv/nHh/N\n" +
            "AcnPUMKOQQLGo4SEYycgrHiMhwuzSEDUo/3QlyeTz6m6SYz44yYM2Sd7VAJerSxZ\n" +
            "QysuOUwepo7HEyKKpXtj76LtDy2LyXbN93FuJYP2c0uGkwWIZO0udj4B7Eu39w1q\n" +
            "iW1qN28CSb9ls+9huxzNZEgkdHcA3NSumQ1nqKGUQQ3+yIdgi9nID9f6AwqMK+/E\n" +
            "OBqvy0kfoXdNKeHUNfuBAi1gRSNw10q5JnXuVagrhXQlFYeN/aQu/hEHW1SAz4Ia\n" +
            "7tl5AIwiw5WIlEYTZGf90vUCAwEAAQ==\n" +
            "-----END PUBLIC KEY-----\n",
      "fingerprint":"0a:bc:3b:53:39:60:0d:a2:74:71:d4:2c:e7:19:89:6f"
    });
  }

  function nock_Travis_GetHooks_RepoMissing() {
    return nock('https://api.travis-ci.org:443')
    .get('/hooks')
    .reply(200, {
      "hooks": []
    });
  }

  function nock_Travis_RequestSync() {
    return nock('https://api.travis-ci.org:443')
    .post('/users/sync')
    .reply(200, {"result":true});
  }

  function nock_Travis_RequestSync_AlreadyInProgress() {
    return nock('https://api.travis-ci.org:443')
    .post('/users/sync')
    .reply(409, {"message":"Sync already in progress. Try again later."});
  }

  function nock_Travis_RequestSync_FakeError() {
    return nock('https://api.travis-ci.org:443')
    .post('/users/sync')
    .reply(500, {"message":"This error was made up for testing purposes."});
  }

  function nock_Travis_GetUser() {
    return nock('https://api.travis-ci.org:443')
    .get('/users')
    .reply(200, {
      "user":{
        "id":93336,
        "name":"Myk Melez",
        "login":"mykmelez",
        "email":"myk@mozilla.org",
        "gravatar_id":"4bcc1646956acd3ee25234b34da91414",
        "locale":null,
        "is_syncing":false,
        "synced_at":"2015-10-12T07:41:47Z",
        "correct_scopes":true,
        "created_at":"2014-08-28T16:52:57Z",
        "channels":["user-93336","repo-6189247"]
      }
    });
  }

  function nock_Travis_GetUser_Syncing() {
    nock('https://api.travis-ci.org:443')
    .get('/users')
    .reply(200, {
      "user":{
        "id":93336,
        "name":"Myk Melez",
        "login":"mykmelez",
        "email":"myk@mozilla.org",
        "gravatar_id":"4bcc1646956acd3ee25234b34da91414",
        "locale":null,
        "is_syncing":true,
        "synced_at":"2015-10-12T07:41:47Z",
        "correct_scopes":true,
        "created_at":"2014-08-28T16:52:57Z",
        "channels":["user-93336","repo-6189247"]
      }
    });
  }

  function nockBasicPostAuthFlow() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();
  }

  it('completes basic flow', function() {
    nockBasicPostAuthFlow();
    configure();
    return await('Configuring Travis to auto-deploy to GitHub Pages…')
    .then(enterUsernamePassword)
    .then(function() {
      return Promise.all([
        await('Getting Travis token… done!'),
        await('Creating permanent GitHub token for Travis to push to the repository… done!'),
        await('Good news, your repository is active in Travis!'),
        await('Encrypting permanent GitHub token… done!'),
        await('Writing configuration to .travis.yml file… done!'),
      ])
     })
    .then(complete);
  });

  it('prompts you to re-enter an incorrect username/password', function() {
    // Pretend the user enters bad credentials twice to ensure the command
    // repeatedly prompts for credentials until the user gets them right.
    nock_GitHub_GetAuthorizations_BadCredentials();
    nock_GitHub_GetAuthorizations_BadCredentials();
    nockBasicPostAuthFlow();
    configure();
    return enterUsernamePassword()
    .then(function() {
      return await('The username and/or password you entered is incorrect; please re-enter them.');
    })
    .then(enterUsernamePassword)
    .then(function() {
      return await('The username and/or password you entered is incorrect; please re-enter them.');
    })
    .then(enterUsernamePassword)
    .then(complete);
  });

  it('prompts you to enter a 2FA code', function() {
    nock_GitHub_GetAuthorizations_Need2FACode();
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();
    configure();
    return enterUsernamePassword().then(enter2FACode).then(complete);
  });

  it('prompts you to re-enter a 2FA code', function() {
    nock_GitHub_GetAuthorizations_Need2FACode();
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken_Need2FACode();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();
    configure();
    return enterUsernamePassword()
    .then(enter2FACode)
    .then(function() {
      return await('Your authentication code is incorrect or has expired; please re-enter it.');
    })
    .then(enter2FACode)
    .then(complete);
  });

  it('recreates existing GitHub token', function() {
    nock_GitHub_GetAuthorizations();

    nock_GitHub_GetPermanentToken_AlreadyExists()
    .get('/authorizations')
    .query({"page":"1"})
    .reply(200, [{
      "id":22200031,
      "url":"https://api.github.com/authorizations/22200031",
      "app":{"name":"Oghliner token for " + slug,
      "url":"https://github.com/mozilla/oghliner",
      "client_id":"00000000000000000000"},
      "token":"",
      "hashed_token":"0000000000000000000000000000000000000000000000000000000000000000", // removed
      "token_last_eight":"00000000", // removed
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner",
      "created_at":"2015-09-16T20:08:41Z",
      "updated_at":"2015-09-16T20:08:41Z",
      "scopes":["public_repo"],
      "fingerprint":null
    }])
    .delete('/authorizations/22200031')
    .reply(204, "");

    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();

    configure();
    return enterUsernamePassword()
    .then(function() {
      return await('You had an existing token for this app, so we deleted and recreated it.');
    })
    .then(complete);
  });

  it('fails if it can\'t find an existing GitHub token', function() {
    nock_GitHub_GetAuthorizations();

    nock_GitHub_GetPermanentToken_AlreadyExists()
    .get('/authorizations')
    .query({"page":"1"})
    .reply(200, []);

    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    var promise = configure()
    .then(function() {
      assert(false, "Promise rejected");
    }, function(err) {
      assert(true, "Promise rejected");
      assert.equal(err.message, "Token not found");
    });

    enterUsernamePassword();

    return promise;
  });

  it('activates inactive repository', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoInactive();
    nock_Travis_ActivateRepo();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(function() {
      return await('Your repository isn\'t active in Travis yet; activating it… done!');
    })
    .then(complete);
  });

  it('activates inactive repository - displays message on failure', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoInactive();
    nock_Travis_ActivateRepo_Failure();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(function() {
      return await('Travis failed to activate your repository, so you\'ll need to do so');
    })
    .then(complete);
  });

  it('syncs Travis with GitHub', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync();
    nock_Travis_GetUser_Syncing();
    nock_Travis_GetHooks();
    nock_Travis_GetUser();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(function() {
      return await('I didn\'t find your repository in Travis; syncing Travis with GitHub… done!');
    })
    .then(complete);
  });

  it('syncs Travis with GitHub, but repository still isn\'t found', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync();
    nock_Travis_GetUser_Syncing();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_GetUser();

    enterUsernamePassword();

    return configure()
    .then(function() {
      assert(false, 'Configure should fail.');
    }, function(err) {
      assert(true, 'Configure should fail.');
      assert.equal(err.message, 'repository not found', 'Configure fails with the error thrown by ensureActiveInTravis');
    });
  });

  it('syncs Travis with GitHub, but sync was already in progress', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync_AlreadyInProgress();
    nock_Travis_GetUser_Syncing();
    nock_Travis_GetUser();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(complete);
  });

  it('syncs Travis with GitHub, but sync was already in progress and is taking some time', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync_AlreadyInProgress();
    nock_Travis_GetUser_Syncing();
    nock_Travis_GetUser_Syncing();
    nock_Travis_GetUser();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(complete);
  });

  it('syncs Travis with GitHub, sync was already in progress but finished before we checked and the repo is not found', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync_AlreadyInProgress();
    nock_Travis_GetUser();
    nock_Travis_GetHooks_RepoMissing();

    var promise = configure();

    enterUsernamePassword();

    return promise
    .then(function() {
      assert(false, 'Configure should fail.');
    }, function(err) {
      assert(true, 'Configure should fail.');
      assert.equal(err.message, 'Sync already in progress. Try again later.', 'Configure fails with the error thrown by travis.users.sync.post');
    });
  });

  it('generic error while syncing with Travis', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync_FakeError();
    nock_Travis_GetUser();
    nock_Travis_GetHooks_RepoMissing();

    var promise = configure();

    enterUsernamePassword();

    return promise
    .then(function() {
      assert(false, 'Configure should fail.');
    }, function(err) {
      assert(true, 'Configure should fail.');
      assert.equal(err.message, 'This error was made up for testing purposes.', 'Configure fails with the error thrown by travis.users.sync.post');
    });
  });

  it('syncs Travis with GitHub, sync was already in progress but finished before we checked and the repo is found', function() {
    nock_GitHub_GetAuthorizations();
    nock_GitHub_GetTemporaryToken();
    nock_Travis_GetTokenAndUser();
    nock_GitHub_DeleteTemporaryToken();
    nock_GitHub_GetPermanentToken();
    nock_Travis_GetHooks_RepoMissing();
    nock_Travis_RequestSync_AlreadyInProgress();
    nock_Travis_GetUser();
    nock_Travis_GetHooks();
    nock_Travis_GetKey();

    configure();

    return enterUsernamePassword()
    .then(complete);
  });

  it('does not overwrite "language", "node_js", "install" and "script" in an already existing .travis.yml file', function() {
    nockBasicPostAuthFlow();
    configure();

    writeYaml.sync('.travis.yml', {
      language: 'c',
      node_js: [ '4.2' ],
      install: 'run something 1',
      script: 'run something 2',
    });

    return enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.language).to.equal('c');
      expect(travisYml.node_js).to.deep.equal(['4.2']);
      expect(travisYml.install).to.equal('run something 1');
      expect(travisYml.script).to.equal('run something 2');
    });
  });

  it('does not remove environment variables in an already existing .travis.yml file', function() {
    nockBasicPostAuthFlow();
    configure();

    writeYaml.sync('.travis.yml', {
      env: {
        global: [ 'ENV_GLOBAL' ],
        matrix: [ 'ENV_MATRIX' ],
      },
    });

    return enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml).to.include.keys('env');
      expect(travisYml.env).to.include.keys('global');
      expect(travisYml.env).to.include.keys('matrix');
      expect(travisYml.env.global).to.have.length.above(1);
      expect(travisYml.env.global).to.include('ENV_GLOBAL');
      expect(travisYml.env.matrix).to.have.length.of.at.least(1);
      expect(travisYml.env.matrix[0]).to.equal('ENV_MATRIX');
    });
  });

  it('does not remove "before_script" in an already existing .travis.yml file', function() {
    nockBasicPostAuthFlow();
    configure();

    writeYaml.sync('.travis.yml', {
      before_script: [
        'a_command',
      ],
    });

    return enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.before_script).to.have.length.above(1);
      expect(travisYml.before_script).to.include('a_command');
    });
  });

  it('does not overwrite "before_script" in an already existing .travis.yml file', function() {
    nockBasicPostAuthFlow();
    configure();

    writeYaml.sync('.travis.yml', {
      before_script: [
        'git config --global user.name "A User"',
        'git config --global user.email "a_user@mozilla.org"',
      ],
    });

    return enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.before_script).to.have.length(2);
      expect(travisYml.before_script).to.include('git config --global user.name "A User"');
      expect(travisYml.before_script).to.include('git config --global user.email "a_user@mozilla.org"');
    });
  });

  it('does not remove "after_success" in an already existing .travis.yml file', function() {
    nockBasicPostAuthFlow();
    configure();

    writeYaml.sync('.travis.yml', {
      after_success: [
        'a_command'
      ]
    });

    return enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.after_success).to.have.length.above(1);
      expect(travisYml.after_success).to.include('a_command');
    });
  });

  it('configures auto-deploy for a custom remote', function() {
    childProcess.execSync('git remote add upstream https://github.com/mozilla/oghliner.git');

    nockBasicPostAuthFlow();
    configure();

    return await('Remote [default: upstream]:')
    .then(function() {
      emit('origin\n');
    })
    .then(function() {
      return await('Ok, I\'ll configure Travis to auto-deploy the origin remote (mozilla/oghliner).');
    })
    .then(enterUsernamePassword)
    .then(complete);
  });

  it('uses upstream as the default remote if it exists', function() {
    childProcess.execSync('git remote add upstream https://github.com/up/stream.git');

    slug = 'up/stream';
    user = 'up';
    repo = 'stream';

    nockBasicPostAuthFlow();
    configure();

    return await('Remote [default: upstream]:')
    .then(function() {
      emit('\n');
    })
    .then(function() {
      return await('Ok, I\'ll configure Travis to auto-deploy the upstream remote (up/stream).');
    })
    .then(enterUsernamePassword)
    .then(complete);
  });

  it('uses origin as the default remote if there is more than one remote (but no upstream)', function() {
    childProcess.execSync('git remote add another_remote https://github.com/anot/her.git');

    nockBasicPostAuthFlow();
    configure();

    return await('Remote [default: origin]:')
    .then(function() {
      emit('\n');
    })
    .then(function() {
      return await('Ok, I\'ll configure Travis to auto-deploy the origin remote (mozilla/oghliner).');
    })
    .then(enterUsernamePassword)
    .then(complete);
  });

  afterEach(function() {
    process.chdir(oldWd);
    temp.cleanupSync();
    if (!nock.isDone()) {
      throw new Error("test finished with pending mocks: " + nock.pendingMocks());
    }
  });

  after(function() {
    nock.restore();
  });
});
