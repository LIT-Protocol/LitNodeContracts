const {ethers} = require("ethers");

const wallet = ethers.Wallet.createRandom();
let walletJson = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
    mnemonic: wallet.mnemonic.phrase,
};
console.log("walletJson", JSON.stringify(walletJson));
