var childProcess = require('child_process');
var readlineSync = require('readline-sync');

var GitHub = require('github');
var github = new GitHub({
  version: '3.0.0',
  protocol: 'https',
  headers: {
    'user-agent': 'Oghliner',
  },
});

var liveUtils = {
  githubToken: null,
  createAuthorization: createAuthorization,
  createRepo: createRepo,
  deleteRepo: deleteRepo,
  getBranch: getBranch,
  spawn: spawn,
};

var githubTokenId;
var useOTP = false;

function createRepo(autoInit) {
  return new Promise(function(resolve, reject) {
    github.repos.create({
      name: 'test_oghliner_live',
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
      repo: 'test_oghliner_live',
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
        repo: 'test_oghliner_live',
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

function getTokenId(page) {
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
        if (res[i].note === 'test' && res[i].note_url === 'http://www.test.org') {
          resolve(res[i].id);
          return;
        }
      }

      resolve(getTokenId(++page));
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
      scopes: ['repo', 'public_repo', 'delete_repo'],
      note: 'test',
      note_url: 'http://www.test.org',
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
      return createAuthorization(uesrname, password);
    }

    if (error.message === 'Validation Failed' && error.errors[0].code === 'already_exists') {
      return getTokenId().then(deleteAuthorization).then(createAuthorization.bind(null, username, password));
    }

    throw err;
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
