const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");
const {
  ipfsIdToIpfsIdHash,
  getBytes32FromMultihash,
  getBytesFromMultihash,
} = require("../utils.js");

describe("PKPNFT", function () {
  let deployer;
  let signers;
  let pkpContract;
  let router;

  let PkpFactory;
  let RouterFactory;

  before(async () => {
    PkpFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await smock.mock("PubkeyRouterAndPermissions");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    pkpContract = await PkpFactory.deploy();
    router = await RouterFactory.deploy(pkpContract.address);
    await pkpContract.setRouterAddress(router.address);
  });

  describe("Attempt to Mint PKP NFT", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => (pkpContract = pkpContract.connect(minter)));

    let pubkey =
      "0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    it("refuses to mint for free", async () => {
      expect(pkpContract.mintNext(2)).revertedWith(
        "You must pay exactly mint cost"
      );
    });

    it("refuses to mint because the PKP isnt routed yet", async () => {
      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      expect(pkpContract.mintNext(2, transaction)).revertedWith(
        "There are no unminted routed token ids to mint"
      );
    });

    it("mints successfully", async () => {
      // route it
      await router.setRoutingData(
        tokenId,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
        48,
        "0x0000000000000000000000000000000000000003",
        2
      );

      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      await pkpContract.mintNext(2, transaction);

      // check the token was minted
      const owner = await pkpContract.ownerOf(tokenId);
      expect(owner).to.equal(minter.address);
    });
  });

  describe("Test free minting of PKP NFT", async () => {
    let minter;
    let admin;

    let pubkey =
      "0x79ad3ad10f47993173e69e040a2e5299060bd531f4d5632b45a1b56f6dc17f9d";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    console.log("pubkeyhash: ", pubkeyHash);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    beforeEach(async () => ([minter, admin, ...signers] = signers));
    beforeEach(async () => {
      await router.setRoutingData(
        tokenId,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
        48,
        "0x0000000000000000000000000000000000000003",
        2
      );
    });
    beforeEach(async () => {
      pkpContract = pkpContract.connect(deployer);
      await pkpContract.setFreeMintSigner(admin.address);
    });

    it("refuses to mint with an empty sig", async () => {
      const freeMintId = 12345;

      // test with empty sig
      expect(
        pkpContract.freeMintNext(
          2,
          freeMintId,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          0,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        )
      ).revertedWith(
        "The msgHash is not a hash of the tokenId.  Explain yourself!"
      );
    });

    it("checks the signature for a free mint", async () => {
      const freeMintId = 12345;

      // sign for real
      const toSign = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [pkpContract.address, freeMintId]
      );
      let sig = await admin.signMessage(ethers.utils.arrayify(toSign));
      console.log("sig", sig);

      const r = sig.slice(0, 66);
      const s = "0x" + sig.slice(66, 130);
      const v = "0x" + sig.slice(130, 132);

      console.log("r: ", r);
      console.log("s: ", s);
      console.log("v: ", v);

      const msgHash = ethers.utils.solidityKeccak256(
        ["string", "bytes32"],
        ["\x19Ethereum Signed Message:\n32", toSign]
      );

      // mint ECDSA key

      await pkpContract.freeMintNext(2, freeMintId, msgHash, v, r, s);
    });
  });

  describe("Test Mint Grant And Burn", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => (pkpContract = pkpContract.connect(minter)));

    let pubkey =
      "0xb6505db66ceebb717d2b925660799c5fac6d8d14a4ed04c3dbeecffaf7a0d4c4c584dfddbbdeb8b80cb895af4b9eb61a216aa477f8ceb301c9c034b2239c2a08";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    it("mints, grants, and burns successfully", async () => {
      const keyPart1Bytes = ethers.utils.hexDataSlice(pubkey, 0, 32);
      const keyPart2Bytes = ethers.utils.hexZeroPad(
        ethers.utils.hexDataSlice(pubkey, 32),
        32
      );
      // route it
      await router.setRoutingData(
        tokenId,
        keyPart1Bytes,
        keyPart2Bytes,
        64,
        "0x0000000000000000000000000000000000000003",
        2
      );

      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      const ipfsIdToPermit = "QmW6uH8p17DcfvZroULkdEDAKThWzEDeNtwi9oezURDeXN";
      // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
      const ipfsIdBytes = getBytesFromMultihash(ipfsIdToPermit);
      // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);

      // await router.registerAction(
      //   multihashStruct.digest,
      //   multihashStruct.hashFunction,
      //   multihashStruct.size
      // );

      await pkpContract.mintGrantAndBurnNext(2, ipfsIdBytes, transaction);

      // check the token was minted
      expect(pkpContract.ownerOf(tokenId)).revertedWith(
        "ERC721: invalid token ID"
      );

      const actionIsPermitted = await router.isPermittedAction(
        tokenId,
        ipfsIdBytes
      );

      expect(actionIsPermitted).to.equal(true);
    });
  });
});
