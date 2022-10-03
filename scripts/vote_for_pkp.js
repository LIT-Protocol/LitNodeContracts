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

    const abiDir= './artifacts/contracts/PubkeyRouterAndPermissions.sol/PubkeyRouterAndPermissions.json'
    const file = fs.readFileSync(abiDir, "utf8")
    const json = JSON.parse(file)
 const abi = json.abi;

//  const chainProvider = hre.ethers.provider;
  const provider = getCeloProvider();
  console.log("Loading Contract : ",  hre.network.name );

  const pkpRoutingAddress = '0xB145F631be4739B46467867751aBEB27bc7Ffa49';
  const stakingAddress = '0x9C78607fc58D59F8DDe7921dF587433cd0fB507D';
  const privateKey = '0xa53b355ac5320367a3985a7c9447b7df62a5b8508bebc671b5dfb0dc8692bc8f';
  var wallet = new ethers.Wallet(privateKey, provider);
  console.log('Wallet address:', await wallet.getAddress() );

  //const pkpContract = new ethers.Contract(address, abi,  provider);
  const pkpContract = new ethers.Contract(pkpRoutingAddress, abi, wallet);

  const pubkey =  "0x03eb50a62afc03e81f2ba70b114b21bb47349f485df1163db8e33a243a89137985";

  const keyPart1Bytes = ethers.utils.hexDataSlice(pubkey, 0, 32);
  const keyPart2Bytes = ethers.utils.hexZeroPad(
    ethers.utils.hexDataSlice(pubkey, 32),
    32
  );
  const keyLength = pubkey.replace(/^0x/, "").length / 2;
  const keyType = 2;
  const tokenId = ethers.utils.keccak256(pubkey);

//  let result = await pkpContract.owner();

  console.log('Params:', tokenId, keyPart1Bytes, keyPart2Bytes, keyLength, stakingAddress, keyType);

  let result = await pkpContract.voteForRoutingData(tokenId, keyPart1Bytes, keyPart2Bytes, keyLength, stakingAddress, keyType);

  
  console.log("Result:", result);
  



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