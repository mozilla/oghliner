importScripts('./lib/offliner/dist/offliner.min.js');
importScripts('./lib/offliner/dist/offliner-fetchers.js');
importScripts('./lib/offliner/dist/offliner-sources.js');

var offliner = new off.Offliner("<%= name %>");

offliner.prefetch.use(off.fetchers.urls).resources([
<%= resources %>
]);

offliner.fetch
  .use(off.sources.cache)
  .use(off.sources.network)
  .orFail();

offliner.standalone();
