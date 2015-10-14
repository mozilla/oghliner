var assert = require('assert');
var fs = require('fs');
var path = require('path');
var temp = require('temp').track();
var ghslug = require('github-slug');
var rewire = require('rewire');
var offline = rewire('../lib/offline');

describe('Offline', function() {
  var oldWd;
  beforeEach(function() {
    oldWd = process.cwd();
  });

  afterEach(function() {
    process.chdir(oldWd);
    offline.__set__('ghslug', ghslug);
  });

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

  it('should use importScript in the service worker if the importScripts option is defined', function() {
    var dir = temp.mkdirSync('tmp');

    fs.writeFileSync('a-script.js', 'something');

    return offline({
      rootDir: dir,
      importScripts: [ 'a-script.js', ],
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('importScripts("a-script.js");'), -1);
    });
  });

  it('should use the GitHub slug as the cache ID if it is available', function() {
    var rootDir = temp.mkdirSync('tmp');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    offline.__set__('ghslug', function(path, callback) {
      callback(null, 'mozilla/oghliner');
    });

    process.chdir(rootDir);

    return offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('mozilla/oghliner'), -1);
    });
  });

  it('should use the app name from package.json as the cache ID if the GitHub slug is not available', function() {
    var rootDir = temp.mkdirSync('tmp');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({
      name: 'test_name',
    }));

    process.chdir(rootDir);

    return offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('test_name'), -1);
    });
  });

  it('should not fail if both the GitHub slug and package.json are not available', function() {
    var rootDir = temp.mkdirSync('tmp');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    process.chdir(rootDir);

    return offline({
      rootDir: dir,
    }).then(function() {
      assert.doesNotThrow(fs.accessSync.bind(fs, path.join(dir, 'offline-worker.js')));
    });
  });

  it('should cache files in rootDir', function() {
    var rootDir = temp.mkdirSync('tmp');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    fs.writeFileSync(path.join(dir, 'test_file_1.js'), 'test_file_1');
    fs.writeFileSync(path.join(dir, 'test_file_2.js'), 'test_file_2');
    fs.writeFileSync(path.join(dir, 'test_file_3.js'), 'test_file_3');

    process.chdir(rootDir);

    return offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('test_file_1.js'), -1);
      assert.notEqual(content.indexOf('test_file_2.js'), -1);
      assert.notEqual(content.indexOf('test_file_3.js'), -1);
    });
  });
});
