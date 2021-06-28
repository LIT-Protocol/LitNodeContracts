function int2ip (ipInt) {
  return ((ipInt >>> 24) + '.' + (ipInt >> 16 & 255) + '.' + (ipInt >> 8 & 255) + '.' + (ipInt & 255))
}

function ip2int (ip) {
  return ip.split('.').reduce(function (ipInt, octet) { return (ipInt << 8) + parseInt(octet, 10) }, 0) >>> 0
}

module.exports = {
  int2ip,
  ip2int
}
