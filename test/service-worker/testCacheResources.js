describe('cacheResources()', function () {
  'use strict';

  var oghliner;
  var mockCache;

  var mockedOkResponse = { ok: true };
  var mockedFailingResponse = { ok: false };
  var testTimestamp = 1234567890;

  function allResourcesInCache(resources, cache) {
    var requests = [];
    cache.put.args.forEach(function (entry) {
      requests.push(entry[0].url);
    });
    return resources.every(function (path) {
      return requests.some(function (request) {
        return sameRequestURL(path, request);
      });
    });
  }

  beforeEach(function () {
    importScripts('/base/test/service-worker/utilsURL.js');
    importScripts('/base/test/service-worker/mockCache.js');
    importScripts('/base/testing/offline-worker.js');
    oghliner = self.oghliner;
    mockCache = self.mockCache;

    self.oghliner.RESOURCES = [];
    sinon.stub(Date, 'now').returns(testTimestamp);
    sinon.stub(self, 'fetch').returns(Promise.resolve(mockedOkResponse));
    sinon.stub(oghliner, 'prepareCache').returns(Promise.resolve(mockCache));
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
      assert.strictEqual(mockCache.put.callCount, TEST_RESOURCES.length);
      assert(allResourcesInCache(TEST_RESOURCES, mockCache));
    });

  });

  it('accepts some resources to be unavailable', function () {
    self.fetch
      .onFirstCall().returns(Promise.resolve(mockedOkResponse))
      .onSecondCall().returns(Promise.resolve(mockedFailingResponse));

    oghliner.RESOURCES = [ '/available', '/unavailable' ];
    return oghliner.cacheResources().then(function () {
      assert.notOk(allResourcesInCache(oghliner.RESOURCES, mockCache));
      assert(allResourcesInCache([oghliner.RESOURCES[0]], mockCache));
    });
  });

});
