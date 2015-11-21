/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function updateFound() {
  var installingWorker = this.installing;

  // Wait for the new service worker to be installed before prompting to update.
  installingWorker.addEventListener('statechange', function() {
    switch (installingWorker.state) {
      case 'installed':
        // Only show the prompt if there is currently a controller so it is not
        // shown on first load.
        if (navigator.serviceWorker.controller &&
            window.confirm('An updated version of this page is available, would you like to update?')) {
          window.location.reload();
          return;
        }
        break;

      case 'redundant':
        console.error('The installing service worker became redundant.');
        break;
    }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('offline-worker.js').then(function(registration) {
    console.log('offline worker registered');
    registration.addEventListener('updatefound', updateFound);
  });
}
