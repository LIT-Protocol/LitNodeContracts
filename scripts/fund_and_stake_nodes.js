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
const wlitAddress = hre.network.config.wlitAddress || false;

const walletCount = 1;

// how much gas to send to the nodes, and to the staker addresses.
// note that this will be divided up by the walletCount
const nodeAmount = ethers.utils.parseEther("0.01");
const stakerAmount = ethers.utils.parseEther("0.01");

async function getChainId() {
    const { chainId } = await ethers.provider.getNetwork();
    return chainId;
}

console.log("Funding and staking to network " + chainName);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ip2int = (ip) => {
    return (
        ip.split(".").reduce(function (ipInt, octet) {
            return (ipInt << 8) + parseInt(octet, 10);
        }, 0) >>> 0
    );
};

const serializeWallets = (wals) => {
    const allWallets = wals.map((w, idx) => {
        return {
            idx,
            node: {
                address: w.node.address,
                privateKey: w.node.privateKey,
                publicKey: w.node.publicKey,
                mnemonic: w.node.mnemonic.phrase,
                comsKeysSender: w.node.comsKeysSender,
                comsKeysReceiver: w.node.comsKeysReceiver,
            },
            staker: {
                address: w.staker.address,
                privateKey: w.staker.privateKey,
                publicKey: w.staker.publicKey,
                mnemonic: w.staker.mnemonic.phrase,
            },
        };
    });
    return allWallets;
};

const generateBaseConfig = (nodeIndex, contracts, wallet) => {
    const template = `
# NB: Do NOT deploy this with the env below (this is just for local env).
[lit]
env = "dev"

# These values will be provided by the guest.
[blockchain]
chain_id = "${contracts.chainId}"
chain_name = "${contracts.chainName}"

["blockchain.wallet.default"]
private_key = "${wallet.node.privateKey}"

[subnet]
id = "${contracts.stakingContractAddress.substr(2)}"

# The below addresses are for reference only and may not be correct
# if you've changed them on the resolver after deployment
# access control conditions: ${contracts.accessControlConditionsContractAddress}
# lit token: ${contracts.litTokenContractAddress}
# staking: ${contracts.stakingContractAddress}
# pubkey router: ${contracts.pubkeyRouterContractAddress}
# pkp nft: ${contracts.pkpNftContractAddress}
# rate limit nft: ${contracts.rateLimitNftContractAddress}
# pkp permissions: ${contracts.pkpPermissionsContractAddress}
# pkp helper: ${contracts.pkpHelperContractAddress}
# allowlist: ${contracts.allowlistContractAddress}
# resolver: ${contracts.resolverContractAddress}

[ipfs]
gateway = "https://ipfs.io/ipfs/"

[node.http]
port = "${contracts.rocketPort + nodeIndex}"

[node]
domain = "${contracts.litNodeDomainName}"
rpc_url = "${contracts.rpcUrl}"
enable_rate_limiting = false
enable_actions_allowlist = false
enable_epoch_transitions = true
enable_ecdsa_dkg = true

gpg_pubkey = """
-----BEGIN PGP PUBLIC KEY BLOCK-----

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
=eI3j
-----END PGP PUBLIC KEY BLOCK-----
"""
  `;

    return template;
};

const walletToConfig = (wallet) => {
    return `
# The below are for reference only and are derived from 
# the blockchain.wallet.default.private_key above    
# address: ${wallet.node.address}
# public_key: ${wallet.node.publicKey}

staker_address = "${wallet.staker.address}"
admin_address = "0x50e2dac5e78B5905CB09495547452cEE64426db2"

coms_keys_sender_privkey = "${wallet.node.comsKeysSender.privateKey}"
coms_keys_receiver_privkey = "${wallet.node.comsKeysReceiver.privateKey}"
  `;
};

const saveConfigFiles = (wallets, contracts) => {
    for (let i = 0; i < wallets.length; i++) {
        let restOfEnvVars = generateBaseConfig(i, contracts, wallets[i]);
        const fullConfigFile = `${restOfEnvVars}\n${walletToConfig(
            wallets[i]
        )}`;
        fs.writeFileSync(`./node_configs/lit_config${i}.toml`, fullConfigFile);
    }
};

const generateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    // console.log("address:", wallet.address);
    // console.log("mnemonic:", wallet.mnemonic.phrase);
    // console.log("privateKey:", wallet.privateKey);
    return wallet;
};

const generateComsKeys = () => {
    const keys = nacl.box.keyPair();
    return {
        publicKey: "0x" + Buffer.from(keys.publicKey).toString("hex"),
        privateKey: "0x" + Buffer.from(keys.secretKey).toString("hex"),
    };
};

const generateWallets = () => {
    const newWallets = [];
    for (let i = 0; i < walletCount; i++) {
        const nodeWallet = generateWallet();
        nodeWallet.comsKeysSender = generateComsKeys();
        nodeWallet.comsKeysReceiver = generateComsKeys();
        newWallets.push({ node: nodeWallet, staker: generateWallet() });
    }
    return newWallets;
};

const getSigner = async () => {
    const [deployer] = await ethers.getSigners();
    return deployer;
};

const fundWalletsWithGas = async (wallets, contracts) => {
    const signer = await getSigner();

    const multisenderContract = await ethers.getContractAt(
        "Multisender",
        contracts.multisenderContractAddress,
        signer
    );
    console.log(
        "multisender contract address is ",
        multisenderContract.address
    );

    const nodeTx = await multisenderContract.sendEth(
        wallets.map((w) => w.node.address),
        { value: nodeAmount }
    );
    console.log("fundWalletsWithGas nodeTx: ", nodeTx);

    const stakerTx = await multisenderContract.sendEth(
        wallets.map((w) => w.staker.address),
        { value: stakerAmount }
    );
    console.log("fundWalletsWithGas stakerTx: ", stakerTx);

    await Promise.all([nodeTx.wait(), stakerTx.wait()]);
    console.log("mined nodeTx and stakerTx");
};

