// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const { ip2int, int2ip } = require("../utils.js");
const fs = require('fs');
const { ethers, BigNumber } = require('ethers');
require('dotenv').config();

// because ethers isn't completely compatible....
const getCeloProvider = () => {
  const provider = new ethers.providers.JsonRpcProvider(hre.network.config.url);

  const blockFormat = provider.formatter.formats.block;
  blockFormat.gasLimit = () => ethers.BigNumber.from(0);
  blockFormat.nonce = () => "";
  blockFormat.difficulty = () => 0;

  const blockWithTransactionsFormat =
    provider.formatter.formats.blockWithTransactions;
  blockWithTransactionsFormat.gasLimit = () => ethers.BigNumber.from(0);
  blockWithTransactionsFormat.nonce = () => "";
  blockWithTransactionsFormat.difficulty = () => 0;

  return provider;
};


async function main () {

  // we really only need a single deployer & are using HH accounts, or the default account for the connected chain,  
  [deployer, ...signers] = await hre.ethers.getSigners()  /// the deployer is the first account lilsted

//  const chainProvider = hre.ethers.provider;
  const chainProvider = getCeloProvider();

  // Deploy Condition Validations Contract 
  const f_conditionValidation = await hre.ethers.getContractFactory('ConditionValidations', {signer : deployer} );
  const c_conditionValidation = await  f_conditionValidation.deploy('0x804C96C9750a57FB841f26a7bC9f2815782D8529');  /// currently the owner address is hardcoded.  To be replaced by public keys.
  await c_conditionValidation.deployed()
  console.log('Contract for ConditionValidations deployed to:', c_conditionValidation.address)



}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })


  /// test deployed to : 7.355248197 CELO ($5.617 USD) //  6.3439029795 CELO ($4.860 USD)