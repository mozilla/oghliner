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
