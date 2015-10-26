var assert = require('assert');
var expect = require('chai').expect;
var path = require('path');
var fse = require('fs-extra');
var childProcess = require('child_process');
var readYaml = require('read-yaml');
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

// Skip these tests if the USER or PASS environment variables aren't set.
if (!username || !password) {
  return;
}

function createRepo() {
  return new Promise(function(resolve, reject) {
    github.repos.create({
      name: 'test_oghliner_live',
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
          child.stdin.write(nextExpected.r + '\n');
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

describe('CLI interface, oghliner as a template', function() {
  this.timeout(0);

  var oldWD = process.cwd();

  before(function() {
    github.authenticate({
      type: 'basic',
      username: username,
      password: password,
    });
  });

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
    .then(spawn.bind(null, 'git', ['clone', 'https://' + username + ':' + password + '@github.com/' + username + '/test_oghliner_live']))
    .then(process.chdir.bind(null, 'test_oghliner_live'))
    .then(spawn.bind(null, 'npm', ['install', path.dirname(__dirname)]))
    .then(spawn.bind(null, path.join('node_modules', '.bin', 'oghliner'), ['bootstrap', '.'], [
      {
        q: 'Would you like to change any of the above configuration values?',
        r: 'n',
      }
    ]))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'README.md'));
      assert.doesNotThrow(fse.statSync.bind(fse, 'app'));
      var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      expect(packageJson.name).to.equal('oghliner-template-app');
      expect(packageJson.license).to.equal('Apache-2.0');
      expect(packageJson).to.include.keys('version');
      expect(packageJson).to.include.keys('description');
      expect(packageJson).to.include.keys('repository');
      expect(packageJson).to.include.keys('dependencies');
    })
    .then(spawn.bind(null, path.join('node_modules', '.bin', 'gulp')))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'dist'));
    })
    .then(spawn.bind(null, path.join('node_modules', '.bin', 'gulp'), ['deploy']))
    .then(getBranch)
    .catch(getBranch)
    .catch(getBranch)
    .then(spawn.bind(null, path.join('node_modules', '.bin', 'oghliner'), ['configure'], [
      {
        q: 'Username: ',
        r: username,
      },
      {
        q: 'Password: ',
        r: password,
      },
    ]))
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
      expect(travisYml.after_success[0]).to.equal(
        'echo "travis_fold:end:after_success" && ' +
        '[ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && ' +
        'echo "Deploying…" && gulp deploy'
      );
    })
    .then(function() {
      fse.readdirSync('.').forEach(function(file) {
        if (file === '.git') {
          return;
        }

        fse.removeSync(file);
      });
    })
    .then(spawn.bind(null, 'git', ['checkout', '-b', 'gh-pages']))
    .then(spawn.bind(null, 'git', ['pull', 'origin', 'gh-pages']))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'index.html'));
      assert.doesNotThrow(fse.statSync.bind(fse, 'offline-worker.js'));
    });
  });
});
