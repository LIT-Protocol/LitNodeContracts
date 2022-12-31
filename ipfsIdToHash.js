const {ipfsIdToIpfsIdHash} = require("./utils.js");

const ipfsId = "QmeYcfZ1NF8NjESE2q4TEgCpvDtf9UdVcAPjaqnVU5C4pV";

const hashed = ipfsIdToIpfsIdHash(ipfsId);

console.log("ipfsIdHash", hashed);
