// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const fs = require('fs');
const { ethers, BigNumber } = require('ethers');


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

    const abiDir= './artifacts/contracts/ConditionValidations.sol/ConditionValidations.json'
    const file = fs.readFileSync(abiDir, "utf8")
    const json = JSON.parse(file)
 const abi = json.abi;

//  const chainProvider = hre.ethers.provider;
  const provider = getCeloProvider();
  console.log("Loading Contract : ",  hre.network.name );

  const address = '0xf8A8A5915a2a9EE98E92810F496744d9536FEdfc';
  const privateKey = '0xa53b355ac5320367a3985a7c9447b7df62a5b8508bebc671b5dfb0dc8692bc8f';
  var wallet = new ethers.Wallet(privateKey, provider);
  console.log('Wallet address:', await wallet.getAddress() );

  //const pkpContract = new ethers.Contract(address, abi,  provider);
  const contract = new ethers.Contract(address, abi, wallet);


  let result = await contract.whoamiNonMutative();

   console.log("Result:", result);
  
  // let result2 = await contract.whoamiMutative();

  // let tx = await result2.wait();

  //  console.log("Result:", tx);
  


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