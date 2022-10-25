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

const walletCount = 10;

async function getChainId() {
  const { chainId } = await ethers.provider.getNetwork();
  return chainId;
}

console.log("Funding and staking to network " + chainName);

// after deploy, the deployer will set this wallet as the owner for everything.  Make sure the private key for this is easy to access and secure.  I use a metamask wallet for this, so that I can use remix to run any functions as the owner.
const newOwner = "0x50e2dac5e78B5905CB09495547452cEE64426db2";
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

const generateEnvVars = (nodeIndex, contracts) => {
  const template = `
LIT_CHAIN_NAME = ${contracts.chainName}
LIT_CHAIN_ID = ${contracts.chainId}
LIT_CHAIN_RPC_URL = ${contracts.rpcUrl}

LIT_CONTRACT_CONDITIONVALIDATIONS = 0x0
LIT_CONTRACT_ACCESSCONTROLCONDITIONS = ${
    contracts.accessControlConditionsContractAddress
  }
LIT_CONTRACT_LITTOKEN = ${contracts.litTokenContractAddress}
LIT_CONTRACT_STAKING = ${contracts.stakingContractAddress}
LIT_CONTRACT_PUBKEYROUTER = ${contracts.pubkeyRouterContractAddress}
LIT_CONTRACT_PKPNFT = ${contracts.pkpNftContractAddress}
LIT_CONTRACT_RATELIMITNFT = ${contracts.rateLimitNftContractAddress}
LIT_CONTRACT_PKPPERMISSIONS = ${contracts.pkpPermissionsContractAddress}

    
LIT_NODE_DOMAIN_NAME = ${contracts.litNodeDomainName}
LIT_NODE_PORT = ${contracts.litNodePort + nodeIndex}
ROCKET_PORT = ${contracts.rocketPort + nodeIndex}

LIT_IPFS_GATEWAY = http://127.0.0.1:8080/ipfs/

LIT_DISABLE_RATE_LIMITING = true
  `;

  return template;
};

const walletToEnvVar = (wallet) => {
  return `
LIT_NODE_ADDRESS = ${wallet.node.address}
LIT_NODE_PRIVATEKEY = ${wallet.node.privateKey}
LIT_NODE_PUBLICKEY = ${wallet.node.publicKey}
LIT_STAKER_ADDRESS = ${wallet.staker.address}

LIT_NODE_COMS_KEYS_SENDER_PRIVKEY = ${wallet.node.comsKeysSender.privateKey}
LIT_NODE_COMS_KEYS_RECEIVER_PRIVKEY = ${wallet.node.comsKeysReceiver.privateKey}
  `;
};

const saveConfigFiles = (wallets, contracts) => {
  for (let i = 0; i < wallets.length; i++) {
    let restOfEnvVars = generateEnvVars(i, contracts);
    const fullConfigFile = `${restOfEnvVars}\n${walletToEnvVar(wallets[i])}`;
    fs.writeFileSync(`./node_configs/lit_config${i}.env`, fullConfigFile);
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
  const nodeAmount = ethers.utils.parseEther("10");
  const stakerAmount = ethers.utils.parseEther("1");

  const multisenderContract = await ethers.getContractAt(
    "Multisender",
    contracts.multisenderContractAddress,
    signer
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
};

const stakeTokens = async (wallets, contracts) => {
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

    const litTokenContractAsStaker = litTokenContract.connect(
      connectedStakerWallet
    );

    const balance = await litTokenContractAsStaker.balanceOf(
      connectedStakerWallet.address
    );
    console.log(`balance for ${connectedStakerWallet.address}: `, balance);

    console.log(
      "stakeTokens - approving tokens for staker: ",
      connectedStakerWallet.address
    );
    const approvalTx = await litTokenContractAsStaker.approve(
      contracts.stakingContractAddress,
      amountToStake
    );
    console.log("approvalTx for wallet " + i + ": ", approvalTx);

    console.log("sleeping for 5 seconds for the chain to catch up");
    await sleep(5000);

    const stakingContractAsStaker = stakingContract.connect(
      connectedStakerWallet
    );
    const tx = await stakingContractAsStaker.stakeAndJoin(
      amountToStake,
      ip,
      ipv6,
      port,
      w.node.address,
      w.node.comsKeysSender.publicKey,
      w.node.comsKeysReceiver.publicKey
    );
    console.log("stakeAndJoin tx for wallet " + i + ": ", tx);
  }
};

async function main() {
  const signer = await getSigner();
  const fileName = "./deployed-contracts.json";
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

  // *** 5. Stake
  await stakeTokens(wallets, contracts);

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
