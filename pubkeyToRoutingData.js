const ethers = require("ethers");

const pubkey =
  "0x0215fac2ee502b4b9354c83f4e57dca7d58acf52dbd1201adb00f464fe613963a2";

const keyPart1Bytes = ethers.utils.hexDataSlice(pubkey, 0, 32);
const keyPart2Bytes = ethers.utils.hexZeroPad(
  ethers.utils.hexDataSlice(pubkey, 32),
  32
);
const keyLength = pubkey.replace(/^0x/, "").length / 2;
const keyType = 2;

const tokenId = ethers.utils.keccak256(pubkey);

console.log("tokenId", tokenId);
console.log("keyPart1Bytes", keyPart1Bytes);
console.log("keyPart2Bytes", keyPart2Bytes);
console.log("keyLength", keyLength);
console.log("keyType", keyType);
