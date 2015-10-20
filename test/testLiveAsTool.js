var assert = require('assert');
var path = require('path');
var fse = require('fs-extra');
var childProcess = require('child_process');
var temp = require('temp').track();

var GitHub = require('github');
var github = new GitHub({
  version: '3.0.0',
  protocol: 'https',
  headers: {
    'user-agent': 'Oghliner',
  },
});

var username = process.env.USER, password = process.env.PASS;

function createRepo() {
  return new Promise(function(resolve, reject) {
    github.repos.create({
      name: 'test_oghliner_live',
      auto_init: true,
    }, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function deleteRepo() {
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

function getBranch() {
  return new Promise(function(resolve, reject) {
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
  });
}

function spawn(command, args) {
  return new Promise(function(resolve, reject) {
    var child = childProcess.spawn(command, args);

    child.stdout.on('data', function(chunk) {
      process.stdout.write(chunk);
    });

    child.stderr.on('data', function(chunk) {
      process.stderr.write(chunk);
    });

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

github.authenticate({
  type: 'basic',
  username: username,
  password: password,
});

describe('CLI interface, oghliner as a tool', function() {
  this.timeout(60000);

  var oldWD = process.cwd();

  beforeEach(function() {
    process.chdir(temp.mkdirSync('oghliner'));

    process.env.GH_TOKEN = username + ':' + password;

    return deleteRepo();
  });

  afterEach(function() {
    process.chdir(oldWD);

    delete process.env['GH_TOKEN'];
  });

  it('should work', function() {
    return createRepo()
    .then(() => spawn('git', ['clone', 'https://' + username + ':' + password + '@github.com/' + username + '/test_oghliner_live']))
    .then(() => process.chdir('test_oghliner_live'))
    .then(() => spawn(path.join(path.dirname(__dirname), 'cli.js'), ['offline', '.']))
    .then(() => spawn(path.join(path.dirname(__dirname), 'cli.js'), ['integrate', '.']))
    .then(() => spawn(path.join(path.dirname(__dirname), 'cli.js'), ['deploy', '.']))
    .then(getBranch)
    .then(function() {
      fse.readdirSync('.').forEach(function(file) {
        if (file === '.git') {
          return;
        }

        fse.removeSync(file);
      });
    })
    .then(() => spawn('git', ['checkout', '-b', 'gh-pages']))
    .then(() => spawn('git', ['pull', 'origin', 'gh-pages']))
    .then(function() {
      assert.doesNotThrow(() => fse.statSync('offline-manager.js'));
      assert.doesNotThrow(() => fse.statSync('offline-worker.js'));
    });
  });
});
