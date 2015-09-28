Oghliner is an experimental template and tool for deploying Offline Web Apps to GitHub Pages.

As a template, Oghliner can be used to bootstrap an offline app that deploys to your GitHub Pages site. As a tool, Oghliner adds offlining and deployment into your existing app.

Using The Template
------------------

To bootstrap an offline web app, fork this repository on GitHub, clone the fork to your local machine, and `npm install`. If you don't have [gulp](http://gulpjs.com/) installed, also `npm install -g gulp`.

Then `gulp && gulp deploy` to build your app and deploy it to GitHub Pages. Your app will appear at https://*your-GitHub-username*.github.io/oghliner/. For example, if @mykmelez forks the repository to https://github.com/mykmelez/oghliner/, then the app will deploy to https://mykmelez.github.io/oghliner/.

To deploy to a different subdirectory of your GitHub Pages site, rename the repository in its Settings. For example, if @mykmelez renames the repository to *eggtimer*, then the app will deploy to https://mykmelez.github.io/eggtimer/.

GitHub doesn't let you fork a repository to the same account more than once, so to bootstrap a second offline web app, [create a new repository in GitHub](https://github.com/new), clone it locally, `git pull https://github.com/mozilla/oghliner.git master`, and `git push`. For example, if @mykmelez creates the repository https://github.com/mykmelez/test-app/, then he would bootstrap it via:

```bash
> git clone git@github.com:mykmelez/test-app.git
Cloning into 'test-app'...
warning: You appear to have cloned an empty repository.
Checking connectivity... done.
> cd test-app
> git pull https://github.com/mozilla/oghliner.git master
…
From https://github.com/mozilla/oghliner
 * branch            master     -> FETCH_HEAD
> git push
…
To git@github.com:mykmelez/test-app.git
 * [new branch]      master -> master
```

And then deploy it via `npm install && gulp && gulp deploy`.

This is also the recommended approach if you intend to contribute changes to Oghliner (even if you only intend to create a single app). In that case, fork the repository for the changes you intend to contribute, and create new repositories for your apps.

The template puts assets in *app/* and includes a simple *gulpfile.js* that builds to *dist/*, but you can modify the build any way you like. Invoke `gulp` to rebuild your app and regenerate the script that offlines it. Invoke `gulp deploy` to publish it to GitHub Pages.

Using The Tool
--------------

To integrate offlining and deployment into your existing app, `npm install --save oghliner`. Then add tasks to your *gulpfile.js* which call *oghliner.offline* and *offline.deploy*:

```js
var oghliner = require('oghliner');

gulp.task('offline', function(callback) {
  oghliner.offline({
    rootDir: 'dist',
    fileGlobs: [
      '**/*.html',
      'js/**/*.js',
    ],
  }, callback);
});

gulp.task('deploy', function(callback) {
  oghliner.deploy({
    rootDir: 'dist',
  }, callback);
});
```

*oghliner.offline* regenerates the script that offlines your app. It takes a *config* object and a *callback*. The properties of the *config* object are:
- *rootDir*, to specify the directory in which your files are built (default: `.`);
- *fileGlobs*, to specify the files to offline (default: `['**/*']`). The files in *fileGlobs* are matched inside *rootDir*;
- *importScripts*, to specify additional scripts to include in the service worker script (default: `[]`). This is useful, for example, when you want to use the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

*oghliner.deploy* deploys your files to GitHub Pages. It takes a *config* object and a *callback*. Use *rootDir* to specify the directory in which your files are built (default: `.`). 

Finally, in order for the offline cache to be registered, you need to load the offline manager script in your app by copying it to the location of your other scripts:

```bash
cp node_modules/oghliner/app/scripts/offline-manager.js path/to/your/scripts/
```

And then loading it in the app's the HTML file(s):

```html
<script src="path/to/your/scripts/offline-manager.js"></script>
```

*oghliner.deploy* can also be invoked from the command line if you install Oghliner globally.  To do so, `npm install -g oghliner && oghliner deploy`.  Specify the root directory with the *--root-dir* flag, i.e. `oghliner deploy --root-dir dist`.

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
