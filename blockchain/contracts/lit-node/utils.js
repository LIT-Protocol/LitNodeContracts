const bs58 = require("bs58");
const ethers = require("ethers");

function int2ip(ipInt) {
    return (
        (ipInt >>> 24) +
        "." +
        ((ipInt >> 16) & 255) +
        "." +
        ((ipInt >> 8) & 255) +
        "." +
        (ipInt & 255)
    );
}

function ip2int(ip) {
    return (
        ip.split(".").reduce(function (ipInt, octet) {
            return (ipInt << 8) + parseInt(octet, 10);
        }, 0) >>> 0
    );
}

/**
 * Partition multihash string into object representing multihash
 *
 * @param {string} multihash A base58 encoded multihash string
 * @returns {Multihash}
 */
function getBytesFromMultihash(multihash) {
    const decoded = bs58.decode(multihash);

    return `0x${Buffer.from(decoded).toString("hex")}`;
}

/**
 * Partition multihash string into object representing multihash
 *
 * @param {string} multihash A base58 encoded multihash string
 * @returns {Multihash}
 */
function getMultihashFromBytes(bytes) {
    return bs58.encode(bytes);
}

module.exports = {
    int2ip,
    ip2int,
    getMultihashFromBytes,
    getBytesFromMultihash,
};
