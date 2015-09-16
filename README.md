Oghliner is an experimental template and tool for deploying Offline Web Apps to GitHub Pages.

As a template, Oghliner can be used to bootstrap an offline app that deploys to your GitHub Pages site. As a tool, Oghliner adds offlining and deployment into your existing app.

Bootstrap With Template
---------------------------

To bootstrap an offline web app, fork this repository on GitHub, clone the fork to your local machine, and `npm install`. If you don't have [gulp](http://gulpjs.com/) installed, also `npm install -g gulp`.

Then `gulp && gulp deploy` to build your app and deploy it to GitHub Pages. Your app will appear at https://*your-GitHub-username*.github.io/oghliner/, f.e. https://mykmelez.github.io/oghliner/.

To deploy to a different subdirectory of your GitHub Pages site, rename the repository after you fork it.

GitHub doesn't let you fork a repository to the same account more than once. So to bootstrap another offline web app, create a new repository in GitHub, clone it locally, then set Oghliner as the upstream repository, pull its master branch, and push it to the new repository:

```bash
> git clone git@github.com:mykmelez/test-offline-app.git
Cloning into 'test-offline-app'...
warning: You appear to have cloned an empty repository.
Checking connectivity... done.
> cd test-offline-app/
> git remote add upstream https://github.com/mozilla/oghliner.git
> git pull upstream master
> git push
Counting objects: 139, done.
Delta compression using up to 8 threads.
Compressing objects: 100% (65/65), done.
Writing objects: 100% (139/139), 23.09 KiB | 0 bytes/s, done.
Total 139 (delta 65), reused 139 (delta 65)
To git@github.com:mykmelez/test-offline-app.git
 * [new branch]      master -> master
> npm install
```

The template puts assets in *app/* and includes a simple *gulpfile.js* that builds to *dist/*, but you can modify the build any way you like. Invoke `gulp` to rebuild your app and regenerate the script that offlines it. Invoke `gulp deploy` to publish it to GitHub Pages.

Integrate With Tool
-------------------

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

Automatic Deployment Via Travis
-------------------------------

Oghliner can configure your repository to automatically deploy to GitHub Pages whenever you push to the *master* branch. Auto-deployment requires creation of a GitHub authorization token for Travis and configuration of Travis to build and deploy your app using the token.

*oghliner.configure* walks you through the configuration steps.  Access it by invoking `gulp configure` from an app that was bootstrapped using the template. Add this task for it to your *gulpfile.js* first if you integrated the tool into your existing app:

```js
gulp.task('configure', oghliner.configure);
```

Oghliner will ask you for your GitHub username/password in order to create the authorization token. Then it will encrypt the token with Travis's public key and write the encrypted token to the *.travis.yml* file. The token will only have the *public_repo* permission, which it needs in order for Travis to modify your repository's *gh-pages* branch.