const fundWalletsWithTokens = async (wallets, contracts) => {
    const signer = await getSigner();

    const multisenderContract = await ethers.getContractAt(
        "Multisender",
        contracts.multisenderContractAddress,
        signer
    );

    const stakerTx = await multisenderContract.sendTokens(
        wallets.map((w) => w.staker.address),
        contracts.litTokenContractAddress
    );
    console.log("fundWalletsWithTokens stakerTx: ", stakerTx);
    await stakerTx.wait();
    console.log("stakerTx mined");
};

const stakeTokensAndLockValidatorSet = async (wallets, contracts) => {
    const signer = await getSigner();

    const stakingContract = await ethers.getContractAt(
        "Staking",
        contracts.stakingContractAddress,
        signer
    );

    const litTokenContract = await ethers.getContractAt(
        "LITToken",
        contracts.litTokenContractAddress,
        signer
    );

    // stake and join
    const amountToStake = await stakingContract.minimumStake();
    // let amountToStake = ethers.BigNumber.from("10");
    console.log("amountToStake: ", amountToStake);
    console.log("sending approval txns now");
    const approvalPromises = [];
    for (let i = 0; i < wallets.length; i++) {
        let w = wallets[i];

        const connectedStakerWallet = w.staker.connect(ethers.provider);

        const litTokenContractAsStaker = litTokenContract.connect(
            connectedStakerWallet
        );

        // const balance = await litTokenContractAsStaker.balanceOf(
        //   connectedStakerWallet.address
        // );
        // console.log(`balance for ${connectedStakerWallet.address}: `, balance);

        console.log(
            "stakeTokens - approving tokens for staker: ",
            connectedStakerWallet.address
        );
        const approvalTx = litTokenContractAsStaker.approve(
            contracts.stakingContractAddress,
            amountToStake
        );
        // console.log("approvalTx for wallet " + i + ": ", approvalTx);

        approvalPromises.push(approvalTx);
    }

    console.log("awaiting approval txns to be mined...");
    await Promise.all(
        approvalPromises.map((tx) => {
            return tx.then((sentTxn) => sentTxn.wait());
        })
    );

    // console.log("sleeping for 10 seconds for the chain to catch up");
    // await sleep(10000);

    console.log("sending staking txns now");
    const stakingPromises = [];
    for (let i = 0; i < wallets.length; i++) {
        let w = wallets[i];
        /*
      function stakeAndJoin(
        uint256 amount,
        uint32 ip,
        uint128 ipv6,
        uint32 port,
        address nodeAddress
      )
      */
        //  15.235.12.154
        // const ip = ethers.BigNumber.from("267062426");
        // const ipv6 = ethers.BigNumber.from("0");
        // const port = ethers.BigNumber.from("7370");
        const ipAsInt = ip2int(contracts.litNodeDomainName);
        const ip = ethers.BigNumber.from(ipAsInt);
        const ipv6 = ethers.BigNumber.from("0");
        const port = ethers.BigNumber.from(contracts.litNodePort + i);

        const connectedStakerWallet = w.staker.connect(ethers.provider);

        const stakingContractAsStaker = stakingContract.connect(
            connectedStakerWallet
        );
        console.log(
            "stakeTokens - staking tokens for staker: ",
            connectedStakerWallet.address
        );
        const tx = stakingContractAsStaker.stakeAndJoin(
            amountToStake,
            ip,
            ipv6,
            port,
            w.node.address,
            w.node.comsKeysSender.publicKey,
            w.node.comsKeysReceiver.publicKey
        );
        // console.log("stakeAndJoin tx for wallet " + i + ": ", tx);

        stakingPromises.push(tx);
    }

    console.log("awaiting staking txns to be mined...");
    await Promise.all(
        stakingPromises.map((tx) => {
            return tx.then((sentTxn) => sentTxn.wait());
        })
    );

    // console.log("sleeping for 10 seconds for the chain to catch up");
    // await sleep(10000);

    console.log("locking the validator set");
    const lockTx = await stakingContract.lockValidatorsForNextEpoch();
    console.log("lockTx: ", lockTx);
    await lockTx.wait();
    console.log("lockTx mined");
};

async function main() {
    const signer = await getSigner();
    const fileName = "./deployed-contracts-temp.json";
    console.log("reading from file: " + fileName);
    let contracts = fs.readFileSync(fileName);
    contracts = JSON.parse(contracts);

    // *** 1. Generate wallets
    const wallets = generateWallets();

    // *** 2. Fund node and staker wallets with gas
    await fundWalletsWithGas(wallets, contracts);

    // *** 4. Fund staker wallets with LIT
    await fundWalletsWithTokens(wallets, contracts);

    // sleep because the chain needs to catch up
    await sleep(10000);

    // *** 5. Stake and lock validator set
    await stakeTokensAndLockValidatorSet(wallets, contracts);

    // *** 6. Make sure the directories exist and create them if not
    const dirs = ["./wallets", "./node_configs"];
    dirs.forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    });

    // *** 6. Generate env vars and conf files
    saveConfigFiles(wallets, contracts);

    // *** 7. Save wallets
    const date = new Date().toISOString();
    const walletFilename = `./wallets/wallets-${date}-${chainName}-${walletCount}.json`;
    const serialized = serializeWallets(wallets);
    fs.writeFileSync(walletFilename, JSON.stringify(serialized, null, 2));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
