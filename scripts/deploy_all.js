// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const { ip2int, int2ip } = require("../utils.js");
const fs = require('fs');

// quick & dirty config writing helper!
const f = (n , v) =>  {
  if (v) {  n = n + v };
  fs.appendFileSync('node.config', n + '\n', err => { 
    if (err) { console.error(err)}}
    );
}

async function main () {

  // ethernal config
  hre.ethernalUploadAst = true; // allow contract uploading.
  await  hre.ethernal.resetWorkspace('LocalHardHat');  /// <<< your ethernal project name.

  // we really only need a single deployer & are using HH accounts, but could override this to deploy to a public chain.
  [deployer, ...signers] = await hre.ethers.getSigners()

  // Deploy Contracts
  console.log("\n\nDeploying contracts : ");
  console.log('Deployer Account:', deployer.address)

  // Deploy Access Control Conditions
  const f_AccessCtlConditions = await hre.ethers.getContractFactory('AccessControlConditions', {signer : deployer} );
  const c_AccessCtlConditions = await  f_AccessCtlConditions.deploy();  /// currently the owner address is hardcoded.  To be replaced by public keys.
  await c_AccessCtlConditions.deployed()
  console.log('Contract for AccessControlConditions deployed to:', c_AccessCtlConditions.address)

  // Deploy LIT Token contract 
  const f_LITToken = await hre.ethers.getContractFactory('LITToken', {signer : deployer} );
  const c_LITToken = await  f_LITToken.deploy();  /// currently the owner address is hardcoded.  To be replaced by public keys.
  await c_LITToken.deployed()
  console.log('Contract for LITToken deployed to:', c_LITToken.address)

  // Deploy staking contract
  const f_Staking = await hre.ethers.getContractFactory('Staking', {signer : deployer} );
  const c_Staking = await  f_Staking.deploy(c_LITToken.address);  /// currently the owner address is hardcoded.  To be replaced by public keys.
  await c_Staking.deployed()
  console.log('Contract for Staking deployed to:', c_Staking.address)

  // Deploy Condition Validations Contract 
  const f_conditionValidation = await hre.ethers.getContractFactory('ConditionValidations', {signer : deployer} );
  const c_conditionValidation = await  f_conditionValidation.deploy('0x804C96C9750a57FB841f26a7bC9f2815782D8529');  /// currently the owner address is hardcoded.  To be replaced by public keys.
  await c_conditionValidation.deployed()
  console.log('Contract for ConditionValidations deployed to:', c_conditionValidation.address)

   // Get contract ASTs into ethernal
  await hre.ethernal.push({name:'AccessControlConditions', address: c_AccessCtlConditions.address});
  await hre.ethernal.push({name:'LITToken', address: c_LITToken.address});
  await hre.ethernal.push({name:'Staking', address: c_Staking.address});
  await hre.ethernal.push({name:'ConditionValidations', address: c_conditionValidation.address});

  // Set this value for the number of nodes to create 
  // This is primarily useful for setting up test/dev environments. 
  const nodeCount = 10;
  const initialMintAmount = 1000000;
  const nodeTransferAmount = 10000;
  const staking_amount = 10;

  // Mint some LIT Token! 
  await c_LITToken.mint(await deployer.getAddress() ,initialMintAmount);
  const InitialLITbalance = await c_LITToken.balanceOf(deployer.address);
  console.log("Minted amount of LIT =" , InitialLITbalance.toNumber()   );     // this is a BigInt

// Start building a configuration file!
  console.log("\n\nCreating Node.Config file.... \n\n");

// Chain for condition storage and minting/staking contracts

  f('[Chain]');
  f('Name = ', hre.network.name ); 
  f('ChainId = ', hre.network.config.chainId );
  f('RPC-URL =', hre.network.config.url  );

// Contract addresses (Condition Validations may also appear in other chains)
  f('\n[ContractAddress]');
  f('ConditionValidations = ', c_conditionValidation.address);
  f('AccessControlConditions = ', c_AccessCtlConditions.address);
  f('LITToken = ', c_LITToken.address);
  f('Staking = ', c_Staking.address);
  f('\n') ;

  const wallets = new Array(nodeCount);  
  let current_wallet;
  // Start Initializing nodes
  // in this case the nodes "own" their wallets - technically the 

  for (i = 0; i < nodeCount; i++)  {

    console.log('Processing Node#', i )
    
    const ipAddr = "127.0.0.1";
    const port = 7470 + i;
    const node_wallet = await hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    
    console.log('Impersonation:' ,  ( await hre.network.provider.send('hardhat_impersonateAccount', [node_wallet.address]) ) );
    console.log('Signer:' ,  ( await hre.ethers.provider.getSigner(node_wallet.address) ) );

    wallets[i] = node_wallet;

    // using ETH as gas in Hardhat.
    await deployer.sendTransaction({  
      to: node_wallet.address,
      value: hre.ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });

    console.log("Node ETH Balance () =" ,  await hre.ethers.provider.getBalance(node_wallet.address)     );     // this is a BigInt


     
    // config file entry
    f("[Node" + i + "]" );
    f("address = " , node_wallet.address.toLowerCase());
    f("privatekey = " , node_wallet.privateKey);  
    f("publickey = " , node_wallet.publicKey);
    f("url = " , ipAddr)
    f("port = " , port)
    f("");

    
    // the deployer is the minter / holder of LIT tokens 
    const dLITToken = await c_LITToken.connect(deployer);
    await dLITToken.transfer(node_wallet.address, nodeTransferAmount);

    // approve the transfer to the contract per ERC20   
    token = await c_LITToken.connect(node_wallet);  
    console.log("Node Balance () =" ,  (await token.balanceOf(node_wallet.address)).toNumber()   );     // this is a BigInt
    await token.approve(c_Staking.address, staking_amount);

    var node_balance = await c_LITToken.balanceOf(node_wallet.address);
    console.log("Node Balance (initial) =" , node_balance.toNumber()   );     // this is a BigInt
    console.log("Staking amount =" , staking_amount   );     // this is a BigInt

    // stake & join for the first epoch.
    const node_staking = await c_Staking.connect(node_wallet);    
    
    await node_staking.stakeAndJoin(
        staking_amount,
        ip2int(ipAddr),
        port,
        node_wallet.address
      );

    const post_node_balance = await c_LITToken.balanceOf(node_wallet.address);    
    console.log("LITbalance (post) =" , post_node_balance.toNumber()   );     // this is a BigInt

    await c_Staking.connect(node_wallet);
    const staking_contract_balance = await c_Staking.balanceOf(node_wallet.address);
    console.log("Staking balance (post) =" , staking_contract_balance.toNumber()   );     // this is a BigInt
  
    current_wallet = node_wallet;
   
  }

  console.log("\n\n\nFinished creating log file.  \n");
  console.log("next up validators set:", await c_Staking.getValidatorsInNextEpoch() );



  // if we want to prep our first set of nodes...  >>>  
  
  // const node_staking = await c_Staking.connect(current_wallet);    
  // console.log('Locking for first epoch...');
  // await node_staking.lockValidatorsForNextEpoch();
  // console.log('Advancing to first epoch...');
  // await node_staking.advanceEpoch();  
  // console.log("Current validators:", await c_Staking.getValidatorsInCurrentEpoch() )

 
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })


  /// test deployed to : 0x5FbDB2315678afecb367f032d93F642f64180aa3