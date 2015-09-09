if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('ophliner-worker.js').then(function(registration) {
    console.log('ophliner worker registered');
  });
}
