var assert = require('assert');
var fs = require('fs');
var path = require('path');
var temp = require('temp').track();
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

  it('should throw when the destination directory isn\'t a directory', function() {
    return integrate({
      dir: 'package.json',
    })
    .then(function() {
      assert(false);
    }, function() {
      assert(true);
    });
  });

  it('should copy the offline-manager.js script in the destination directory', function() {
    var dir = temp.mkdirSync('tmp');

    return integrate({
      dir: dir,
    }).then(function() {
      var orig = fs.readFileSync('templates/app/scripts/offline-manager.js');
      var copied = fs.readFileSync(path.join(dir, 'offline-manager.js'));
      assert(orig.equals(copied), 'offline-manager.js successfully copied');
    });
  });
});
