importScripts('/base/testing/offline-worker.js');

describe('Oghliner service worker', function () {
  'use strict';

  var oghliner = self.oghliner;

  describe('cacheResources()', function () {
    var mockedCache = {
      put: sinon.spy()
    };

    var mockedOkResponse = { ok: true };
    var mockedFailingResponse = { ok: false };

    var testTimestamp = 1234567890;

    function allResourcesInCache(resources, cache) {
      var requests = [];
      var responses = [];
      for (var call = 0, entry; entry = cache.put.args[call]; call++) {
        requests.push(entry[0].url);
        responses.push(entry[1]);
      }
      return resources.every(function (path) {
        return requests.some(sameURL.bind(undefined, path));
      });
    }

    function sameURL(url1, url2) {
      var url = new URL(url1, self.location);
      var anotherUrl = new URL(url2, self.location);
      var parts = ['protocol', 'host', 'pathname', 'search'];
      for (var i = 0, part; part = parts[i]; i++) {
        if (url[part] !== anotherUrl[part]) {
          return false;
        }
      }
      return true;
    }

    beforeEach(function () {
      self.oghliner.RESOURCES = [];
      mockedCache.put.reset();
      sinon.stub(Date, 'now').returns(testTimestamp);
      sinon.stub(self, 'fetch').returns(Promise.resolve(mockedOkResponse));
      sinon.stub(oghliner, 'prepareCache').returns(Promise.resolve(mockedCache));
    });

    afterEach(function () {
      Date.now.restore();
      self.fetch.restore();
      oghliner.prepareCache.restore();
    });

    var TEST_RESOURCES = [
      '/resource',
      '/resource?param=1',
      '/resource#section',
      '/resource?param=1#section',
      'https://domain/resource',
      'https://domain:8080/resource',
      'https://domain:8080/resource?param=1',
      'https://domain:8080/resource#section',
      'https://domain:8080/resource?param=1#section',
    ];

    TEST_RESOURCES.forEach(function (url) {
      it('busts the request with the current time', function () {
        var resourceUrl = new URL(url, self.location);
        oghliner.RESOURCES = [ resourceUrl.toString() ];

        return self.oghliner.cacheResources().then(function () {
          var requestedUrl = new URL(self.fetch.getCall(0).args[0].url);
          assert(isBumpedVersion(requestedUrl, resourceUrl));
        });

        function isBumpedVersion(bumped, original) {
          var bumpingString = '=' + testTimestamp;
          return bumped.search !== original.search &&
            bumped.search.endsWith(bumpingString) &&
            ['protocol', 'host', 'pathname'].every(function (property) {
              return bumped[property] === original[property];
            });
        }
      });
    });

    it('adds the listed resources to the cache', function () {
      oghliner.RESOURCES = TEST_RESOURCES;
      return self.oghliner.cacheResources().then(function () {
        assert.strictEqual(mockedCache.put.callCount, TEST_RESOURCES.length);
        assert(allResourcesInCache(TEST_RESOURCES, mockedCache));
      });

    });

    it('accepts some resources to be unavailable', function () {
      self.fetch
        .onFirstCall().returns(Promise.resolve(mockedOkResponse))
        .onSecondCall().returns(Promise.resolve(mockedFailingResponse));

      oghliner.RESOURCES = [ '/available', '/unavailable' ];
      return oghliner.cacheResources().then(function () {
        assert.notOk(allResourcesInCache(oghliner.RESOURCES, mockedCache));
        assert(allResourcesInCache([oghliner.RESOURCES[0]], mockedCache));
      });
    });

  });

  describe('clearOtherCaches()', function () {
    var originalPrefix;

    before(function () {
      originalPrefix = oghliner.CACHE_PREFIX;
    });

    after(function () {
      oghliner.CACHE_PREFIX = originalPrefix;
    });

    beforeEach(function () {
      sinon.stub(self.caches, 'keys');
      sinon.stub(self.caches, 'delete').returns(Promise.resolve());
    });

    afterEach(function () {
      self.caches.keys.restore();
      self.caches.delete.restore();
    });

    it('ignores non-oghliner caches', function () {
      oghliner.CACHE_PREFIX = 'oghliner:';
      self.caches.keys.returns(Promise.resolve([
        'other-application-cache',
        'another-application-cache'
      ]));
      return oghliner.clearOtherCaches().then(function () {
        assert.notOk(self.caches.delete.called);
      });
    });

    it('delete oghliner caches except the current one', function () {
      var currentCache = oghliner.CACHE_NAME;
      self.caches.keys.returns(Promise.resolve([
        'oghliner:1',
        'oghliner:2',
        currentCache
      ]));
      return oghliner.clearOtherCaches().then(function () {
        assert.strictEqual(self.caches.delete.callCount, 2);
        assert(self.caches.delete.calledWith('oghliner:1'));
        assert(self.caches.delete.calledWith('oghliner:2'));
        assert.notOk(self.caches.delete.calledWith(currentCache));
      });
    });

  });

});
