importScripts('./scripts/offliner/offliner.js');
importScripts('./scripts/offliner/middlewares.js');

var offliner = new off.Offliner("<%= name %>");

offliner.prefetch.use(off.fetchers.urls).resources([
<%= resources %>
]);

offliner.fetch
  .use(off.sources.cache)
  .use(off.sources.network)
  .orFail();

offliner.update
  .use(off.updaters.reinstall);

offliner.standalone();
