const { expect } = require("chai");
const { ethers } = require("hardhat");
const { smock } = require("@defi-wonderland/smock");
const {
  ipfsIdToIpfsIdHash,
  getBytes32FromMultihash,
  getBytesFromMultihash,
} = require("../utils.js");

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
        pubkey,
        "0x0000000000000000000000000000000000000003",
        2
      );

      const addressesToPermit = [
        "0x75EdCdfb5A678290A8654979703bdb75C683B3dD",
        "0xeb250b8DA8021fE09Ea2D0121e20eDa65D523aA6",
      ];
      const ipfsIdsToPermit = [
        "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z",
        "QmSX1eaPhZjxb8rJtejunop8Sq41FMSUVv9HfqtPNtVi7j",
      ];
      const ipfsIdsBytes = ipfsIdsToPermit.map((f) => getBytesFromMultihash(f));
      // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
      // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
      const authMethodTypes = [1, 2];
      const authMethodUserIds = [
        "0xdeadbeef",
        "0x7ce7b7b6766949f0bf8552a0db7117de4e5628321ae8c589e67e5839ee3c1912402dfd0ed9be127812d0d2c16df2ac2c319ebed0927b0de98a3b946767577ad7",
      ];
      const authMethodPubkeys = [
        "0xacbe9af83570da302d072984c4938bd7d9dd86186ebedf53d693171d48dbf5e60e2ae9dc9f72ee9592b054ec0a9de5d3bac6a35b9f658b5183c40990e588ffea",
        "0x00",
      ];
      const authMethodIdHashes = authMethodUserIds.map((f, idx) =>
        ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["uint256", "bytes"],
            [authMethodTypes[idx], f]
          )
        )
      );

      // confirm that they aren't already permitted

      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      await pkpHelper.mintNextAndAddAuthMethods(
        2,
        ipfsIdsBytes,
        addressesToPermit,
        authMethodTypes,
        authMethodUserIds,
        authMethodPubkeys,
        transaction
      );

      // check the token was minted
      const owner = await pkpContract.ownerOf(tokenId);
      expect(owner).to.equal(minter.address);

      // check the auth methods
      for (let i = 0; i < addressesToPermit.length; i++) {
        const actionIsPermitted = await router.isPermittedAction(
          tokenId,
          ipfsIdsBytes[i]
        );
        expect(actionIsPermitted).to.equal(true);
      }

      for (let i = 0; i < addressesToPermit.length; i++) {
        const addressIsPermitted = await router.isPermittedAddress(
          tokenId,
          addressesToPermit[i]
        );
        expect(addressIsPermitted).to.equal(true);
      }

      for (let i = 0; i < authMethodTypes.length; i++) {
        const authMethodIsPermitted = await router.isPermittedAuthMethod(
          tokenId,
          authMethodTypes[i],
          authMethodUserIds[i],
          authMethodPubkeys[i]
        );
        expect(authMethodIsPermitted).to.equal(true);
      }

      // check the reverse mapping of the auth method
      for (let i = 0; i < authMethodTypes.length; i++) {
        const authedTokenIds = await router.getTokenIdsForAuthMethod(
          authMethodTypes[i],
          authMethodUserIds[i]
        );
        expect(authedTokenIds).to.deep.equal([tokenId]);
      }

      // check all the getters
      const permittedActions = await router.getPermittedActions(tokenId);
      // console.log("permittedActions: ", permittedActions);
      expect(permittedActions).to.deep.equal(ipfsIdsBytes);

      const permittedAddresses = await router.getPermittedAddresses(tokenId);
      expect(permittedAddresses).to.deep.equal([
        minter.address,
        ...addressesToPermit,
      ]);

      const permittedAuthMethods = await router.getPermittedAuthMethods(
        tokenId
      );
      expect(permittedAuthMethods.length).to.equal(2);
      // console.log("permittedAuthMethods: ", permittedAuthMethods);
      for (let i = 0; i < authMethodTypes.length; i++) {
        expect([
          permittedAuthMethods[i][0].toNumber(),
          permittedAuthMethods[i][1],
          permittedAuthMethods[i][2],
        ]).to.deep.equal([
          authMethodTypes[i],
          authMethodUserIds[i],
          authMethodPubkeys[i],
        ]);
      }
    });
  });
});
