if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('oghliner-worker.js').then(function(registration) {
    console.log('oghliner worker registered');
  });
}
