var assert = require('assert');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var deploy = require('../lib/deploy');

describe('Deploy', function() {
  afterEach(function() {
    fse.removeSync('tmp');
  });

  it('should create a gh-pages branch in the origin repo and publish files to it', function(done) {
    fs.mkdirSync('tmp');

    var simpleGit = require('simple-git')('tmp');

    simpleGit.init(function() {
      fs.writeFileSync('tmp/file', 'data');

      return simpleGit.add('file')
                      .commit('Initial commit')
                      .addRemote('origin', path.join(process.cwd(), 'tmp'), function() {
        process.chdir('tmp');

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          process.chdir('..');

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            try {
              assert.equal(log.total, 1, '1 commit');
              assert.equal(fs.readFileSync('tmp/file', 'utf8'), 'data');
              done();
            } catch (e) {
              done(e);
            }
          });
        }, function() {
          process.chdir('..');
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });

  it('should update the gh-pages branch in the origin repo and publish files to it', function(done) {
    fs.mkdirSync('tmp');

    var simpleGit = require('simple-git')('tmp');

    simpleGit.init(function() {
      fs.writeFileSync('tmp/file1', 'data1');
      fs.writeFileSync('tmp/file2', 'data2')

      return simpleGit.add('file1')
                      .commit('Initial commit')
                      .addRemote('origin', path.join(process.cwd(), 'tmp'))
                      .checkoutLocalBranch('gh-pages')
                      .add('file2')
                      .commit('Commit in gh-pages')
                      .checkout('master', function() {
        process.chdir('tmp');

        return deploy({
          cloneDir: '.gh-pages-cache',
        }).then(function() {
          process.chdir('..');

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            try {
              assert.equal(log.total, 3, '3 commits');
              assert.equal(fs.readFileSync('tmp/file1', 'utf8'), 'data1');
              assert(!fs.existsSync('tmp/file2'), 'Old files are removed when deploying');
              done();
            } catch (e) {
              done(e);
            }
          });
        }, function() {
          process.chdir('..');
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(done);
      });
    });
  });
});
