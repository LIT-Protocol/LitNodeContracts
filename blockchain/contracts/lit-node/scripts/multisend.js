// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const fs = require("fs");
var spawn = require("child_process").spawn;
const nacl = require("tweetnacl");
const { ethers } = hre;
const chainName = hre.network.name;
const rpcUrl = hre.network.config.url;

const recipients = [
    "0xDf35be77d7A21ADd578C3c6347E713452Afcc214",
    "0x59D0eA163660Cac5491e67a26f69EA4FaE5Cd8EF",
    "0x38dc472FC4a785916197E47100Ce0180d938f91f",
    "0x20AD92F164C164195995c4Fa1EEe4F1eA19e08cD",
    "0xa90eBAD52f8eFe8e5464fd4905797d830c46bC41",
    "0x626BCbEE8c4867A8d83a7aA67De834509DD9d274",
    "0x9444a5F6634F21F2Cc58eD423e4Aa6F2f6Fe100C",
    "0xe5895603d44Fe516e58bBD0aE32c63D566bCA801",
    "0x620d72387299f227258c13BEa2f5E6D3B4074b5D",
    "0x09Ec1f114faeCD6ad86D0bc4b8803317E2C27d52",
];
const multisenderContractAddress = "0x244728F20d5bBcEac394423DC1dd21Ef4E27b582";
// split between all nodes
const amount = ethers.utils.parseEther("10");

console.log("Funding nodes: " + JSON.stringify(recipients, null, 2));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getSigner = async () => {
    const [deployer] = await ethers.getSigners();
    return deployer;
};

const ip2int = (ip) => {
    return (
        ip.split(".").reduce(function (ipInt, octet) {
            return (ipInt << 8) + parseInt(octet, 10);
        }, 0) >>> 0
    );
};

const fundWalletsWithGas = async () => {
    const signer = await getSigner();

    const multisenderContract = await ethers.getContractAt(
        "Multisender",
        multisenderContractAddress,
        signer
    );
    console.log(
        "multisender contract address is ",
        multisenderContract.address
    );

    const tx = await multisenderContract.sendEth(recipients, {
        value: amount,
    });
    console.log("fundWalletsWithGas tx: ", tx);
    await tx.wait();

    console.log("mined");
};

async function main() {
    await fundWalletsWithGas();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
