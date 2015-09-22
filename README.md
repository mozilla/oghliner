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

*oghliner.offline* regenerates the script that offlines your app. It takes a *config* object and a *callback*. Use *rootDir* to specify the directory in which your files are built (default: `.`). Use *fileGlobs* to specify the files to offline (default: `['**/*']`). The files in *fileGlobs* are matched inside *rootDir*.

*oghliner.deploy* deploys your files to GitHub Pages. It takes a *config* object and a *callback*. Use *rootDir* to specify the directory in which your files are built (default: `.`). 

Finally, in order for the offline cache to be registered, you need to load the offline manager script in your app by copying it to the location of your other scripts:

```bash
cp node_modules/oghliner/app/js/offline-manager.js path/to/your/js/files/
```

And then loading it in the app's the HTML file(s):

```html
<script src="path/to/your/js/files/offline-manager.js"></script>
```

Automatic Deployment Via Travis
-------------------------------

Oghliner can configure a repository to automatically deploy to GitHub Pages whenever you push to the *master* branch. Auto-deployment requires creation of a GitHub authorization token for Travis and configuration of Travis to build and deploy your app using the token.

Before configuring the repository, go to [your Travis profile](https://travis-ci.org/profile) and enable Travis for the repository. You may need to press the *Sync* button if you recently created the repository and Travis doesn't list it in its list of your repositories.

If you boostrapped your app from a template, your repository already has a .travis.yml configuration file. If you're integrating the tool into an existing app, you'll need to add a .travis.yml file with the necessary configuration:

```yaml
language: node_js
node_js:
  - '0.10'
env:
  global:
    - PLACEHOLDER: 'Fix the bug that requires this placeholder to add entries to this list!'
install: npm install
before_script:
  - 'git config --global user.name "Travis-CI"'
  - 'git config --global user.email "YOUR EMAIL ADDRESS"'
script: gulp
after_success:
  - '[ "${TRAVIS_PULL_REQUEST}" = "false" ] && [ "${TRAVIS_BRANCH}" = "master" ] && gulp deploy'
```

*oghliner.configure* then walks you through the configuration steps.  Access it by invoking `gulp configure` from an app that was bootstrapped using the template. Add this task for it to your *gulpfile.js* first if you integrated the tool into your existing app:

```js
gulp.task('configure', oghliner.configure);
```

Oghliner will ask you for your GitHub username/password in order to create the authorization token. Then it will encrypt the token with Travis's public key and write the encrypted token to the *.travis.yml* file. The token will only have the *public_repo* permission, which it needs in order for Travis to modify your repository's *gh-pages* branch.

After it writes the token to the *.travis.yml* file, commit the change to that file and push the branch to GitHub to get Travis to build and auto-deploy your site:

```bash
> git commit -m"add GitHub token to auto-deploy on Travis" .travis.yml
> git push origin master
```
