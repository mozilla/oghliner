describe('clearOtherCaches()', function () {
  'use strict';

  var oghliner;
  var originalPrefix;

  beforeEach(function () {
    importScripts('/base/testing/offline-worker.js');
    oghliner = self.oghliner;
    originalPrefix = oghliner.CACHE_PREFIX;

    oghliner.CACHE_PREFIX = 'oghliner:';
    sinon.stub(self.caches, 'keys');
    sinon.stub(self.caches, 'delete').returns(Promise.resolve());
  });

  afterEach(function () {
    self.caches.keys.restore();
    self.caches.delete.restore();
    oghliner.CACHE_PREFIX = originalPrefix;
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
