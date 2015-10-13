var promisify = require('promisify-node');
var expect = require('chai').expect;
var childProcess = require('child_process');
var temp = promisify(require('temp'));
var bootstrap = require('../lib/bootstrap');
var glob = require('glob');
var fs = require('fs');

describe('Bootstrap', function() {
  var appName = 'test-bootstrap'
  var oldWd;
  before(function() {
    temp.track();
    return temp.mkdir('pdfcreator').then(function(dirPath) {
      oldWd = process.cwd();
      process.chdir(dirPath);
      childProcess.execSync('git init');
      childProcess.execSync('git remote add upstream https://github.com/mozilla/oghliner.git');
      return bootstrap({
        template: {
          name: appName
        },
        npmInstall: false,
      });
    });
  });

  it('should create files supporting files', function() {
    expect(glob.sync('.gitignore').length).to.equal(1);
    expect(glob.sync('package.json').length).to.equal(1);
    expect(glob.sync('gulpfile.js').length).to.equal(1);
  });

  it('should create some temple app files', function() {
    expect(glob.sync('**/*.html').length).to.above(0);
    expect(glob.sync('**/*.css').length).to.above(0);;
    expect(glob.sync('**/*.png').length).to.above(0);
  });

  it('should set the app name', function() {
    var package = JSON.parse(fs.readFileSync('package.json'));
    expect(package.name).to.equal(appName);
  });

  after(function() {
    process.chdir(oldWd);
    temp.cleanupSync();
  });
});
