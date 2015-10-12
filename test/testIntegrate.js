var assert = require('assert');
var fs = require('fs');
var integrate = require('../lib/integrate');

describe('Integrate', function() {
  it('should throw when the destination directory doesn\'t exist', function() {
    return integrate({
      dir: 'tmp',
    })
    .then(function() {
      assert(false);
    }, function() {
      assert(true);
    });
  });

  it('should throw when the offline-manager.js script doesn\'t exist', function() {
    fs.renameSync('app/scripts/offline-manager.js', 'app/scripts/offline-manager-temp.js');

    function cleanup() {
      fs.renameSync('app/scripts/offline-manager-temp.js', 'app/scripts/offline-manager.js');
    }

    var promise = integrate({
      dir: 'tmp',
    })
    .then(function() {
      assert(false);
    }, function() {
      assert(true);
    });

    promise.then(cleanup, cleanup);

    return promise;
  });

  it('should copy the offline-manager.js script in the destination directory', function() {
    fs.mkdirSync('tmp');

    function cleanup() {
      try {
        fs.unlinkSync('tmp/offline-manager.js');
      } catch (e) {}

      fs.rmdirSync('tmp');
    }

    var promise = integrate({
      dir: 'tmp',
    }).then(function() {
      var orig = fs.readFileSync('app/scripts/offline-manager.js');
      var copied = fs.readFileSync('tmp/offline-manager.js');
      assert(orig.equals(copied), 'offline-manager.js successfully copied');
    });

    promise.then(cleanup, cleanup);

    return promise;
  });
});
