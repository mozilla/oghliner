describe('Setup methods for cache', function () {
  'use strict';

  var oghliner;
  var mockCache;

  beforeEach(function () {
    importScripts('/base/test/service-worker/mockCache.js');
    importScripts('/base/testing/offline-worker.js');
    oghliner = self.oghliner;
    mockCache = self.mockCache;
  });

  describe('prepareCache()', function () {
    function createNonEmptyCache(name) {
      return self.caches.open(name)
      .then(function (cache) {
        return cache.put('/index.html', new Response('hello')).then(function () {
          return cache.keys();
        });
      })
      .then(function (entries) {
        assert.isAbove(entries.length, 0);
      });
    }

    it('clears the cache', function () {
      return createNonEmptyCache(oghliner.CACHE_NAME)
      .then(function () {
        return oghliner.prepareCache();
      })
      .then(function (cache) {
        assert.instanceOf(cache, Cache);
        return cache.keys();
      })
      .then(function (keys) {
        assert.lengthOf(keys, 0);
      })
      .then(function () {
        return self.caches.open(oghliner.CACHE_NAME);
      })
      .then(function (cache) {
        return cache.keys();
      })
      .then(function (keys) {
        assert.lengthOf(keys, 0);
      });
    });
  });

  describe('openCache()', function () {
    beforeEach(function () {
      sinon.stub(self.caches, 'open').returns(Promise.resolve(mockCache));
    });

    afterEach(function () {
      self.caches.open.restore();
    });

    it('caches the open cache to avoid repeating open() operations', function () {
      return oghliner.openCache().then(function () {
        return oghliner.openCache().then(function () {
          assert(self.caches.open.calledOnce, self.caches.open.callCount + '');
        });
      });
    });
  });
});
