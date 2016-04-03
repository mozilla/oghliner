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

var packageJson = require('./package.json');
var program = require('commander');
var promptly = require('promisified-promptly');
var fs = require('fs');
var chalk = require('chalk');

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
    .then(function() {
      process.exit(0);
    }, function(err) {
      process.stderr.write(chalk.red.bold(err) + '\n');
      process.exit(1);
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
      // return fse.removeSync('.gh-pages-cache');

      fs.access('.gitignore', function(err) {
        if (err) {
          process.stdout.write(chalk.blue.bold(
            'ℹ .gh-pages-cache is a temporary repository that we use to push changes\n' +
            '  to your gh-pages branch. We suggest you add it to your .gitignore.\n'
          ));
          return;
        }

        var gitignore = fs.readFileSync('.gitignore', 'utf8');

        if (gitignore.indexOf('.gh-pages-cache') === -1) {
          process.stdout.write(chalk.yellow.bold(
            '⚠ .gh-pages-cache is a temporary repository that I use to push\n' +
            '  changes to your gh-pages branch. It isn\'t in your .gitignore file,\n' +
            '  which means that Git will report it as an untracked file.\n\n'
          ));

          return promptly.confirm('Do you want to add .gh-pages-cache to .gitignore (Y/n)?', { default: true })
          .then(function(answer) {
            if (answer) {
              gitignore += '\n.gh-pages-cache\n';
              fs.writeFileSync('.gitignore', gitignore);
            }
          });
        }
      });
    })
    .catch(function(err) {
      process.stderr.write(chalk.red.bold(err) + '\n');
      process.exit(1);
    });
  });

program
  .command('offline [dir]')
  .description('offline the files in the directory by generating offline-worker.js script')
  .option('--file-globs [fileGlobs]', 'a comma-separated list of file globs to offline (default: \'**/*\')', '**/*')
  .option('--import-scripts <importScripts>', 'a comma-separated list of additional scripts to import into offline-worker.js')
  .option('--directory-indexes <directoryIndexes>', 'change files to be a directory only')
  .action(function(dir, options) {
    offline({
      rootDir: dir,
      fileGlobs: options.fileGlobs ? options.fileGlobs.split(',') : null,
      importScripts: options.importScripts ? options.importScripts.split(',') : null,
      directoryIndexes: options.directoryIndexes ? options.directoryIndexes.split(',') : null,
    })
    .catch(function(err) {
      process.stderr.write(chalk.red.bold(err) + '\n');
      process.exit(1);
    });
  });

program
  .command('bootstrap [dir]')
  .description('bootstrap the directory with a template app')
  .action(function(dir) {
    bootstrap({
      rootDir: dir,
    })
    .then(function() {
      process.exit(0);
    }, function(err) {
      process.stderr.write(chalk.red.bold(err) + '\n');
      process.exit(1);
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
        process.stderr.write(chalk.red.bold(err) + '\n');
        process.exit(1);
      });
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
