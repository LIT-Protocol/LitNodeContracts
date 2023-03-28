const { ethers } = require("ethers");
const ipfsId = "QmRwN9GKHvCn4Vk7biqtr6adjXMs7PzzYPCzNCRjPFiDjm";

const converted = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("LIT_ACTION_" + ipfsId)
);

console.log("as bytes: ", converted);
