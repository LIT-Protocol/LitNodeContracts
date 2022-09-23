// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
var spawn = require("child_process").spawn;
const { ethers } = hre;

// after deploy, the deployer will set this wallet as the owner for everything.  Make sure the private key for this is easy to access and secure.  I use a metamask wallet for this, so that I can use remix to run any functions as the owner.
const newOwner = "0x50e2dac5e78B5905CB09495547452cEE64426db2";

const verifyContractInBg = (address) => {
  let verify = spawn("bash", ["./verifyOnCelo.sh", address], {
    detached: true, // run in BG
  });

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
  verifyContractInBg(stakingContract.address);

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
  const pubkeyRouterAndPermissionsContract = await deployContract(
    "PubkeyRouterAndPermissions",
    [pkpNFTContract.address]
  );
  tx = await transferOwnershipToNewOwner(pubkeyRouterAndPermissionsContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(pubkeyRouterAndPermissionsContract.address);

  // *** 7. Deploy Multisender Contract
  const multisenderContract = await deployContract("Multisender");
  tx = await transferOwnershipToNewOwner(multisenderContract);
  await tx.wait();
  console.log("New owner set.");
  verifyContractInBg(multisenderContract.address);

  // *** 8. Set router contract address in PKP NFT
  console.log("Setting router address in PKP NFT");
  await pkpNFTContract.setRouterAddress(
    pubkeyRouterAndPermissionsContract.address
  );

  // *** 9. Send tokens to multisender to be sent to stakers
  console.log("Sending tokens to multisender");
  // 100m for stakers
  const amountForStakers = ethers.utils.parseUnits("100000000", 18);
  let transferTx = await litToken.transfer(
    multisenderContract.address,
    amountForStakers
  );
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

  const finalJson = {
    stakingContractAddress: stakingContract.address,
    multisenderContractAddress: multisenderContract.address,
    litTokenContractAddress: litToken.address,
    // used for the config file generation
    accessControlConditionsContractAddress:
      accessControlConditionsContract.address,
    pubKeyRouterAndPermissionsContractAddress:
      pubkeyRouterAndPermissionsContract.address,
    pkpNftContractAddress: pkpNFTContract.address,
    rateLimitNftContractAddress: rateLimitNftContract.address,
  };

  console.log("final JSON: ", JSON.stringify(finalJson, null, 2));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
