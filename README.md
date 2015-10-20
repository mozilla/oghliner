Oghliner is an experimental template and tool for deploying Offline Web Apps to GitHub Pages.

As a template, Oghliner can be used to bootstrap an offline app that deploys to your GitHub Pages site. As a tool, Oghliner adds offlining and deployment into your existing app.

[![Build Status](https://travis-ci.org/mozilla/oghliner.svg)](https://travis-ci.org/mozilla/oghliner)
[![dependencies](https://david-dm.org/mozilla/oghliner.svg)](https://david-dm.org/mozilla/oghliner)
[![devdependencies](https://david-dm.org/mozilla/oghliner/dev-status.svg)](https://david-dm.org/mozilla/oghliner#info=devDependencies)

Using The Template
------------------

To bootstrap an offline web app, create a repository on GitHub and then clone to your local machine.

```bash
git clone git@github.com:mykmelez/test-app.git
cd test-app
```

If you haven't already, install gulp and oghliner.

```bash
npm install -g gulp oghliner
```

Then bootstrap your app with the bootstrap command which puts assets in *app/* and includes a simple *gulpfile.js* that builds to *dist/*, but you can modify the build any way you like.

```bash
oghliner bootstrap
```

Invoke `gulp` to rebuild your app and regenerate the script that offlines it. Invoke `gulp deploy` to publish it to GitHub Pages.

```bash
gulp && gulp deploy
```

At least one commit to the repository is required for successful deploy.  The following could be used to commit the changes by Oghliner to the repository:

```bash
git add . && git commit -m "Initial version of app"
```

Using The Tool
--------------

To integrate offlining and deployment into your existing app, `npm install -g oghliner`, then run `oghliner offline [root-dir]` to offline your app (i.e. regenerate the offline-worker.js script) and `oghliner deploy [root-dir]` to deploy it.  Both commands take an optional *root-dir* argument that specifies the directory to offline/deploy. Its default value is the current directory (`./`).

The *offline* command also allows you to specify these options:

- *--file-globs*: a comma-separated list of file globs to offline (default: `**/*`). The files specified by *--file-globs* are matched inside *root-dir*.
- *--import-scripts*: a comma-separated list of additional scripts to import into offline-worker.js. This is useful, for example, when you want to use the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

Alternately, you can `npm install --save oghliner` and then add tasks to your *gulpfile.js* which call *oghliner.offline* and *oghliner.deploy*, for example:

```js
var oghliner = require('oghliner');

gulp.task('offline', function(callback) {
  oghliner.offline({
    rootDir: 'dist/',
    fileGlobs: [
      '**/*.html',
      'js/**/*.js',
    ],
  }, callback);
});

gulp.task('deploy', function(callback) {
  oghliner.deploy({
    rootDir: 'dist/',
  }, callback);
});
```

The *oghliner.offline* task takes a *config* object and a *callback*. The properties of the *config* object are:
- *rootDir*: the directory to offline (default: `./`);
- *fileGlobs*: an array of file globs to offline (default: `['**/*']`). The files specified by *fileGlobs* are matched inside *rootDir*.
- *importScripts*: an array of additional scripts to import into offline-worker.js (default: `[]`). This is useful, for example, when you want to use the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

*oghliner.deploy* deploys your files to GitHub Pages. It takes a *config* object and a *callback*. The properties of the *config* object are:

- *rootDir*: the directory to deploy (default: `./`).

Finally, in order for offline-worker.js to be evaluated, you need to load the offline manager script in your app by copying it to the location of your other scripts. To do this, use the *integrate* command (or *oghliner.integrate* function):

```bash
oghliner integrate path/to/your/scripts/
```

Automatic Deployment Via Travis
-------------------------------

Oghliner can configure a repository to automatically deploy to GitHub Pages whenever you push to its *master* branch. Auto-deploy uses [Travis CI](https://travis-ci.org/), a continuous integration service. Oghliner takes care of most of the steps to configure your repository to auto-deploy via Travis.

If you bootstrapped your app from the template, your repository already has a suitable Travis configuration file (.travis.yml) and a *configure* task in gulpfile.js. Just `gulp configure` to configure your repository.

If you integrated the tool into an existing app, `npm install -g oghliner && oghliner configure` to configure your repository.

Oghliner will prompt you for your GitHub credentials in order to create a token that authorizes Travis to push changes to your repository. The token will give Travis limited access to your GitHub account. Specifically: it will have the *public_repo* [scope](https://developer.github.com/v3/oauth/#scopes), which gives it "read/write access to code, commit statuses, collaborators, and deployment statuses for public repositories and organizations."

After configuring the repository, add and commit the changes to *.travis.yml* and push the *master* branch to the *origin* remote on GitHub to make Travis build and auto-deploy your app:

```bash
> git commit -m"configure Travis to auto-deploy to GitHub Pages" .travis.yml
> git push origin master
```

You can see the status of a build/deployment at https://travis-ci.org/*your-GitHub-username*/*your-repository-name*/builds. For example, the status of builds for https://github.com/mykmelez/eggtimer/ is at https://travis-ci.org/mykmelez/eggtimer/builds.

If the build was successful, Travis will deploy the site via `gulp deploy`. Expand the log entry to see details about the deployment:

```bash
$ [ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && gulp deploy
[23:34:13] Using gulpfile ~/build/mykmelez/eggtimer/gulpfile.js
[23:34:13] Starting 'deploy'...
[23:34:15] Finished 'deploy' after 1.96 s
```
