This doesn't work yet because i didn't want to paste in the coms keys













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

const walletCount = 3;

async function getChainId() {
    const { chainId } = await ethers.provider.getNetwork();
    return chainId;
}

console.log("Setting IP addresses " + chainName);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ip2int = (ip) => {
    return (
        ip.split(".").reduce(function (ipInt, octet) {
            return (ipInt << 8) + parseInt(octet, 10);
        }, 0) >>> 0
    );
};


async function main() {
    const signer = await getSigner();

    const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const stakingContractAddress = await new Promise((resolve) => {
        rl.question("What is the staking contract address? ", resolve);
    });

    const stakingContract = await ethers.getContractAt(
        "Staking",
        stakingContractAddress,
        signer
    );

    const walletJson = await new Promise((resolve) => {
        rl.question("Paste in the wallets.json: ", resolve);
    });
    const wallets = JSON.parse(walletJson);

    for (let i = 0; i < wallets.length; i++) {
        let w = wallets[i];
        w.staker = new ethers.Wallet(w.staker.privateKey, ethers.provider);

        // prompt for ip address to set for the node
        const ip = await new Promise((resolve) => {
            rl.question(
                `What IP address do you want to use for node ${i + 1}? `,
                resolve
            );
        });

        // prompt for port to set for the node
        const port = await new Promise((resolve) => {
            rl.question(
                `What port do you want to use for node ${i + 1}? `,
                resolve
            );
        });

        await stakingContract.setIpPortNodeAddressAndCommunicationPubKeys(
          uint32 ip,
          uint128 ipv6,
          uint32 port,
          address nodeAddress,
          uint256 senderPubKey,
          uint256 receiverPubKey
      );
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
