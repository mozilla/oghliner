(function (global) {
  'use strict';

  if ('serviceWorker' in navigator) {
    var script = document.createElement('SCRIPT');
    script.src = 'scripts/offliner/offliner-client.js';
    script.dataset.worker = 'offline-worker.js';
    script.onload = function () {
      var off = global.off.restore();
      var isActivationDelayed = false;

      off.on('activationPending', function () {
        if (confirm('An updated version of this page is available, would you like to update?')) {
          off.activate().then(function () { window.location.reload(); });
        }
        else if (!isActivationDelayed) {
          global.addEventListener('beforeunload', function () {
            off.activate();
          });
          isActivationDelayed = true;
        }
      });
      off.install().then(function () {
        console.log('offline worker registered');
      });
    };
    document.addEventListener('DOMContentLoaded', function onBody() {
      document.removeEventListener('DOMContentLoaded', onBody);
      document.body.appendChild(script);
    });
  }
}(this));
