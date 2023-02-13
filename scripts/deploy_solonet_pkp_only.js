// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    let TokenContractFactory;
    let TokenContract;

    TokenContractFactory = await ethers.getContractFactory("SoloNetPKP");

    [deployer, holder, ...signers] = await ethers.getSigners();

    // deploy the PKP contract
    TokenContract = await TokenContractFactory.deploy();
    await TokenContract.deployed();
    console.log("Contract for PKPNFT deployed to:", TokenContract.address);

    // set pkpPermissions, pkpNftMetadata, staking
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
