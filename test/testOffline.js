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
      fs.accessSync(path.join(dir, 'offline-worker.js'));
    });
  });
});
