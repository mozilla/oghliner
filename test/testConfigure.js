'use strict';

// Import this first so we can use it to wrap other modules we import.
var promisify = require("promisify-node");

var assert = require('assert');
var expect = require('chai').expect;
var childProcess = require('child_process');
var nock = require('nock');
var readYaml = require('read-yaml');
var temp = promisify(require('temp').track());

var configure = require('../lib/configure');

function await(data) {
  return new Promise(function(resolve, reject) {
    var write = process.stdout.write;
    var output = '';
    process.stdout.write = function(chunk, encoding, fd) {
      write.apply(process.stdout, arguments);
      output += chunk;
      if (output.indexOf(data) !== -1) {
        process.stdout.write = write;
        resolve();
      }
    };
  });
}

function emit(data) {
  process.stdin.emit('data', data);
}

function cancel() {
  emit(String.fromCharCode(3 /* Ctrl-C */));
}

describe('Configure', function() {
  var slug = 'mozilla/oghliner', user = 'mozilla', repo = 'oghliner';
  // Some test functions cause Oghliner to wait five seconds before repeating
  // a request to the Travis API, so we need to increase the timeout
  // to accommodate that delay.  I'd rather increase for just those specific
  // tests, but it isn't clear how to do that for tests that return a promise.
  this.timeout(10000);

  var oldWd;
  beforeEach(function() {
    return temp.mkdir('oghliner').then(function(dirPath) {
      oldWd = process.cwd();
      process.chdir(dirPath);
      childProcess.execSync('git init');
      childProcess.execSync('git remote add origin https://github.com/mozilla/oghliner.git');
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

  function enterUsernamePasswordToken() {
    nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(401, {
      "message":"Must specify two-factor authentication OTP code.",
      "documentation_url":"https://developer.github.com/v3/auth#working-with-two-factor-authentication"
    });

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Auth Code:');
    })
    .then(function() {
      emit('123456\n');
    });

    return promise;
  }

  function nockGetTokenFailureExists() {
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

  function nockGetGitHubToken() {
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

  function nockGetTemporaryGitHubToken() {
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

  function nockGetTravisTokenAndUser() {
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

  function nockDeleteTemporaryGitHubToken() {
    return nock('https://api.github.com:443')
    .delete('/authorizations/23157726')
    .reply(204, "");
  }

  function nockGetHooks() {
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

  function nockGetTravisKey() {
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

  function nockGetHooksIsMissingRepo() {
    return nock('https://api.travis-ci.org:443')
    .get('/hooks')
    .reply(200, {
      "hooks": []
    });
  }

  function nockRequestSync() {
    return nock('https://api.travis-ci.org:443')
    .post('/users/sync')
    .reply(200, {"result":true});
  }

  function nockGetTravisUser() {
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

  function nockGetTravisUserIsSyncing() {
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

  it('tells you what it\'s going to do', function() {
    var promise = await('Configuring ' + slug + ' to auto-deploy to GitHub Pages using Travis CI…')
    .then(cancel);

    configure();

    return promise;
  });

  it('prompts you to enter a username', function() {
    var promise = await('Username: ')
    .then(cancel);

    configure();

    return promise;
  });

  it('prompts you to enter a password', function() {
    var promise = enterUsername()
    .then(function() {
      return await('Password:');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('prompts you to re-enter an incorrect username/password', function() {
    nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(401, {
      "message":"Bad credentials",
      "documentation_url":"https://developer.github.com/v3"
    });

    var promise = enterUsernamePassword()
    .then(function() {
      return await('The username and/or password you entered is incorrect.\nPlease try again…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('prompts you to enter a 2FA code', function() {
    nock('https://api.github.com:443')
    .post('/authorizations', {
      "scopes":["public_repo"],
      "note":"Oghliner token for " + slug,
      "note_url":"https://github.com/mozilla/oghliner"
    })
    .reply(401, {
      "message":"Must specify two-factor authentication OTP code.",
      "documentation_url":"https://developer.github.com/v3/auth#working-with-two-factor-authentication"
    });

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Auth Code:');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('deletes existing GitHub token', function() {
    var promise = enterUsernamePasswordToken()
    .then(function() {
      nockGetTokenFailureExists();
    })
    .then(function() {
      return await('You already have the GitHub token "Oghliner token for ' + slug + '".');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('recreates existing GitHub token', function() {
    nockGetTokenFailureExists()
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

    nockGetGitHubToken();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Creating temporary GitHub token for getting Travis token…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('gets temporary GitHub token', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Getting Travis token…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('gets Travis token', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Deleting temporary GitHub token for getting Travis token…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('deletes temporary GitHub token', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();

    nock('https://api.github.com:443')
    .delete('/authorizations/23157726')
    .reply(204, "");

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Checking the status of your repository in Travis…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('checks status of repository in Travis', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();
    nockDeleteTemporaryGitHubToken();
    nockGetHooks();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('Good news, your repository is already active in Travis!');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('syncs Travis with GitHub', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();
    nockDeleteTemporaryGitHubToken();
    nockGetHooksIsMissingRepo();
    nockRequestSync();
    nockGetTravisUserIsSyncing();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('I didn\'t find your repository in Travis.  Syncing Travis with GitHub…');
    })
    .then(function() {
      return await('Waiting for Travis to finish syncing…');
    })
    .then(cancel);

    configure();

    return promise;
  });

  it('configures without syncing', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();
    nockDeleteTemporaryGitHubToken();
    nockGetHooks();
    nockGetTravisKey();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    });

    configure();

    return promise;
  });

  it('configures with syncing', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();
    nockDeleteTemporaryGitHubToken();
    nockGetHooksIsMissingRepo();
    nockRequestSync();
    nockGetTravisUserIsSyncing();
    nockGetHooks();
    nockGetTravisUser();
    nockGetTravisKey();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    });

    configure();

    return promise;
  });

  it('encrypts GitHub token and writes it to .travis.yml file', function() {
    nockGetGitHubToken();
    nockGetTemporaryGitHubToken();
    nockGetTravisTokenAndUser();
    nockDeleteTemporaryGitHubToken();
    nockGetHooks();
    nockGetTravisKey();

    var promise = enterUsernamePassword()
    .then(function() {
      return await('You\'re ready to auto-deploy using Travis!');
    })
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.language).to.equal('node_js');
      expect(travisYml.node_js).to.deep.equal(['0.12']);
      expect(travisYml.install).to.equal('npm install');
      expect(travisYml.script).to.equal('gulp');
      expect(travisYml).to.include.keys('env');
      expect(travisYml.env).to.include.keys('global');
      expect(travisYml.env.global).to.have.length(1);
      expect(travisYml.env.global[0]).to.have.keys('secure');
    });

    configure();

    return promise;
  });

  afterEach(function() {
    process.chdir(oldWd);
    temp.cleanupSync();
  });

});
