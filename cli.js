#! /usr/bin/env node

/**
 * Copyright 2015 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Import this first so we can use it to wrap other modules we import.
var promisify = require("promisify-node");

var packageJson = require('./package.json');
var program = require('commander');
var rimraf = promisify(require('rimraf'));
var promptly = promisify(require('promptly'));
var fs = promisify(require('fs'));

// The scripts that implement the various commands/tasks we expose.
var configure = require('./lib/configure');
var deploy = require('./lib/deploy');
var offline = require('./lib/offline');
var bootstrap = require('./lib/bootstrap');
var integrate = require('./lib/integrate');

program
  .version(packageJson.version);

program
  .command('configure')
  .description('configure repository to auto-deploy to GitHub Pages using Travis CI')
  .action(function(env, options) {
    configure()
    .catch(function(err) {
      console.error(err);
    });
  });

program
  .command('deploy [dir]')
  .description('deploy directory to GitHub Pages')
  .option('-m, --message <message>', 'commit message')
  .action(function(dir, options) {
    deploy({
      rootDir: dir,
      cloneDir: '.gh-pages-cache',
      message: options.message,
    })
    .then(function() {
      // For perf, don't delete the repository.  This means users will have to
      // add .gh-pages-cache to their .gitignore file to hide its `git status`.
      // return rimraf('.gh-pages-cache');

      fs.access('.gitignore').then(function() {
        var gitignore = fs.readFileSync('.gitignore', 'utf8');

        if (gitignore.indexOf('.gh-pages-cache') === -1) {
          promptly.prompt('.gh-pages-cache is a temporary repository that we use to push changes to your gh-pages branch. Do you want to add it to .gitignore (Y/N, suggested Y): ', {
            default: 'Y',
            retry: true,
            validator: function(val) {
              val = val.toUpperCase();
              if (val !== 'N' && val !== 'Y') {
                throw new Error('Value should be Y or N');
              }
              return val;
            },
          }).then(function(answer) {
            if (answer === 'Y') {
              gitignore += '\n.gh-pages-cache\n';
              fs.writeFileSync('.gitignore', gitignore);
            }
          });
        }
      }).catch(function() {
        console.log('.gh-pages-cache is a temporary repository that we use to push changes to your gh-pages branch. We suggest you add it to your .gitignore.');
      });
    })
    .catch(function(err) {
      console.error(err);
    });
  });

program
  .command('offline [dir]')
  .description('offline the files in the directory by generating offline-worker.js script')
  .option('--file-globs [fileGlobs]', 'a comma-separated list of file globs to offline (default: \'**/*\')', '**/*')
  .option('--import-scripts <importScripts>', 'a comma-separated list of additional scripts to import into offline-worker.js')
  .action(function(dir, options) {
    offline({
      rootDir: dir,
      fileGlobs: options.fileGlobs ? options.fileGlobs.split(',') : null,
      importScripts: options.importScripts ? options.importScripts.split(',') : null,
    })
    .catch(function(err) {
      console.error(err);
    });
  });

program
  .command('bootstrap [dir]')
  .description('bootstrap the directory with a template app')
  .action(function(dir) {
    bootstrap({
      rootDir: dir,
    })
    .catch(function(err) {
      console.error(err);
    });
  });

  program
    .command('integrate [dir]')
    .description('integrate the offline-manager.js script into your app')
    .action(function(dir) {
      integrate({
        dir: dir,
      })
      .catch(function(err) {
        console.error(err);
      });
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
