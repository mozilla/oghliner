[![Build Status](https://travis-ci.org/mozilla/oghliner.svg?branch=master)](https://travis-ci.org/mozilla/oghliner)
[![dependencies](https://david-dm.org/mozilla/oghliner.svg)](https://david-dm.org/mozilla/oghliner)
[![devdependencies](https://david-dm.org/mozilla/oghliner/dev-status.svg)](https://david-dm.org/mozilla/oghliner#info=devDependencies)

# Oghliner

Oghliner is a Node tool to deploy Offline Web Apps to GitHub Pages.

Offline Web Apps are web apps that cache their files (HTML, JavaScript, CSS, images, etc.) on the client, so they work even when your network doesn't. [GitHub Pages](https://pages.github.com/) is a simple host for static files.

Oghliner offlines an app by generating a [Service Worker](https://github.com/slightlyoff/ServiceWorker/blob/master/explainer.md) for it. It deploys the app by committing it to the *gh-pages* branch of the repository being deployed.

Oghliner includes commands for bootstrapping an app from scratch or integrating its functionality into your existing app. It can also configure [Travis CI](https://travis-ci.org) to automatically deploy your app when you merge changes to its master branch.

Oghliner has both command-line and module interfaces and provides five commands: *bootstrap*, *integrate*, *offline*, *deploy*, and *configure*. All commands are available via both interfaces, but the CLI is more appropriate for the *bootstrap*, *integrate*, and *configure* commands, which you'll invoke at most once per app; while the module is more appropriate for the *offline* and *deploy* commands, which you'll call each time you change your app and rebuild it.

## Getting Started

To use the CLI, install Oghliner globally:

```
npm install --global oghliner
```

To use the module, install Oghliner locally and save it to your *dependencies*:

```
npm install --save oghliner
```

Then *require* it in your script(s):

```js
var oghliner = require('oghliner');
```

## Bootstrap

The *bootstrap* command creates an initial set of directories and files for a new app. To use it, first [create a repository on GitHub](https://github.com/new) and clone it to your local machine:

```
git clone git@github.com:mykmelez/offline-app.git
```

Then change to its working directory and invoke `oghliner bootstrap`:

```
cd offline-app/
oghliner bootstrap
```

Oghliner will bootstrap your app by copying files from its app template to the current directory:

```
Bootstrapping current directory as Oghliner app…

Your app's configuration is:

Name: offline-app
Repository: git@github.com:mykmelez/offline-app.git
Description: A template app bootstrapped with oghliner.
License: Apache-2.0

Would you like to change its configuration (y/N)? n

Creating files…
✓ Creating README.md
✓ Creating app
✓ Creating .gitignore
✓ Creating gulpfile.js
✓ Creating package.json
✓ Creating app/favicon.ico
✓ Creating app/fonts
✓ Creating app/images
✓ Creating app/index.html
✓ Creating app/robots.txt
✓ Creating app/scripts
✓ Creating app/styles
✓ Creating app/images/apple-touch-icon-114x114.png
✓ Creating app/images/apple-touch-icon-120x120.png
✓ Creating app/images/apple-touch-icon-144x144.png
✓ Creating app/images/apple-touch-icon-152x152.png
✓ Creating app/images/apple-touch-icon-57x57.png
✓ Creating app/images/apple-touch-icon-60x60.png
✓ Creating app/images/apple-touch-icon-72x72.png
✓ Creating app/images/apple-touch-icon-76x76.png
✓ Creating app/images/favicon-128x128.png
✓ Creating app/images/favicon-16x16.png
✓ Creating app/images/favicon-196x196.png
✓ Creating app/images/favicon-32x32.png
✓ Creating app/images/favicon-96x96.png
✓ Creating app/images/mstile-144x144.png
✓ Creating app/images/mstile-150x150.png
✓ Creating app/images/mstile-310x150.png
✓ Creating app/images/mstile-310x310.png
✓ Creating app/images/mstile-70x70.png
✓ Creating app/scripts/main.js
✓ Creating app/scripts/offline-manager.js
✓ Creating app/styles/stylesheet.css

✓ Creating files… done!
✓ Installing npm dependencies… done!

Your app has been bootstrapped! Just commit the changes and push the commit
to the origin/master branch:

git add --all && git commit -m"initial version of Oghliner app"
git push origin master

Then you can build, offline, and deploy the app using gulp commands.

ℹ For more information about building, offlining and deployment, see:
    https://mozilla.github.io/oghliner/
```

Then just commit the changes and push the commit to the origin/master branch:

```
git add --all && git commit -m"initial version of Oghliner app"
git push origin master
```

Note: To bootstrap an app into a different directory than the current one, specify its path when invoking *bootstrap*:

```
oghliner bootstrap path/to/another/clone/
```

## Integrate

The *integrate* command adds Oghliner functionality into an existing app. To use it, invoke `oghliner integrate`, passing it the path to the directory containing your app's scripts:

```
oghliner integrate app/scripts/
```

Oghliner will copy the *offline-manager.js* script to that directory:

```
Integrating Oghliner into the app in the current directory…

✓ Copying offline-manager.js to app/scripts/… done!

Oghliner has been integrated into the app!

The app needs to load the script offline-manager.js in order to register
the service worker that offlines the app. To load the script, add this line
to the app's HTML page(s)/template(s):

<script src="app/scripts/offline-manager.js"></script>

And commit the changes and push the commit to the origin/master branch:

git commit -m"integrate Oghliner" --all
git push origin master

Then you can offline and deploy the app using the offline and deploy commands.

ℹ For more information about offlining and deployment, see:
    https://mozilla.github.io/oghliner/
```

Then add a &lt;script> tag referencing that script to your app's HTML page(s)/template(s). Oghliner will suggest one, but it doesn't necessarily know your app's directory structure, so make sure it contains the correct path to the file!

## Offline

The *offline* command generates a service worker that caches your app's files on the client.

To use it via the command line, invoke `oghliner offline`, passing it a *rootDir* argument specifying the directory containing the files to offline:

```
oghliner offline dist/
```

To use it via the module, call `oghliner.offline`, passing it an *options* object with a *rootDir* property specifying the directory containing the files to offline:

```js
oghliner.offline({
  rootDir: 'dist/',
});
```

If left unspecified, the default value of *rootDir* is `./`, i.e. the current directory.

Note: *rootDir* should be the *target* directory containing the output of your build process, not the *source* directory containing the original files. For example, if your source files are in *app/*, and your build process outputs into *dist/*, then you should specify the *dist/* directory.

### Options

The *offline* command takes the following options:

- `--file-globs glob,…` or `fileGlobs: ['glob', …]` - a comma-separated list of globs identifying the files to offline (default: `**/*`). The globs are matched inside *rootDir*.
- `--import-scripts script,…` or `importScripts: ['script', …]` - a comma-separated list of additional scripts to evaluate in the service worker (no default value). This is useful, for example, when you want to use the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

## Deploy

The *deploy* command deploys your app to GitHub Pages by committing its files to the *gh-pages* branch of the repository and pushing the commit to GitHub.

To use it via the command line, invoke `oghliner deploy`, passing it a *rootDir* argument specifying the directory containing the files to deploy:

```
oghliner deploy dist/
```

To use it via the module, call `oghliner.deploy`, passing it an *options* object with a *rootDir* property specifying the directory containing the files to deploy:

```js
oghliner.deploy({
  rootDir: 'dist/',
});
```

If left unspecified, the default value of *rootDir* is `./`, i.e. the current directory.

Note: *rootDir* should be the *target* directory containing the output of your build process, not the *source* directory containing the original files. For example, if your source files are in *app/*, and your build process outputs into *dist/*, then you should specify the *dist/* directory.

### Options

The *deploy* command takes the following options via both the CLI and the module:

- `-m, --message message` or `message: 'message'` - the message for the commit to the *gh-pages* branch

The *deploy* command takes the following options via the module only:

- `cloneDir: 'dir'` - the directory into which Oghliner will create a temporary clone of the repository while deploying the app (default is implementation detail). This is mostly useful internally, for implementation of the CLI.
- `fileGlobs: ['glob', …]` - a comma-separated list of globs identifying the files to offline (default: `**/*`). The globs are matched inside *rootDir*.
- `remote: 'remote'` - the Git remote to which to push the *gh-pages* branch (default: `origin`).

## Configure

The *configure* command configures Travis to automatically deploy an app to GitHub Pages when you push to its *master* branch.

To use it, invoke `oghliner configure` within your local working directory:

```
oghliner configure
```

Oghliner will create a GitHub token that authorizes Travis to push changes to your repository, then configure Travis to use the token to deploy changes.

```
Configuring Travis to auto-deploy to GitHub Pages…

Your repository has a single remote, origin.
Ok, I'll configure Travis to auto-deploy the origin remote (mykmelez/offline-app).

To check the status of your repository in Travis and authorize Travis to push
to it, I'll create GitHub personal access tokens, for which I need your GitHub
username and password (and two-factor authentication code, if appropriate).

ℹ For more information about GitHub personal access tokens, see:
    https://github.com/settings/tokens

Username: mykmelez
Password:

× Checking credentials… error!

You're using two-factor authentication with GitHub.
Please enter the code provided by your authentication software.

Auth Code: 123456

✓ Checking credentials… done!
✓ Creating temporary GitHub token for getting Travis token… done!
✓ Getting Travis token… done!
✓ Deleting temporary GitHub token for getting Travis token… done!
✓ Creating permanent GitHub token for Travis to push to the repository… done!
✓ Checking the status of your repository in Travis… done!
✓ I didn't find your repository in Travis; syncing Travis with GitHub… done!
✓ Checking the status of your repository in Travis… done!
✓ Your repository isn't active in Travis yet; activating it… done!
✓ Encrypting permanent GitHub token… done!
✓ Writing configuration to .travis.yml file… done!

⚠ You didn't already have a .travis.yml file, so I created one for you.
  For more information about the file, see:
    http://docs.travis-ci.com/user/customizing-the-build/

You're ready to auto-deploy using Travis!  Just commit the changes
in .travis.yml and push the commit to the origin/master branch:

git add .travis.yml
git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml
git push origin master

Then visit https://travis-ci.org/mykmelez/offline-app/builds to see the build status.
```

After configuring the repository, add and commit the changes to *.travis.yml* and push the *master* branch to the *origin* remote on GitHub to make Travis build and auto-deploy your app:

```
git add .travis.yml
git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml
git push origin master
```

You can see the status of a build/deployment at `https://travis-ci.org/USERNAME/REPOSITORY/builds`. For example, the status of builds for https://github.com/mykmelez/eggtimer/ is at https://travis-ci.org/mykmelez/eggtimer/builds.

Once configured, Travis deploys successful builds via `gulp deploy`. You can change the deploy command by editing your .travis.yml file.

Note: Oghliner needs your GitHub credentials to create the token, and the token gives Travis limited access to your GitHub account. Specifically, the token provides the *public_repo* [scope](https://developer.github.com/v3/oauth/#scopes), which gives Travis "read/write access to code, commit statuses, collaborators, and deployment statuses for public repositories and organizations." For more information about personal access tokens, see [Creating an access token for command-line use](https://help.github.com/articles/creating-an-access-token-for-command-line-use/).

## Build Process Integration

You can integrate Oghliner into your Node-based build process via its module interface. This is particularly helpful for the *offline* and *deploy* commands, which you'll call each time you change your app and rebuild it.

To do so, first install Oghliner locally and save it to your *dependencies*:

```
npm install --save oghliner
```

Then require the module in your build script and call its *offline* function, passing *options* to configure its behavior. For example, if you use Gulp to build your app, you could add code like this to your gulpfile.js:

```js
var oghliner = require('oghliner');

gulp.task('offline', function() {
  return oghliner.offline({
    rootDir: 'dist/',
    fileGlobs: [
      '**/*.html',
      'js/**/*.js',
    ],
  });
});

gulp.task('deploy', function() {
  return oghliner.deploy({
    rootDir: 'dist/',
  });
});
```

Then you could invoke `gulp offline && gulp deploy` to offline and deploy your app.

## Gulp Integration

If you used Oghliner to bootstrap your app, then it already has a gulpfile.js with tasks for building, offlining, and deploying your app.  To use it, install Gulp globally:

```
npm install --global gulp
```

Then invoke `gulp` to build and offline your app and `gulp deploy` to deploy it:

```
gulp && gulp deploy
```
