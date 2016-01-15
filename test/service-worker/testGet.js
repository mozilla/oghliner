describe('get()', function () {
  'use strict';

  var oghliner;
  var mockCache;

  beforeEach(function () {
    importScripts('/base/test/service-worker/mockCache.js');
    importScripts('/base/testing/offline-worker.js');
    oghliner = self.oghliner;
    mockCache = self.mockCache;

    sinon.stub(self, 'fetch');
    sinon.stub(oghliner, 'openCache').returns(Promise.resolve(mockCache));
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
    mockCache.match.returns(Promise.resolve(mockedResponse));
    return oghliner.get(mockedRequest).then(function (response) {
      assert.strictEqual(response, mockedResponse);
      assert.notOk(self.fetch.called);
    });
  });

  it('looks for the request over the network if the cache fails', function () {
    var mockedRequest = {};
    var noResponse = undefined;
    mockCache.match.returns(Promise.resolve(noResponse));
    return oghliner.get(mockedRequest).then(function (response) {
      assert.strictEqual(response, noResponse);
      assert(self.fetch.calledOnce);
      assert(self.fetch.calledWith(mockedRequest));
    });
  });
});
