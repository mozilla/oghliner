var assert = require('assert');
var fs = require('fs');
var path = require('path');
var temp = require('temp').track();
var offline = require('../lib/offline');

describe('Offline', function() {
  it('should create offline-worker.js in the destination directory', function() {
    var dir = temp.mkdirSync('tmp');

    return offline({
      rootDir: dir,
    }).then(function() {
      assert.doesNotThrow(fs.accessSync.bind(fs, path.join(dir, 'offline-worker.js')));
    });
  });

  it('should not fail if the destination directory already contains a offline-worker.js file', function() {
    var dir = temp.mkdirSync('tmp');

    fs.writeFileSync(path.join(dir, 'offline-worker.js'), 'something');

    return offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content, 'something');
    });
  });
});
