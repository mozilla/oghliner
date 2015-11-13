/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

<% importScripts.forEach(function (filepath) {
%>importScripts('<%- filepath %>');
<% }); %>
(function (self) {
  'use strict';

  // On install, cache resources and skip waiting so the worker won't
  // wait for clients to be closed before becoming active.
  self.addEventListener('install', function (event) {
    event.waitUntil(oghliner.cacheResources().then(function () {
      if (typeof self.skipWaiting === 'function') {
        return self.skipWaiting();
      }
    }));
  });

  // On activation, delete old caches and start controlling the clients
  // without waiting for them to reload.
  self.addEventListener('activate', function (event) {
    event.waitUntil(oghliner.clearOtherCaches().then(function () {
      if (self.clients && typeof self.clients.claim === "function") {
        return self.clients.claim();
      }
    }));
  });

  // Retrieves the request following oghliner strategy.
  self.addEventListener('fetch', function (event) {
    if (event.request.method === 'GET') {
      event.respondWith(oghliner.get(event.request));
    }
    else {
      event.respondWith(self.fetch(event.request));
    }
  });

  var oghliner = self.oghliner = {

    // This is the unique prefix for all the caches controlled by this worker.
    CACHE_PREFIX: 'offline-cache:<%= cacheId %>:' + (self.registration ? self.registration.scope : '') + ':',

    // This is the unique name for the cache controlled by this version of the worker.
    get CACHE_NAME() {
      return this.CACHE_PREFIX + '<%= cacheVersion %>';
    },

    // This is a list of resources that will be cached.
    RESOURCES: [
      '/',
<% resources.forEach(function (pathAndHash) {
%>      '<%- pathAndHash.path %>', // <%- pathAndHash.hash %>
<% }); %>
    ],

    // Adds the resources to the cache controlled by this worker.
    cacheResources: function () {
      var _this = this;
      var now = Date.now();
      var baseUrl = self.location;
      return _this.openCache()
        .then(function (cache) {
          return Promise.all(_this.RESOURCES.map(function (resource) {
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
        if (cacheName.indexOf(_this.CACHE_PREFIX) !== 0 || cacheName === _this.CACHE_NAME) {
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
          if (response) {
            return response;
          }
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
