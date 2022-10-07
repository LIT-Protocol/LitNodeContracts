const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");
const { ipfsIdToIpfsIdHash, getBytes32FromMultihash } = require("../utils.js");

describe("PKPHelper", function () {
  let deployer;
  let signers;
  let pkpContract;
  let router;
  let pkpHelper;

  let PkpFactory;
  let RouterFactory;
  let PkpHelperFactory;

  before(async () => {
    PkpFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await smock.mock("PubkeyRouterAndPermissions");
    PkpHelperFactory = await ethers.getContractFactory("PKPHelper");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    pkpContract = await PkpFactory.deploy();
    router = await RouterFactory.deploy(pkpContract.address);
    await pkpContract.setRouterAddress(router.address);
    pkpHelper = await PkpHelperFactory.deploy(
      pkpContract.address,
      router.address
    );
  });

  describe("Attempt to Mint PKP NFT via PKPHelper", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => {
      pkpContract = pkpContract.connect(minter);
      pkpHelper = pkpHelper.connect(minter);
    });

    let pubkey =
      "0x034319b040a81f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a";
    const pubkeyHash = ethers.utils.keccak256(pubkey);
    const tokenId = ethers.BigNumber.from(pubkeyHash);
    //console.log("PubkeyHash: " , pubkeyHash);

    it("mints successfully with permitted auth methods", async () => {
      // route it
      await router.setRoutingData(
        tokenId,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
        48,
        "0x0000000000000000000000000000000000000003",
        2
      );

      const addressToPermit = "0x75EdCdfb5A678290A8654979703bdb75C683B3dD";
      const ipfsIdToPermit = "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z";
      const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
      const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
      const authMethodType = 1;
      const authMethodUserId = "0xdeadbeef";
      const authMethodId = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes"],
          [authMethodType, authMethodUserId]
        )
      );

      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      await pkpHelper.mintNextAndAddAuthMethods(
        2,
        multihashStruct.digest,
        multihashStruct.hashFunction,
        multihashStruct.size,
        addressToPermit,
        authMethodType,
        authMethodUserId,
        transaction
      );

      // check the token was minted
      const owner = await pkpContract.ownerOf(tokenId);
      expect(owner).to.equal(minter.address);

      // check the auth methods
      const actionIsPermitted = await router.isPermittedAction(
        tokenId,
        ipfsIdHash
      );
      expect(actionIsPermitted).to.equal(true);

      const addressIsPermitted = await router.isPermittedAddress(
        tokenId,
        addressToPermit
      );
      expect(addressIsPermitted).to.equal(true);

      const authMethodIsPermitted = await router.isPermittedAuthMethod(
        tokenId,
        authMethodType,
        authMethodUserId
      );
      expect(authMethodIsPermitted).to.equal(true);

      // check the reverse mapping of the auth method
      const authedTokenIds = await router.getTokenIdsForAuthMethod(
        authMethodType,
        authMethodUserId
      );
      expect(authedTokenIds).to.deep.equal([tokenId]);

      // check all the getters
      const permittedActions = await router.getPermittedActions(tokenId);
      expect(permittedActions).to.deep.equal([ipfsIdHash]);

      const permittedAddresses = await router.getPermittedAddresses(tokenId);
      expect(permittedAddresses).to.deep.equal([
        minter.address,
        addressToPermit,
      ]);

      const permittedAuthMethods = await router.getPermittedAuthMethods(
        tokenId
      );
      expect(permittedAuthMethods.length).to.equal(1);
      expect(permittedAuthMethods[0]).to.equal(authMethodId);
    });
  });
});
