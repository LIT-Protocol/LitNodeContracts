// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const ethers = hre.ethers; /// because if we run outside of HRE, we don't get the injection.
const { ip2int, int2ip } = require("../utils.js");
const { ipfsIdToIpfsIdHash } = require("../utils.js");
const { smock } = require("@defi-wonderland/smock");
require('dotenv').config();
require('hardhat-ethernal'); // required for ethernal - removing this will only break deploy scripts that are linked to ethernal .
//const tokenContractJSON = require("../artifacts/contracts/LitToken.sol/LitToken.json");
async function main () {

     [deployer, signer1, ...signers] = await hre.ethers.getSigners();


    const PKPNFT_Address = process.env.LIT_CONTRACT_PKPNFT  ;
    const LITToken_Address = process.env.LIT_CONTRACT_LITTOKEN;
    const Router_Address = process.env.LIT_CONTRACT_PUBKEYROUTERANDPERMISSIONS ;
    const Staking_Address = process.env.LIT_CONTRACT_STAKING;

    destAddress = await  signer1.address;
    console.log("dest: ", destAddress );


    let pkpContract = await ethers.getContractAt("PKPNFT",PKPNFT_Address, deployer); 
    // mock the staking contract so we can get it into the state we need   
    console.log("loading token contract using account:", deployer.address );
    let tokenContract  = await ethers.getContractAt("LITToken",LITToken_Address, deployer);  
    //const tokenContract = new ethers.Contract(LITToken_Address, tokenContractJSON.abi, deployer);

   console.log('tokenContract Address:', tokenContract.address);

   await tokenContract.transfer ( destAddress ,1);

    
    let routerContract =  await ethers.getContractAt("PubkeyRouterAndPermissions",Router_Address, deployer); 
    let stakingContract =  await ethers.getContractAt("Staking",Staking_Address, deployer); 
    
    routerContract = await routerContract.connect(deployer);
    pkpContract = await pkpContract.connect(deployer);
    tokenContract = await tokenContract.connect(deployer);
    

    let fakePubkey = "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";
    const pubkeyHash = ethers.utils.keccak256(fakePubkey);
    const [keyPart1, keyPart2, keyLength, stakingContractAddress, keyType] = await routerContract.getRoutingData(pubkeyHash);

    console.log("keyPart1:" , keyPart1);


    //  set routing data
        const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(fakePubkey, 32),
          32
        );

        const keyLengthInput = 48;
        const keyTypeInput = 1;

//        /*
        await routerContract.voteForRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContract.address,
          keyTypeInput
        );
//*/

        tokenId = ethers.BigNumber.from(pubkeyHash);
        
          console.log('Token Id: ' , tokenId);
          console.log('Token id (hex):', tokenId.toHexString() );
        // mint the PKP to the tester account
        pkpContract = await pkpContract.connect(signer1);
        // send eth with the txn
        const mintCost = await pkpContract.mintCost();
        const transaction = {
          value: mintCost,
        };

        console.log("mint cost:", mintCost);

        await pkpContract.mint(tokenId, transaction);

    // expect(keyPart1).equal(
    //       "0x0000000000000000000000000000000000000000000000000000000000000000"
    //     );
    //     expect(keyPart2).equal(
    //       "0x0000000000000000000000000000000000000000000000000000000000000000"
    //     );
    //     expect(keyLength).equal(0);
    //     expect(stakingContract).equal(
    //       "0x0000000000000000000000000000000000000000"
    //     );
    //     expect(keyType).equal(0);

}


// describe("PubkeyRouterAndPermissions", function () {
//   let deployer;
//   let signers;
//   let routerContract;
//   let pkpContract;
//   let stakingContract;
//   let tokenContract;

//   before(async () => {
//     const RouterContractFactory = await ethers.getContractFactory(
//       "PubkeyRouterAndPermissions"
//     );
//     const PKPContractFactory = await ethers.getContractFactory("PKPNFT");
//     // mock the staking contract so we can get it into the state we need
//     const StakingContractFactory = await smock.mock("Staking");
//     const TokenContractFactory = await ethers.getContractFactory("LITToken");

