var assert = require('assert');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var temp = require('temp').track();
var deploy = require('../lib/deploy');

describe('Deploy', function() {
  var oldWD = process.cwd();

  afterEach(function() {
    process.chdir(oldWD);
  });

  it('should create a gh-pages branch in the origin repo and publish files to it', function(done) {
    var dir = temp.mkdirSync('tmp');

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

  it('should update the gh-pages branch in the origin repo and publish files to it', function(done) {
    var dir = temp.mkdirSync('tmp');

    var simpleGit = require('simple-git')(dir);

    simpleGit.init(function() {
      fs.writeFileSync(path.join(dir, 'file1'), 'data1');
      fs.writeFileSync(path.join(dir, 'file2'), 'data2')

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
              assert(!fs.existsSync(path.join(dir, 'file2')), 'Old files are removed when deploying');
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
});
