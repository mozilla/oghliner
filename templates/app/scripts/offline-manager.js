if ('serviceWorker' in navigator) {
  var script = document.createElement('SCRIPT');
  script.src = 'scripts/offliner/offliner-client.js';
  script.dataset.worker = 'offline-worker.js';
  script.onload = function () {
    off.on('activationPending', function () {
      off.activate().then(function () { window.location.reload(); });
    });
    off.install().then(function () {
      console.log('offline worker registered');
    });
  };
  document.body.appendChild(script);

  var safeguard = document.createElement('SCRIPT');
  script.src = 'scripts/offliner/safeguard.js';
  document.body.appendChild(script);
}
