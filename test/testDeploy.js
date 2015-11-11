var assert = require('assert');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var temp = require('temp').track();
var ghPages = require('gh-pages');
var deploy = require('../lib/deploy');
var childProcess = require('child_process');

describe('Deploy', function() {
  var oldWD = process.cwd();
  var origGHPublish = ghPages.publish;

  afterEach(function() {
    process.chdir(oldWD);
    ghPages.publish = origGHPublish;
    delete process.env['GH_TOKEN'];
  });

  it('should create a gh-pages branch in the origin repo and publish files to it', function(done) {
    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file'), 'data');

      return simpleGit.add('file')
                      .commit('Initial commit')
                      .addRemote('origin', dir, function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          process.chdir(oldWD);

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            try {
              assert.equal(log.total, 1, '1 commit');
              assert.equal(fs.readFileSync(path.join(dir, 'file'), 'utf8'), 'data');
              done();
            } catch (e) {
              done(e);
            }
          });
        }, function() {
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });

  it('should create a gh-pages branch in the origin repo and publish only the specified files to it', function(done) {
    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file1'), 'data');
      fs.writeFileSync(path.join(dir, 'file2'), 'data');

      return simpleGit.add('file1')
                      .add('file2')
                      .commit('Initial commit')
                      .addRemote('origin', dir, function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
          fileGlobs: ['file1'],
        }).then(function() {
          process.chdir(oldWD);

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            try {
              assert.equal(log.total, 1, '1 commit');
              assert.equal(fs.readFileSync(path.join(dir, 'file1'), 'utf8'), 'data');
              assert.throws(fs.statSync.bind(fs, path.join(dir, 'file2')), 'file2 isn\'t deployed');
              done();
            } catch (e) {
              done(e);
            }
          });
        }, function(e) {
          console.log(e);
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });

  it('should update the gh-pages branch in the origin repo and publish files to it', function(done) {
    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file1'), 'data1');
      fs.writeFileSync(path.join(dir, 'file2'), 'data2');

      return simpleGit.add('file1')
                      .commit('Initial commit')
                      .addRemote('origin', dir)
                      .checkoutLocalBranch('gh-pages')
                      .add('file2')
                      .commit('Commit in gh-pages')
                      .checkout('master', function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          process.chdir(oldWD);

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            try {
              assert.equal(log.total, 3, '3 commits');
              assert.equal(fs.readFileSync(path.join(dir, 'file1'), 'utf8'), 'data1');
              assert.throws(fs.accessSync.bind(fs, path.join(dir, 'file2')), 'Old files are removed when deploying');
              done();
            } catch (e) {
              done(e);
            }
          });
        }, function() {
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });

  function deployDifferentRepoURL(done, repoURL) {
    ghPages.publish = function(dir, config, callback) {
      assert.equal(config.repo, 'https://oghliner@github.com/mozilla/oghliner.git');
      callback();
    };
    process.env.GH_TOKEN = 'oghliner';

    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file'), 'data');

      return simpleGit.add('file')
                      .commit('Initial commit')
                      .addRemote('origin', repoURL, function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          assert(true, 'Deploy\'s promise should be resolved');
          done();
        }, function() {
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  }

  it('should try to publish with a different repo URL (HTTPS)', function(done) {
    deployDifferentRepoURL(done, 'https://github.com/mozilla/oghliner.git');
  });

  it('should try to publish with a different repo URL (SSH)', function(done) {
    deployDifferentRepoURL(done, 'git@github.com:mozilla/oghliner.git');
  });

  function deployNoOriginRemote(done) {
    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file'), 'data');

      return simpleGit.add('file')
                      .commit('Initial commit', function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          assert(false, 'Deploy\'s promise should be rejected');
        }, function() {
          assert(true, 'Deploy\'s promise should be rejected');
        }).then(done, done);
      });
    });
  }

  it('should fail if there is no origin remote', deployNoOriginRemote);

  it('should fail if there is no origin remote', function(done) {
    process.env.GH_TOKEN = 'oghliner';
    deployNoOriginRemote(done);
  });

  function deployOutsideRepo(message) {
    var dir = temp.mkdirSync('oghliner');

    process.chdir(dir);

    return deploy({
      cloneDir: '.gh-pages-cache',
      message: message,
    }).then(function() {
      assert(false, 'Deploy\'s promise should be rejected');
    }, function() {
      assert(true, 'Deploy\'s promise should be rejected');
    });
  }

  it('should fail if called outside of a git repository with no commit message', function() {
    return deployOutsideRepo();
  });
  it('should fail if called outside of a git repository with commit message', function() {
    return deployOutsideRepo('message');
  });

  it('should fail if called outside of a git repository (on Travis) with no commit message', function() {
    process.env.GH_TOKEN = 'oghliner';
    return deployOutsideRepo();
  });
  it('should fail if called outside of a git repository (on Travis) with commit message', function() {
    process.env.GH_TOKEN = 'oghliner';
    return deployOutsideRepo('message');
  });

  it('should succeed if there\'s a node_modules directory in the rootDir', function(done) {
    var dir = temp.mkdirSync('oghliner');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file'), 'data');
      fs.mkdirSync(path.join(dir, 'node_modules'));

      return simpleGit.add('file')
                      .commit('Initial commit')
                      .addRemote('origin', dir, function() {
        process.chdir(dir);

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          assert(true, 'Deploy\'s promise should be resolved');
          done();
        }, function() {
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });

  function checkCommitMessage(message, expected) {
    return new Promise(function(resolve, reject) {
      var dir = temp.mkdirSync('oghliner');

      process.chdir(dir);

      childProcess.execSync('git init');
      fs.writeFileSync('file', 'data');
      childProcess.execSync('git add file');
      childProcess.execSync('git commit -m "' + message + '"');

      var output = '';
      var write = process.stdout.write;
      process.stdout.write = function(chunk, encoding, fd) {
        write.apply(process.stdout, arguments);
        output += chunk;

        if (output.indexOf('Deploying "' + expected + '" to GitHub Pages…') !== -1) {
          process.stdout.write = write;
          resolve();
        }
      };
    });
  }

  it('should prasd', function() {
    return Promise.all([
      checkCommitMessage('Do. Or do not.', 'Do. Or do not.'),
      deploy({
        cloneDir: '.gh-pages-cache',
      }).catch(function() {}),
    ]);
  });

  it('should print only the first line of a multiline commit', function() {
    return Promise.all([
      checkCommitMessage('Do. Or do not.\nThere is no try.', 'Do. Or do not.'),
      deploy({
        cloneDir: '.gh-pages-cache',
      }).catch(function() {}),
    ]);
  });
});
