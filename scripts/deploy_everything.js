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

console.log("Deploying contracts to network " + chainName);

// process.exit(0);

// after deploy, the deployer will set this wallet as the owner for everything.  Make sure the private key for this is easy to access and secure.  I use a metamask wallet for this, so that I can use remix to run any functions as the owner.
const newOwner = "0x50e2dac5e78B5905CB09495547452cEE64426db2";

const generateEnvVars = async (nodeIndex, contracts) => {
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

const verifyContractInBg = (address, args = []) => {
  let verify = spawn(
    "bash",
    ["./verifyOnChain.sh", chainName, address, ...args],
    {
      detached: true, // run in BG
    }
  );

  verify.unref(); // don't wait for it to finish

  // uncomment if you want to see the output of the verify script
  // verify.stdout.on("data", (data) => {
  //   console.log(`stdout: ${data}`);
  // });

  // verify.stderr.on("data", (data) => {
  //   console.error(`stderr: ${data}`);
  // });
};

const deployContract = async (contractName, args = []) => {
  console.log(`Deploying ${contractName}`);
  const Factory = await ethers.getContractFactory(contractName);
  const contract = await Factory.deploy(...args);
  console.log(
    `${contractName} deploy tx hash: ${contract.deployTransaction.hash}`
  );
  await contract.deployed();
  console.log(`${contractName} deployed to ${contract.address}`);
  await hre.tenderly.persistArtifacts({
    name: contractName,
    address: contract.address,
  });
  await hre.tenderly.verify({
    name: contractName,
    address: contract.address,
  });
  return contract;
};

const transferOwnershipToNewOwner = async (contract) => {
  console.log(`Setting new owner to ${newOwner}`);
  const tx = await contract.transferOwnership(newOwner);
  return tx;
};

async function main() {
  const [deployer] = await ethers.getSigners();

  // *** 1. Deploy LITToken
  const litToken = await deployContract("LITToken");

  // Mint 1b tokens
  const amountToMint = ethers.utils.parseUnits("1000000000", 18);
  const mintTx = await litToken.mint(deployer.address, amountToMint);
  await mintTx.wait();
  verifyContractInBg(litToken.address);

  // *** 2. Deploy Staking Conttact
  const stakingContract = await deployContract("Staking", [litToken.address]);
  let tx = await transferOwnershipToNewOwner(stakingContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(stakingContract.address, [litToken.address]);

  // *** 3. Deploy AccessControlConditions Conttact
  const accessControlConditionsContract = await deployContract(
    "AccessControlConditions"
  );
  verifyContractInBg(accessControlConditionsContract.address);

  // *** 4. Deploy PKPNFT Contract
  const pkpNFTContract = await deployContract("PKPNFT");

  // *** 5. Deploy RateLimitNft Contract
  const rateLimitNftContract = await deployContract("RateLimitNFT");
  tx = await transferOwnershipToNewOwner(rateLimitNftContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(rateLimitNftContract.address);

  // *** 6. Deploy PubkeyRouterAndPermissions Contract
  const pubkeyRouterContract = await deployContract("PubkeyRouter", [
    pkpNFTContract.address,
  ]);
  tx = await transferOwnershipToNewOwner(pubkeyRouterContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(pubkeyRouterContract.address, [pkpNFTContract.address]);

  // *** 7. Deploy Multisender Contract
  const multisenderContract = await deployContract("Multisender");
  tx = await transferOwnershipToNewOwner(multisenderContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(multisenderContract.address);

  // *** 8. Set router contract address in PKP NFT
  console.log("Setting router address in PKP NFT");
  await pkpNFTContract.setRouterAddress(pubkeyRouterContract.address);

  // *** 9. Send tokens to multisender to be sent to stakers
  console.log("Sending tokens to multisender");
  // 100m for stakers
  const amountForStakers = ethers.utils.parseUnits("100000000", 18);
  let transferTx = await litToken.transfer(
    multisenderContract.address,
    amountForStakers
  );
  console.log("Transfer tx hash: " + transferTx.hash);
  await transferTx.wait();

  // *** 10. Send remaining tokens to newOwner
  const amountRemaining = await litToken.balanceOf(deployer.address);
  transferTx = await litToken.transfer(newOwner, amountRemaining);
  await transferTx.wait();

  // *** 11. Set new owner of LITToken
  console.log("Setting new owner of LITToken contract...");
  /// @dev The identifier of the role which maintains other roles.
  const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN"));
  /// @dev The identifier of the role which allows accounts to mint tokens.
  const MINTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("MINTER")
  );
  let adminTx = await litToken.grantRole(ADMIN_ROLE, newOwner);
  let minterTx = await litToken.grantRole(MINTER_ROLE, newOwner);
  await Promise.all([adminTx.wait(), minterTx.wait()]);
  console.log("New owner set.");

  // *** 12. Set new owner of PKPNFT contract
  console.log("Setting new owner of PKPNFT contract...");
  tx = await transferOwnershipToNewOwner(pkpNFTContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(pkpNFTContract.address);

  // *** 13. get chain id
  const chainId = await getChainId();

  // *** 14. Deploy PKPPermissions Contract
  console.log("Deploying PKP Permissions contract and then setting new owner");
  const pkpPermissionsContract = await deployContract("PKPPermissions", [
    pkpNFTContract.address,
    pubkeyRouterContract.address,
  ]);
  verifyContractInBg(pkpPermissionsContract.address, [
    pkpNFTContract.address,
    pubkeyRouterContract.address,
  ]);
  tx = await transferOwnershipToNewOwner(pkpPermissionsContract);
  await tx.wait();
  console.log("New owner set.");

  // *** 15. Deploy PKPHelper Contract
  console.log("Deploying PKP helper contract and then setting new owner");
  const pkpHelperContract = await deployContract("PKPHelper", [
    pkpNFTContract.address,
    pkpPermissionsContract.address,
  ]);
  verifyContractInBg(pkpHelperContract.address, [
    pkpNFTContract.address,
    pkpPermissionsContract.address,
  ]);
  tx = await transferOwnershipToNewOwner(pkpHelperContract);
  await tx.wait();
  console.log("New owner set.");

  const finalJson = {
    stakingContractAddress: stakingContract.address,
    multisenderContractAddress: multisenderContract.address,
    litTokenContractAddress: litToken.address,
    // used for the config file generation
    accessControlConditionsContractAddress:
      accessControlConditionsContract.address,
    pubkeyRouterContractAddress: pubkeyRouterContract.address,
    pkpNftContractAddress: pkpNFTContract.address,
    rateLimitNftContractAddress: rateLimitNftContract.address,
    pkpHelperContractAddress: pkpHelperContract.address,
    pkpPermissionsContractAddress: pkpPermissionsContract.address,
    chainId,
    rpcUrl,
    chainName,
    litNodeDomainName: "127.0.0.1",
    litNodePort: 7470,
    rocketPort: 7470,
  };

  console.log("final JSON: ");
  console.log(JSON.stringify(finalJson, null, 2));

  // *** 16. Write to file
  const fileName = "./deployed-contracts.json";
  console.log("Writing to file: " + fileName);
  fs.writeFileSync(fileName, JSON.stringify(finalJson, null, 2));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
