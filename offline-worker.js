/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */


(function (self) {
  'use strict';

  // On install, cache resources and skip waiting so the worker won't
  // wait for clients to be closed before becoming active.
  self.addEventListener('install', function (event) {
    event.waitUntil(oghliner.cacheResources().then(function () {
      return self.skipWaiting();
    }));
  });

  // On activation, delete old caches and start controlling the clients
  // without waiting for them to reload.
  self.addEventListener('activate', function (event) {
    event.waitUntil(oghliner.clearOtherCaches().then(function () {
      return self.clients.claim();
    }));
  });

  // Retrieves the request following oghliner strategy.
  self.addEventListener('fetch', function (event) {
    if (event.request.method === 'GET') {
      event.respondWith(oghliner.get(event.request));
    } else {
      event.respondWith(self.fetch(event.request));
    }
  });

  var oghliner = self.oghliner = {

    // This is the unique prefix for all the caches controlled by this worker.
    CACHE_PREFIX: 'offline-cache:mozilla/oghliner:' + (self.registration ? self.registration.scope : '') + ':',

    // This is the unique name for the cache controlled by this version of the worker.
    get CACHE_NAME() {
      return this.CACHE_PREFIX + '74549a6c9300c92cecdffb3738e92ef495310f02';
    },

    // This is a list of resources that will be cached.
    RESOURCES: [
      './', // cache always the current root to make the default page available
      './images/apple-touch-icon-114x114.png', // a59b2a2e1f96569e9bddc6bdb2e75b535f50740c
      './images/apple-touch-icon-120x120.png', // eb044227a288f2c496c47b4a42f3e1ffba913c84
      './images/apple-touch-icon-144x144.png', // d192a72ce1124afebacb85fc3c65deabc952f09a
      './images/apple-touch-icon-152x152.png', // 737408359072454bd487f2610bd0c4a1478d8852
      './images/apple-touch-icon-57x57.png', // d14e9a69cc78ed3b8eb6597c6d90665a3ecc2feb
      './images/apple-touch-icon-60x60.png', // d19e5a92de4725a5fa418175db568d52fdd53258
      './images/apple-touch-icon-72x72.png', // aaf792166ead2a5087802cfd93219dd6e67270e7
      './images/apple-touch-icon-76x76.png', // 6978926be3c5d8d86c6d620eaad0e4935f0af004
      './images/favicon-128x128.png', // 3ccb0249a0594a52e7a0bd1bf0322cf853d356b4
      './images/favicon-16x16.png', // 74a77aae27835823a307df943d0e249bf868b1d9
      './images/favicon-196x196.png', // a82f166562b5f0a1f651937d4a27e8dec5bb565e
      './images/favicon-32x32.png', // 3d8a4affe635d9ee98270e7bdbf75b59bdeace51
      './images/favicon-96x96.png', // ddeb536045b57431fb87452cc308667ebe5a9dcd
      './images/mstile-144x144.png', // cca0e49c55f944ae02f08d37560f0a0073ec8902
      './images/mstile-150x150.png', // 64da27a0c359f1c0a86f75aa1aaf65a51bc57dc2
      './images/mstile-310x150.png', // d100f26874fb944f7f7fefd80929465c27b27db5
      './images/mstile-310x310.png', // 292e53d8db6bc724211aaa2405afe15dc9a7d559
      './images/mstile-70x70.png', // b053002ff86b9d407ac7173583627404a78a6cf9
      './index.html', // 9b9f039ed0a0ea19ab73f8be62f522e69c50269f
      './scripts/offline-manager.js', // e2e09e000c5b64035940ae44e9c0936eb25ecd51
      './styles/stylesheet.css', // 36e6741b394816aa3a8ff34c7b77c251504884ac
      './styles/tabzilla/css/tabzilla.css', // 470406a43e2498fb499b4ab174906d6d2a3a8cb5
      './styles/tabzilla/media/img/tabzilla-static-high-res.png', // b61a9911763194807cdd009d9772d8f74d9219f4
      './styles/tabzilla/media/img/tabzilla-static.png', // daf1c7682b6197942b1c82b0790f57bf9605a13c

    ],

    // Adds the resources to the cache controlled by this worker.
    cacheResources: function () {
      var now = Date.now();
      var baseUrl = self.location;
      return this.prepareCache()
      .then(function (cache) {
        return Promise.all(this.RESOURCES.map(function (resource) {
          // Bust the request to get a fresh response
          var url = new URL(resource, baseUrl);
          var bustParameter = (url.search ? '&' : '') + '__bust=' + now;
          var bustedUrl = new URL(url.toString());
          bustedUrl.search += bustParameter;

          // But cache the response for the original request
          var requestConfig = { credentials: 'same-origin' };
          var originalRequest = new Request(url.toString(), requestConfig);
          var bustedRequest = new Request(bustedUrl.toString(), requestConfig);
          return fetch(bustedRequest).then(function (response) {
            if (response.ok) {
              return cache.put(originalRequest, response);
            }
            console.error('Error fetching ' + url + ', status was ' + response.status);
          });
        }));
      }.bind(this));
    },

    // Remove the offline caches not controlled by this worker.
    clearOtherCaches: function () {
      var deleteIfNotCurrent = function (cacheName) {
        if (cacheName.indexOf(this.CACHE_PREFIX) !== 0 || cacheName === this.CACHE_NAME) {
          return Promise.resolve();
        }
        return self.caches.delete(cacheName);
      }.bind(self);

      return self.caches.keys()
      .then(function (cacheNames) {
        return Promise.all(cacheNames.map(deleteIfNotCurrent));
      });

    },

    // Get a response from the current offline cache or from the network.
    get: function (request) {
      return this.openCache()
      .then(function (cache) {
        return cache.match(request);
      })
      .then(function (response) {
        if (response) {
          return response;
        }
        return self.fetch(request);
      });
    },

    // Prepare the cache for installation, deleting it before if it already exists.
    prepareCache: function () {
      return self.caches.delete(this.CACHE_NAME).then(this.openCache.bind(this));
    },

    // Open and cache the offline cache promise to improve the performance when
    // serving from the offline-cache.
    openCache: function () {
      if (!this._cache) {
        this._cache = self.caches.open(this.CACHE_NAME);
      }
      return this._cache;
    }

  };
}(self));
