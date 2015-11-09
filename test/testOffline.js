var promisify = require('promisify-node');
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var temp = require('temp').track();
var ghslug = promisify(require('github-slug'));
var rewire = require('rewire');
var offline = rewire('../lib/offline');

function checkWrite(expected, unexpected, end) {
  return new Promise(function(resolve, reject) {
    var nextExpected = expected.shift();
    var nextUnexpected = unexpected.shift();

    var output = '';
    write = process.stdout.write;
    process.stdout.write = function(chunk, encoding, fd) {
      write.apply(process.stdout, arguments);
      output += chunk;

      if (nextExpected && output.indexOf(nextExpected) !== -1) {
        nextExpected = expected.shift();
      }

      if (nextUnexpected && output.indexOf(nextUnexpected) !== -1) {
        process.stdout.write = write;
        reject(new Error('Unexpected warning (' + nextUnexpected + ') has been printed'));
        return;
      }

      if (output.indexOf(end) !== -1) {
        process.stdout.write = write;
        if (!nextExpected) {
          resolve();
        } else {
          reject(new Error('Expected warning (' + nextExpected + ') hasn\'t been printed'));
        }
      }
    };
  });
}

describe('Offline', function() {
  var oldWd = process.cwd();

  afterEach(function() {
    process.chdir(oldWd);
    offline.__set__('ghslug', ghslug);
  });

  it('should create offline-worker.js in the destination directory', function() {
    var dir = temp.mkdirSync('oghliner');

    return offline({
      rootDir: dir,
    }).then(function() {
      assert.doesNotThrow(fs.accessSync.bind(fs, path.join(dir, 'offline-worker.js')));
    });
  });

  it('should not fail if the destination directory already contains a offline-worker.js file', function() {
    var dir = temp.mkdirSync('oghliner');

    fs.writeFileSync(path.join(dir, 'offline-worker.js'), 'something');

    return offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content, 'something');
    });
  });

  it('should use importScript in the service worker if the importScripts option is defined', function() {
    var dir = temp.mkdirSync('oghliner');
    fs.writeFileSync(path.join(dir, 'a-script.js'), 'data');

    return offline({
      rootDir: dir,
      importScripts: [ 'a-script.js', ],
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('importScripts("a-script.js");'), -1);
    });
  });

  it('should fail if an entry in importScript is a directory', function() {
    var dir = temp.mkdirSync('oghliner');
    fs.mkdirSync(path.join(dir, 'subDir'));

    return offline({
      rootDir: dir,
      importScripts: [ 'subDir', ],
    }).then(function() {
      assert(false);
    }, function() {
      assert(true);
    });
  });

  it('should fail if a file in importScript doesn\'t exist', function() {
    var dir = temp.mkdirSync('oghliner');

    return offline({
      rootDir: dir,
      importScripts: [ 'a-script.js', ],
    }).then(function() {
      assert(false);
    }, function() {
      assert(true);
    });
  });

  it('should use the GitHub slug as the cache ID if it is available', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    offline.__set__('ghslug', function(path) {
      return new Promise(function(resolve, reject) {
        resolve('mozilla/oghliner');
      });
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
    var rootDir = temp.mkdirSync('oghliner');
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
    var rootDir = temp.mkdirSync('oghliner');
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
    var rootDir = temp.mkdirSync('oghliner');
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

  it('should not cache files in rootDir that do not match fileGlobs', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    fs.writeFileSync(path.join(dir, 'test_file_1.js'), 'test_file_1');
    fs.writeFileSync(path.join(dir, 'test_file_2.js'), 'test_file_2');
    fs.writeFileSync(path.join(dir, 'test_file_3.js'), 'test_file_3');

    process.chdir(rootDir);

    return offline({
      rootDir: dir,
      fileGlobs: [
        'test_file_1.js',
        'test_file_3.js',
      ],
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('test_file_1.js'), -1);
      assert.equal(content.indexOf('test_file_2.js'), -1);
      assert.notEqual(content.indexOf('test_file_3.js'), -1);
    });
  });

  it('should cache files in a subdirectory of rootDir', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);
    var subDir = path.join(dir, 'subdir');
    fs.mkdirSync(subDir);

    fs.writeFileSync(path.join(subDir, 'test_file_1.js'), 'test_file_1');
    fs.writeFileSync(path.join(subDir, 'test_file_2.js'), 'test_file_2');
    fs.writeFileSync(path.join(subDir, 'test_file_3.js'), 'test_file_3');

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

  it('should cache large files', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    var content = new Buffer(4 * 1024 * 1024);

    fs.writeFileSync(path.join(dir, 'test_file_1.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_2.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_3.js'), content);

    process.chdir(rootDir);

    var checkWarnings = checkWrite([
      'test_file_1.js is bigger than 2 MiB',
      'test_file_2.js is bigger than 2 MiB',
      'test_file_3.js is bigger than 2 MiB',
    ], [], 'Total precache size');

    var offlinePromise = offline({
      rootDir: dir,
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('test_file_1.js'), -1);
      assert.notEqual(content.indexOf('test_file_2.js'), -1);
      assert.notEqual(content.indexOf('test_file_3.js'), -1);
    });

    return Promise.all([ checkWarnings, offlinePromise ]);
  });

  it('should not cache excluded files', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    var content = new Buffer(4 * 1024 * 1024);

    fs.writeFileSync(path.join(dir, 'test_file_1.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_2.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_3.js'), content);

    process.chdir(rootDir);

    var checkWarnings = checkWrite([
      'test_file_2.js is bigger than 2 MiB',
      'test_file_3.js is bigger than 2 MiB',
    ], [
      'test_file_1.js is bigger than 2 MiB',
    ], 'Total precache size');

    var offlinePromise = offline({
      rootDir: dir,
      fileGlobs: [
        '!(test_file_1.js)',
      ],
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.equal(content.indexOf('test_file_1.js'), -1);
      assert.notEqual(content.indexOf('test_file_2.js'), -1);
      assert.notEqual(content.indexOf('test_file_3.js'), -1);
    });

    return Promise.all([ checkWarnings, offlinePromise ]);
  });

  it('should not warn about explicitly included files', function() {
    var rootDir = temp.mkdirSync('oghliner');
    var dir = path.join(rootDir, 'dist');
    fs.mkdirSync(dir);

    var content = new Buffer(4 * 1024 * 1024);

    fs.writeFileSync(path.join(dir, 'test_file_1.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_2.js'), content);
    fs.writeFileSync(path.join(dir, 'test_file_3.js'), content);

    process.chdir(rootDir);

    var checkWarnings = checkWrite([
      'test_file_2.js is bigger than 2 MiB',
      'test_file_3.js is bigger than 2 MiB',
    ], [
      'test_file_1.js is bigger than 2 MiB',
    ], 'Total precache size');

    var offlinePromise = offline({
      rootDir: dir,
      fileGlobs: [
        '*',
        'test_file_1.js',
      ],
    }).then(function() {
      var content = fs.readFileSync(path.join(dir, 'offline-worker.js'), 'utf8');
      assert.notEqual(content.indexOf('test_file_1.js'), -1);
      assert.notEqual(content.indexOf('test_file_2.js'), -1);
      assert.notEqual(content.indexOf('test_file_3.js'), -1);
    });

    return Promise.all([ checkWarnings, offlinePromise ]);
  });
});
