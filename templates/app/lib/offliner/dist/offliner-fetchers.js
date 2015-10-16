self.off.fetchers.urls = {

  type: 'url',

  normalize: function (resource) {
    return { type: this.type, url: resource };
  },

  prefetch: function (resources, cache) {
    return Promise.all(resources.map(function (resource) {
      var bustedUrl = resource.url + '?__b=' + Date.now();
      var request = new Request(bustedUrl, { mode: 'no-cors' });
      return fetch(request).then(cache.put.bind(cache, resource.url));
    }));
  }
};
