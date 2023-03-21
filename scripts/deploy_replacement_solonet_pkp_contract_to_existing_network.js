// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { ethers } = hre;

const contracts = {
    stakingContractAddress: "0x474663b167f0d179C5359160359BB18e925daef5",
    multisenderContractAddress: "0x92dfbDD149912f82be54Fd69b0320110b1F5A7fA",
    litTokenContractAddress: "0x18D290De0A4e1199dA226D6c1022eB1eDe3A9200",
    accessControlConditionsContractAddress:
        "0x6267eDCd7E8c68748A7c670Cd331649C9c8b1013",
    pkpNftContractAddress: "0x252593E59200aD15F53463d808e797b430eD710d",
    rateLimitNftContractAddress: "0x1Bc0bED99632B5f251fD17407e280E2c0400F3A5",
    pkpHelperContractAddress: "0x6B7D4f8C4362e51FA575b7FB0Ef6942e42430C1f",
    pkpPermissionsContractAddress: "0x9fFc5094E312DA04FB00FB970bd65CBDe58A63A6",
    pkpNftMetadataContractAddress: "0xD604841Be5F975d6B85F383A973c31Dc4775f258",
    allowlistContractAddress: "0xd86f576A09A073ddb77871CC3631280990567a1c",
    resolverContractAddress: "0x976c34c57685594d631c731423aEC44059a09cC4",
    chainId: 80001,
    rpcUrl: "https://polygon-mumbai.g.alchemy.com/v2/onvoLvV97DDoLkAmdi0Cj7sxvfglKqDh",
    chainName: "mumbai",
    litNodeDomainName: "127.0.0.1",
    litNodePort: 7470,
    rocketPort: 7470,
};

const newOwner = "0x50e2dac5e78B5905CB09495547452cEE64426db2";

const pkpPermissionsAddress = contracts.pkpPermissionsContractAddress;
const pkpNftMetadataAddress = contracts.pkpNftMetadataContractAddress;
const stakingAddress = contracts.stakingContractAddress;
const pkpHelperAddress = contracts.pkpHelperContractAddress;
const resolverAddress = contracts.resolverContractAddress;
const defaultPermittedMinters = [
    "0x1F62583538CDB2CB3656Ed43A46693F92DDa6302",
    "0x50e2dac5e78B5905CB09495547452cEE64426db2",
    "0x046BF7BB88E0e0941358CE3F5A765C9acddA7B9c",
];

const mapEnvToEnum = (env) => {
    switch (env) {
        case "dev":
            return 0;
        case "staging":
            return 1;
        case "prod":
            return 2;
        default:
            throw new Error("ENV is invalid");
    }
};

const deployEnvEnum = mapEnvToEnum("dev");

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
    let txn = await TokenContract.setPkpPermissionsAddress(
        pkpPermissionsAddress
    );
    console.log("setPkpPermissionsAddress txn: ", txn.hash);
    await txn.wait();

    txn = await TokenContract.setPkpNftMetadataAddress(pkpNftMetadataAddress);
    console.log("setPkpNftMetadataAddress txn: ", txn.hash);
    await txn.wait();

    txn = await TokenContract.setStakingAddress(stakingAddress);
    console.log("setStakingAddress txn: ", txn.hash);
    await txn.wait();

    // set the pkp contract address in the pkp permissions contract
    const pkpPermissionsContract = await ethers.getContractAt(
        "PKPPermissions",
        pkpPermissionsAddress
    );
    txn = await pkpPermissionsContract.setPkpNftAddress(TokenContract.address);
    console.log("setPkpAddress txn: ", txn.hash);

    // set the pkp contract address on the solonet pkp helper contract
    const solonetPKPHelperContract = await ethers.getContractAt(
        "SoloNetPKPHelper",
        pkpHelperAddress
    );
    txn = await solonetPKPHelperContract.setPkpNftAddress(
        TokenContract.address
    );
    console.log("setPkpAddress txn: ", txn.hash);

    // set it in the resolver contract
    const resolverContract = await ethers.getContractAt(
        "ContractResolver",
        resolverAddress
    );
    txn = await resolverContract.setContract(
        await resolverContract.PKP_NFT_CONTRACT(),
        deployEnvEnum,
        TokenContract.address
    );
    console.log("setContract on resolver contract txn: ", txn.hash);

    // add permitted minters
    for (let i = 0; i < defaultPermittedMinters.length; i++) {
        txn = await TokenContract.addPermittedMinter(
            defaultPermittedMinters[i]
        );
        console.log(
            `addPermittedMinter for ${defaultPermittedMinters[i]} txn: `,
            txn.hash
        );
        await txn.wait();
    }

    txn = await TokenContract.transferOwnership(newOwner);
    console.log("transferOwnership txn: ", txn.hash);
    await txn.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
