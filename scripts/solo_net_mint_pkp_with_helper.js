// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const fs = require("fs");
var spawn = require("child_process").spawn;
const { ethers } = hre;
const chainName = hre.network.name;
const rpcUrl = hre.network.config.url;

async function getChainId() {
    const { chainId } = await ethers.provider.getNetwork();
    return chainId;
}

const getSigner = async () => {
    const [deployer] = await ethers.getSigners();
    return deployer;
};

async function main() {
    const signer = await getSigner();
    const fileName = "./deployed-contracts-temp.json";
    console.log("reading from file: " + fileName);
    let contracts = fs.readFileSync(fileName);
    contracts = JSON.parse(contracts);

    const soloNetPkpHelper = await ethers.getContractAt(
        "SoloNetPKPHelper",
        contracts.pkpHelperContractAddress,
        signer
    );

    const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let pubkey = await new Promise((resolve) => {
        rl.question("What is the pubkey you wish to mint? ", resolve);
    });

    // add the 0x prefix if not present
    if (pubkey.substring(0, 2) != "0x") {
        pubkey = "0x" + pubkey;
    }

    const soloNetPkp = await ethers.getContractAt(
        "SoloNetPKP",
        contracts.pkpNftContractAddress,
        signer
    );

    console.log("getting mint cost...");
    const mintCost = await soloNetPkp.mintCost();
    console.log("mintCost is ", mintCost.toString());

    // mint and let the 0x9D1a5EC58232A894eBFcB5e466E3075b23101B89 use it
    const mintTx = await soloNetPkpHelper.mintAndAddAuthMethods(
        pubkey,
        [1],
        ["0x9D1a5EC58232A894eBFcB5e466E3075b23101B89"],
        ["0x00"],
        [[]],
        false,
        false,
        { value: mintCost }
    );
    console.log("mintTx hash", mintTx.hash);
    const mintingReceipt = await mintTx.wait();
    // console.log("mintingReceipt", mintingReceipt);
    console.log("Success!");
    process.exit(0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
