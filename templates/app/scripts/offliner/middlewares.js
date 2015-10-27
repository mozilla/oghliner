var SAFEGUARD_SCRIPT = /^\/scripts\/offliner\/safeguard\.js$/;

self.off.sources.cache = function (request, activeCache) {
  var url = new URL(request.url, location);
  if (url.pathname.match(SAFEGUARD_SCRIPT)) {
    return fetch(request);
  }
  return activeCache.match(request).then(function (response) {
    return response ? Promise.resolve(response) : Promise.reject();
  });
};
self.off.sources.network = function (request) {
  return fetch(request);
};

self.off.fetchers.urls = {

  type: 'url',

  normalize: function (resource) {
    return { type: this.type, url: resource };
  },

  prefetch: function (resources, cache) {
    return Promise.all(resources.map(function (resource) {
      var bustedUrl = resource.url + '?__b=' + Date.now();
      var request = new Request(bustedUrl, { mode: 'no-cors' });
      return fetch(request).then(function (response) {
        var url = new URL(request.url, location);
        if (url.pathname.match(/\/index\.html?$/)) {
          cache.put('/', response.clone());
        }
        cache.put(resource.url, response);
      });
    }));
  }
};

self.off.updaters.reinstall = {
  check: function () {
    return Promise.resolve('v' + Date().toString());
  },

  isNewVersion: function () {
    return this.flags.isCalledFromInstall;
  },

  evolve: function (previousCache, newCache, reinstall) {
    return reinstall();
  }
};
