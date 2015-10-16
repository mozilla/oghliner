self.off.sources.cache = function (request, activeCache) {
  return activeCache.match(request).then(function (response) {
    return response ? Promise.resolve(response) : Promise.reject();
  });
};
self.off.sources.network = function (request) {
  return fetch(request);
};
