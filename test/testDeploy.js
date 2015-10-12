var assert = require('assert');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var deploy = require('../lib/deploy');

describe('Deploy', function() {
  it('should create a gh-pages branch in the origin repo and publish files to it', function(done) {
    fs.mkdirSync('tmp');

    function finish(err) {
      fse.removeSync('tmp');
      done(err);
    }

    var simpleGit = require('simple-git')('tmp');

    simpleGit.init(function() {
      fs.writeFileSync('tmp/file', 'data');

      return simpleGit.add('file')
                      .commit('Initial commit')
                      .addRemote('origin', path.join(process.cwd(), 'tmp'), function() {
        process.chdir('tmp');

        return deploy({}).then(function() {
          process.chdir('..');

          return simpleGit.checkout('gh-pages').log(function(err, log) {
            assert.equal(log.total, 1, '1 commit');
            assert.equal(fs.readFileSync('tmp/file', 'utf8'), 'data');
            finish();
          });
        }, function() {
          process.chdir('..');
          assert(false, 'Deploy\'s promise should be resolved');
        }).catch(finish);
      });
    });
  });
});
