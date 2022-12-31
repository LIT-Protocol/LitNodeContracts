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

const generateBaseConfig = (nodeIndex, contracts) => {
  const template = `
# NB: Do NOT deploy this with the env below (this is just for local env).
[lit]
env = "dev"

# These values will be provided by the guest.
[blockchain]
chain_id = "${contracts.chainId}"
chain_name = "${contracts.chainName}"
rpc_url = "${contracts.rpcUrl}"

# TODO: Change this.
[subnet]
id = "aA7aD6F5EAc8bF4bAe5CC03295559723677EcA6c"

[contracts]
condition_validations = "0x0"
access_control_conditions = "${
    contracts.accessControlConditionsContractAddress
  }"
lit_token = "${contracts.litTokenContractAddress}"
staking = "${contracts.stakingContractAddress}"
pubkey_router = "${contracts.pubkeyRouterContractAddress}"
pkp_nft = "${contracts.pkpNftContractAddress}"
rate_limit_nft = "${contracts.rateLimitNftContractAddress}"
pkp_permissions = "${contracts.pkpPermissionsContractAddress}"
pkp_helper = "${contracts.pkpHelperContractAddress}"
allowlist = "${contracts.allowlistContractAddress}"


[node]
domain_name = "${contracts.litNodeDomainName}"
port = "${contracts.litNodePort + nodeIndex}"
rocket_port = "${contracts.rocketPort + nodeIndex}"

ipfs_gateway = "https://cloudflare-ipfs.com/ipfs/"

enable_rate_limiting = false
enable_actions_allowlist = false
enable_epoch_transitions = true
  `;

  return template;
};

const walletToConfig = (wallet) => {
  return `
address = "${wallet.node.address}"
private_key = "${wallet.node.privateKey}"
public_key = "${wallet.node.publicKey}"
staker_address = "${wallet.staker.address}"
admin_address = "0x50e2dac5e78B5905CB09495547452cEE64426db2"

coms_keys_sender_privkey = "${wallet.node.comsKeysSender.privateKey}"
coms_keys_receiver_privkey = "${wallet.node.comsKeysReceiver.privateKey}"
  `;
};

const saveConfigFiles = (wallets, contracts) => {
  for (let i = 0; i < wallets.length; i++) {
    let restOfEnvVars = generateBaseConfig(i, contracts);
    const fullConfigFile = `${restOfEnvVars}\n${walletToConfig(wallets[i])}`;
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
