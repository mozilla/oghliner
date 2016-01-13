
describe('Oghliner service worker', function () {
  'use strict';

  var oghliner;
  var mockedCache;

  beforeEach(function () {
    // this ensures the oghliner API is fresh new per test
    importScripts('/base/testing/offline-worker.js');
    oghliner = self.oghliner;
    mockedCache = {
      put: sinon.spy(),
      match: sinon.stub()
    };
  });

  function sameRequestURL(url1, url2, exceptList) {
    exceptList = exceptList || [];
    exceptList = Array.isArray(exceptList) ? exceptList : [ exceptList ];
    // request URL drops the hash component of the url
    exceptList.push('hash');
    return sameURL(url1, url2, exceptList);
  }

  function sameURL(url1, url2, exceptList) {
    exceptList = exceptList || [];
    exceptList = Array.isArray(exceptList) ? exceptList : [ exceptList ];
    var url = new URL(url1, self.location);
    var anotherUrl = new URL(url2, self.location);
    var parts = ['protocol', 'host', 'pathname', 'search', 'hash'];
    for (var i = 0, part; part = parts[i]; i++) {
      var isException = exceptList.indexOf(part) >= 0;
      if (!isException && url[part] !== anotherUrl[part]) {
        return false;
      }
    }
    return true;
  }

  describe('cacheResources()', function () {

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
        return requests.some(function (request) {
          return sameRequestURL(path, request);
        });
      });
    }

    beforeEach(function () {
      self.oghliner.RESOURCES = [];
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
      oghliner.CACHE_PREFIX = 'oghliner:';
      sinon.stub(self.caches, 'keys');
      sinon.stub(self.caches, 'delete').returns(Promise.resolve());
    });

    afterEach(function () {
      self.caches.keys.restore();
      self.caches.delete.restore();
    });

    it('ignores non-oghliner caches', function () {
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

  describe('get()', function () {
    beforeEach(function () {
      sinon.stub(self, 'fetch');
      sinon.stub(oghliner, 'openCache').returns(Promise.resolve(mockedCache));
      sinon.stub(oghliner, 'extendToIndex').returns('/index.html');
    });

    afterEach(function () {
      self.fetch.restore();
      oghliner.openCache.restore();
      oghliner.extendToIndex.restore();
    });

    it('looks for the request first in the cache', function () {
      var mockedRequest = {};
      var mockedResponse = {};
      mockedCache.match.returns(Promise.resolve(mockedResponse));
      return oghliner.get(mockedRequest).then(function (response) {
        assert.strictEqual(response, mockedResponse);
        assert.notOk(self.fetch.called);
      });
    });

    it('looks for the request over the network if the cache fails', function () {
      var mockedRequest = {};
      var noResponse = undefined;
      mockedCache.match.returns(Promise.resolve(noResponse));
      return oghliner.get(mockedRequest).then(function (response) {
        assert.strictEqual(response, noResponse);
        assert(self.fetch.calledOnce);
        assert(self.fetch.calledWith(mockedRequest));
      });
    });
  });

  describe('extendToIndex()', function () {
    [
      '/',
      '/?param=1',
      '/#section',
      '/?param=1#section',
      '/path/',
      '/path/?param=1',
      '/path/#section',
      '/path/?param=1#section',
    ].forEach(function (path) {
      var originalUrl = new URL(path, self.location);
      var originalRequest = new Request(originalUrl);

      it('makes requests to folders to be requests to index.html', function () {
        var resultRequest = oghliner.extendToIndex(originalRequest);
        var resultUrl = new URL(resultRequest.url);
        var folderUrl = new URL(resultUrl);
        folderUrl.pathname = folderUrl.pathname.replace(/index\.html$/, '');

        // check they are the same except for pathname
        assert(sameRequestURL(resultUrl, originalUrl, 'pathname'));
        assert(resultUrl.pathname.endsWith('/index.html'));
        assert(sameRequestURL(folderUrl, originalUrl));
      });
    });

    [
      '/index.html',
      '/page.html?param=1',
      '/page.html#section',
      '/page.html?param=1#section',
      '/path/item',
      '/path/item?param=1',
      '/path/item#section',
      '/path/item?param=1#section',
    ].forEach(function (path) {
      var originalUrl = new URL(path, self.location);
      var originalRequest = new Request(originalUrl);

      it('does not alter requests to non folders', function () {
        var resultRequest = oghliner.extendToIndex(originalRequest);
        var resultUrl = new URL(resultRequest.url);

        assert(sameRequestURL(resultUrl, originalUrl));
      });
    });
  });

  describe('openCache()', function () {

    beforeEach(function () {
      sinon.stub(self.caches, 'open').returns(Promise.resolve(mockedCache));
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