//     [deployer, ...signers] = await ethers.getSigners();

//     pkpContract = await PKPContractFactory.deploy();
//     routerContract = await RouterContractFactory.deploy(pkpContract.address);
//     tokenContract = await TokenContractFactory.deploy();

//     await pkpContract.setRouterAddress(routerContract.address);

//     stakingContract = await StakingContractFactory.deploy(
//       tokenContract.address
//     );

//     stakingContract.isActiveValidator.returns(true);
//     stakingContract.validatorCountForConsensus.returns(0);
//   });

//   describe("store and retrieve routing data", async () => {
//     let fakePubkey =
//       "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";

//     context("when routing data is unset", async () => {
//       beforeEach(async () => {
//         routerContract = routerContract.connect(deployer);
//       });

//       it("retrieves empty routing data", async () => {
//         const pubkeyHash = ethers.utils.keccak256(fakePubkey);
//         const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
//           await routerContract.getRoutingData(pubkeyHash);
//         expect(keyPart1).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyPart2).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyLength).equal(0);
//         expect(stakingContract).equal(
//           "0x0000000000000000000000000000000000000000"
//         );
//         expect(keyType).equal(0);
//       });
//     });

//     context("when routing data is set", async () => {
//       beforeEach(async () => {
//         routerContract = await routerContract.connect(deployer);
//         pkpContract = await pkpContract.connect(deployer);
//       });

//       it("sets and retrieves routing data", async () => {
//         const pubkeyHash = ethers.utils.keccak256(fakePubkey);

//         // validate that it's unset
//         const [
//           keyPart1,
//           keyPart2,
//           keyLength,
//           stakingContractAddressBefore,
//           keyType,
//         ] = await routerContract.getRoutingData(pubkeyHash);
//         expect(keyPart1).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyPart2).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyLength).equal(0);
//         expect(stakingContractAddressBefore).equal(
//           "0x0000000000000000000000000000000000000000"
//         );
//         expect(keyType).equal(0);

//         // set routing data
//         const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
//         const keyPart2Bytes = ethers.utils.hexZeroPad(
//           ethers.utils.hexDataSlice(fakePubkey, 32),
//           32
//         );

//         // console.log("full key: ", fakePubkey);

//         // console.log("keyPart1Bytes", keyPart1Bytes);
//         // console.log("keyPart2Bytes", keyPart2Bytes);

//         // console.log(
//         //   "packed with zeros stripped: ",
//         //   ethers.utils.solidityPack(
//         //     ["bytes32", "bytes"],
//         //     [keyPart1Bytes, ethers.utils.hexStripZeros(keyPart2Bytes)]
//         //   )
//         // );

//         const keyLengthInput = 48;
//         const keyTypeInput = 1;

//         await routerContract.voteForRoutingData(
//           pubkeyHash,
//           keyPart1Bytes,
//           keyPart2Bytes,
//           keyLengthInput,
//           stakingContract.address,
//           keyTypeInput
//         );

//         // validate that it was set
//         const [
//           keyPart1After,
//           keyPart2After,
//           keyLengthAfter,
//           stakingContractAddressAfter,
//           keyTypeAfter,
//         ] = await routerContract.getRoutingData(pubkeyHash);
//         expect(keyPart1After).equal(keyPart1Bytes);
//         expect(keyPart2After).equal(keyPart2Bytes);
//         expect(keyLengthAfter).equal(keyLengthInput);
//         expect(stakingContractAddressAfter).equal(stakingContract.address);
//         expect(keyTypeAfter).equal(keyTypeInput);
//       });
//     });
//   });

//   describe("register a PKP and set routing permissions", async () => {
//     context("when the PKP grants permission to an ETH address", async () => {
//       // 64 byte pubkey - the max size we support
//       let fakePubkey =
//         "0xf3eff7fd71d9ed07417480dd1bf36487d426d9a17129a1aa72ef946dff7be4769fca165782f439f85d594dca927187b98c65e978509dcc581b0cbc42abb9100f";
//       let tester;
//       let creator;
//       let tokenId;

