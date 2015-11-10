var promisify = require('promisify-node');
var childProcess = require('child_process');
var readlineSync = require('readline-sync');

var Travis = require('travis-ci');
var travis = new Travis({ version: '2.0.0' });

travis.authenticate = promisify(travis.authenticate);
travis.users.get = promisify(travis.users.get);
travis.users.sync.post = promisify(travis.users.sync.post);

var GitHub = require('github');
var github = new GitHub({
  version: '3.0.0',
  protocol: 'https',
  headers: {
    'user-agent': 'Oghliner',
  },
});

var liveUtils = {
  repoName: 'test_oghliner_live_' + process.version + '_' + process.pid,
  githubNote: 'test' + process.version + '_' + process.pid,
  githubNoteURL: 'http://www.test.org/' + process.version + '_' + process.pid,
  githubToken: null,
  getTokenId: getTokenId,
  createAuthorization: createAuthorization,
  deleteAuthorization: deleteAuthorization,
  createRepo: createRepo,
  deleteRepo: deleteRepo,
  getBranch: getBranch,
  cleanup: cleanup,
  spawn: spawn,
};

var githubTokenId;
var useOTP = false;

function createRepo(autoInit) {
  return new Promise(function(resolve, reject) {
    github.repos.create({
      name: liveUtils.repoName,
      auto_init: autoInit,
    }, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function deleteRepo(username) {
  return new Promise(function(resolve, reject) {
    github.repos.delete({
      user: username,
      repo: liveUtils.repoName,
    }, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getBranch(username) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      github.repos.getBranch({
        user: username,
        repo: liveUtils.repoName,
        branch: 'gh-pages',
      }, function(err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    }, 3000);
  });
}

function getTokenId(username, password, note, noteURL, page) {
  github.authenticate({
    type: 'basic',
    username: username,
    password: password,
  });

  page = page || 1;

  return new Promise(function(resolve, reject) {
    github.authorization.getAll({
      page: page,
      headers: useOTP ? { 'X-GitHub-OTP': readlineSync.question('Auth Code: ') } : {},
    }, function(err, res) {
      if (err) {
        reject(err);
        return;
      }

      for (var i = 0; i < res.length; i++) {
        if (res[i].note === note && res[i].note_url === noteURL) {
          resolve(res[i].id);
          return;
        }
      }

      resolve(getTokenId(username, password, note, noteURL, ++page));
    });
  });
}

function deleteAuthorization(tokenId) {
  return new Promise(function(resolve, reject) {
    github.authorization.delete({
      id: tokenId,
      headers: useOTP ? { 'X-GitHub-OTP': readlineSync.question('Auth Code: ') } : {},
    }, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function createAuthorization(username, password) {
  return new Promise(function(resolve, reject) {
    github.authenticate({
      type: 'basic',
      username: username,
      password: password,
    });

    github.authorization.create({
      scopes: ['repo', 'public_repo', 'delete_repo', 'read:org', 'user:email', 'repo_deployment', 'repo:status', 'write:repo_hook'],
      note: liveUtils.githubNote,
      note_url: liveUtils.githubNoteURL,
      headers: useOTP ? { 'X-GitHub-OTP': readlineSync.question('Auth Code: ') } : {},
    }, function(err, res) {
      if (err) {
        reject(err);
        return;
      }

      liveUtils.githubToken = res.token;
      githubTokenId = res.id;

      github.authenticate({
        type: 'oauth',
        token: liveUtils.githubToken,
      });

      resolve(res);
    });
  }).catch(function(err) {
    var error = JSON.parse(err.message);

    if (error.message === 'Must specify two-factor authentication OTP code.') {
      useOTP = true;
      return createAuthorization(username, password);
    }

    if (error.message === 'Validation Failed' && error.errors[0].code === 'already_exists') {
      return getTokenId(username, password, liveUtils.githubNote, liveUtils.githubNoteURL).then(deleteAuthorization).then(createAuthorization.bind(null, username, password));
    }

    throw err;
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

function cleanup(username, password) {
  return travis.authenticate({ github_token: liveUtils.githubToken })
  .then(travis.users.sync.post)
  .catch(function(err) {
    // Ignore sync errors.
  })
  .then(travisAwaitSyncing)
  .then(function() {
    return Promise.all([
      deleteRepo(username)
      .catch(function() {
        // Ignore error if the repo doesn't exist.
      }),
      getTokenId(username, password, liveUtils.githubNote, liveUtils.githubNoteURL)
      .then(deleteAuthorization)
      .catch(function() {
        // Ignore error if the authorization doesn't exist.
      }),
      getTokenId(username, password, 'Oghliner token for ' + username + '/' + liveUtils.repoName, 'https://github.com/mozilla/oghliner')
      .then(deleteAuthorization)
      .catch(function() {
        // Ignore error if the authorization doesn't exist.
      }),
    ]);
  });
}

function spawn(command, args, expected) {
  return new Promise(function(resolve, reject) {
    var child = childProcess.spawn(command, args);

    child.stdout.on('data', function(chunk) {
      process.stdout.write(chunk);
    });

    child.stderr.on('data', function(chunk) {
      process.stderr.write(chunk);
    });

    if (expected) {
      var output = '';
      var nextExpected = expected.shift();

      child.stdout.on('data', function(chunk) {
        output += chunk.toString();

        if (nextExpected && output.indexOf(nextExpected.q) != -1) {
          if (typeof nextExpected.r === 'function') {
            child.stdin.write(nextExpected.r() + '\n');
          } else {
            child.stdin.write(nextExpected.r + '\n');
          }

          if (expected.length > 0) {
            nextExpected = expected.shift();
            output = '';
          } else {
            nextExpected = null;
          }
        }
      });
    }

    child.on('exit', function(code, signal) {
      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });

    child.on('error', function(err) {
      reject(err);
    });
  });
}

module.exports = liveUtils;
