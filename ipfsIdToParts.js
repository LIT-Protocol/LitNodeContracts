const {getBytes32FromMultihash} = require("./utils.js");

const ipfsId = "QmeYcfZ1NF8NjESE2q4TEgCpvDtf9UdVcAPjaqnVU5C4pV";

const parts = getBytes32FromMultihash(ipfsId);

console.log("digest", parts.digest);
console.log("hashFunction", parts.hashFunction);
console.log("size", parts.size);
