
// This is the set of the SW tests. They will be run inside a SW environment.
// Karma publishes the static content from /base/ path.
var SW_TESTS = [
  '/base/test/service-worker/testServiceWorker.js'
];

// Import chai and sinon into the ServiceWorkerGlobalScope
importScripts('/base/node_modules/chai/chai.js');
importScripts('/base/node_modules/sinon/pkg/sinon.js');

// Setup mocha to be bdd and make chai.expect globally available
self.assert = chai.assert;
mocha.setup({ ui: 'bdd' });
