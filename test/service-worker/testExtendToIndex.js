describe('extendToIndex()', function () {
  'use strict';

  var oghliner;

  beforeEach(function () {
    importScripts('/base/test/service-worker/urlUtils.js');
    importScripts('/base/test/service-worker/mockCache.js');
    oghliner = self.oghliner;
  });

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
