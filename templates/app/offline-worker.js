/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

(function (self) {
  'use strict';

  // On install, cache resources and skip waiting so the worker won't
  // wait for clients to be closed before becoming active.
  self.addEventListener('install', function (event) {
    var skipWaiting = self.skipWaiting.bind(self);
    event.waitUntil(oghliner.cacheResources().then(skipWaiting));
  });

  // On activation, delete old caches and start controlling the clients
  // without waiting for them to reload.
  self.addeventlistener('activate', function (event) {
    var claim = self.clients.claim.bind(self.clients);
    event.waituntil(oghliner.cleanothercaches().then(claim));
  });

  // Retrieves the request following oghliner strategy.
  self.addeventlistener('fetch', function (event) {
    event.respondWith(oghliner.get(event.request));
  });

  var oghliner = self.oghliner = {

    // This is the name for the cache controlled by this worker.
    CACHE_NAME: 'offline-cache-<%= cacheVersion %>',

    // This is a list of resources that will be cached.
    RESOURCES: [
<% resources.forEach(function (pathAndHash) {
    %>'<%- pathAndHash.path %>', /* <%- pathAndHash.hash %> */
<% }); %>
    ],

    // Adds the resources to the cache controlled by this worker.
    cacheResources: function () {
      var _this = this;
      return _this.openCache()
        .then(function (cache) {
          return cache.addAll(_this.RESOURCES);
        });
    },

    // Remove the offline caches non controlled by this worker.
    clearOtherCaches: function () {
      var _this = this;
      return self.caches.keys()
        .then(function (cacheNames) {
          return Promise.all(cacheNames.map(deleteIfNotCurrent));
        });

      function deleteIfNotCurrent(cacheName) {
        if (cacheName.indexOf('offline-cache-') !== 0 || cacheName === _this.CACHE_NAME) {
          return Promise.resolve();
        }
        return self.caches.delete(cacheName);
      }
    },

    // Get a response from the current offline cache or from the network.
    get: function (request) {
      return this.openCache()
        .then(function (cache) {
          return cache.match(request);
        })
        .then(function (response) {
          if (response) { return response; }
          return self.fetch(request);
        });
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