//       before(async () => {
//         [creator, tester, ...signers] = signers;

//         routerContract = await routerContract.connect(deployer);

//         // check that the routing data for this pubkey is empty
//         const pubkeyHash = ethers.utils.keccak256(fakePubkey);
//         const [
//           keyPart1,
//           keyPart2,
//           keyLength,
//           stakingContractAddressBefore,
//           keyType,
//         ] = await routerContract.getRoutingData(pubkeyHash);
//         expect(keyPart1).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyPart2).equal(
//           "0x0000000000000000000000000000000000000000000000000000000000000000"
//         );
//         expect(keyLength).equal(0);
//         expect(stakingContractAddressBefore).equal(
//           "0x0000000000000000000000000000000000000000"
//         );
//         expect(keyType).equal(0);

//         const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
//         const keyPart2Bytes = ethers.utils.hexZeroPad(
//           ethers.utils.hexDataSlice(fakePubkey, 32),
//           32
//         );

//         const keyLengthInput = 64;
//         const keyTypeInput = 1;

//         await routerContract.voteForRoutingData(
//           pubkeyHash,
//           keyPart1Bytes,
//           keyPart2Bytes,
//           keyLengthInput,
//           stakingContract.address,
//           keyTypeInput
//         );

//         // validate that it was set
//         const [
//           keyPart1After,
//           keyPart2After,
//           keyLengthAfter,
//           stakingContractAddressAfter,
//           keyTypeAfter,
//         ] = await routerContract.getRoutingData(pubkeyHash);
//         expect(keyPart1After).equal(keyPart1Bytes);
//         expect(keyPart2After).equal(keyPart2Bytes);
//         expect(keyLengthAfter).equal(keyLengthInput);
//         expect(stakingContractAddressAfter).equal(stakingContract.address);
//         expect(keyTypeAfter).equal(keyTypeInput);

//         tokenId = ethers.BigNumber.from(pubkeyHash);

//         // mint the PKP to the tester account
//         pkpContract = await pkpContract.connect(tester);
//         // send eth with the txn
//         const mintCost = await pkpContract.mintCost();
//         const transaction = {
//           value: mintCost,
//         };
//         await pkpContract.mint(tokenId, transaction);
//       });

//       it("grants permission to an eth address and then revokes it", async () => {
//         const addressToPermit = "0x75EdCdfb5A678290A8654979703bdb75C683B3dD";

//         pkpContract = await pkpContract.connect(tester);

//         // validate that the address is not permitted
//         let permitted = await routerContract.isPermittedAddress(
//           tokenId,
//           addressToPermit
//         );
//         expect(permitted).equal(false);

//         // permit it
//         routerContract = await routerContract.connect(tester);
//         await routerContract.addPermittedAddress(tokenId, addressToPermit);
//         permitted = await routerContract.isPermittedAddress(
//           tokenId,
//           addressToPermit
//         );
//         expect(permitted).equal(true);

//         // revoke
//         await routerContract.removePermittedAddress(tokenId, addressToPermit);
//         permitted = await routerContract.isPermittedAddress(
//           tokenId,
//           addressToPermit
//         );
//         expect(permitted).equal(false);
//       });

//       it("grants permission to an IPFS id and then revokes it", async () => {
//         const ipfsIdToPermit = "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z";
//         const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);

//         pkpContract = await pkpContract.connect(tester);

//         // validate that the ipfs ID is not permitted
//         let permitted = await routerContract.isPermittedAction(
//           tokenId,
//           ipfsIdHash
//         );
//         expect(permitted).equal(false);

//         // permit it
//         routerContract = await routerContract.connect(tester);
//         await routerContract.addPermittedAction(tokenId, ipfsIdHash);
//         permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
//         expect(permitted).equal(true);

//         // revoke
//         await routerContract.removePermittedAction(tokenId, ipfsIdHash);
//         permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
//         expect(permitted).equal(false);
//       });
//     });
//   });
// });




// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })