var assert = require('assert');
var expect = require('chai').expect;
var path = require('path');
var fse = require('fs-extra');
var readYaml = require('read-yaml');
var temp = require('temp').track();
var readlineSync = require('readline-sync');
var liveUtils = require('./liveUtils');

var username = process.env.USER, password = process.env.PASS;

// Skip these tests if the USER or PASS environment variables aren't set.
if (!username || !password) {
  return;
}

describe('CLI interface, oghliner as a template', function() {
  this.timeout(0);

  var oldWD = process.cwd();

  before(function() {
    return liveUtils.createAuthorization(username, password);
  });

  after(function() {
    return liveUtils.cleanup(username, password);
  });

  beforeEach(function() {
    process.chdir(temp.mkdirSync('oghliner'));

    process.env.GH_TOKEN = username + ':' + liveUtils.githubToken;

    return liveUtils.deleteRepo(username)
    .catch(function() {
      // Ignore error if the repo doesn't exist.
    });
  });

  afterEach(function() {
    process.chdir(oldWD);

    delete process.env['GH_TOKEN'];
  });

  it('should work', function() {
    return liveUtils.createRepo(false)
    .then(liveUtils.spawn.bind(null, 'git', ['clone', 'https://' + username + ':' + liveUtils.githubToken + '@github.com/' + username + '/' + liveUtils.repoName]))
    .then(process.chdir.bind(null, liveUtils.repoName))
    .then(liveUtils.spawn.bind(null, 'npm', ['install', 'gulp']))
    .then(liveUtils.spawn.bind(null, 'npm', ['install', path.dirname(__dirname)]))
    .then(liveUtils.spawn.bind(null, path.join('node_modules', '.bin', 'oghliner'), ['bootstrap', '.'], [
      {
        q: 'Would you like to change its configuration (y/N)?',
        r: 'n',
      }
    ]))
    // Overwrite the oghliner version installed by bootstrap with the development one from the top directory.
    .then(liveUtils.spawn.bind(null, 'npm', ['install', path.dirname(__dirname)]))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'README.md'));
      assert.doesNotThrow(fse.statSync.bind(fse, 'app'));
      var packageJson = JSON.parse(fse.readFileSync('package.json', 'utf8'));
      expect(packageJson.name).to.equal('oghliner-template-app');
      expect(packageJson.license).to.equal('Apache-2.0');
      expect(packageJson).to.include.keys('version');
      expect(packageJson).to.include.keys('description');
      expect(packageJson).to.include.keys('repository');
      expect(packageJson).to.include.keys('dependencies');
    })
    .then(liveUtils.spawn.bind(null, 'git', ['add', '*']))
    .then(liveUtils.spawn.bind(null, 'git', ['commit', '-m', 'First commit']))
    .then(liveUtils.spawn.bind(null, path.join('node_modules', '.bin', 'gulp'), ['build']))
    .then(liveUtils.spawn.bind(null, path.join('node_modules', '.bin', 'gulp'), ['offline']))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'dist'));
    })
    .then(liveUtils.spawn.bind(null, path.join('node_modules', '.bin', 'gulp'), ['deploy']))
    .then(function() {
      return liveUtils.getBranch(username)
      .catch(liveUtils.getBranch.bind(null, username))
      .catch(liveUtils.getBranch.bind(null, username))
    })
    .then(liveUtils.spawn.bind(null, path.join('node_modules', '.bin', 'oghliner'), ['configure'], [
      {
        q: 'Username: ',
        r: username,
      },
      {
        q: 'Password: ',
        r: password,
      },
      {
        q: 'Auth Code: ',
        r: readlineSync.question,
      }
    ]))
    .then(function() {
      var travisYml = readYaml.sync('.travis.yml');
      expect(travisYml.language).to.equal('node_js');
      expect(travisYml.node_js).to.deep.equal(['0.12']);
      expect(travisYml.install).to.equal('npm install');
      expect(travisYml.script).to.equal('gulp build && gulp offline');
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
    .then(liveUtils.spawn.bind(null, 'git', ['checkout', '-b', 'gh-pages']))
    .then(liveUtils.spawn.bind(null, 'git', ['pull', 'origin', 'gh-pages']))
    .then(function() {
      assert.doesNotThrow(fse.statSync.bind(fse, 'index.html'));
      assert.doesNotThrow(fse.statSync.bind(fse, 'offline-worker.js'));
    });
  });
});
