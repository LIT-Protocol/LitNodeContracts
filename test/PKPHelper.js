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
  let pkpPermissions;

  let PkpFactory;
  let RouterFactory;
  let PkpHelperFactory;

  before(async () => {
    PkpFactory = await ethers.getContractFactory("PKPNFT");
    RouterFactory = await smock.mock("PubkeyRouter");
    PkpHelperFactory = await ethers.getContractFactory("PKPHelper");
    PkpPermissionsFactory = await ethers.getContractFactory("PKPPermissions");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    pkpContract = await PkpFactory.deploy();
    router = await RouterFactory.deploy(pkpContract.address);
    await pkpContract.setRouterAddress(router.address);
    pkpPermissions = await PkpPermissionsFactory.deploy(
      pkpContract.address,
      router.address
    );
    pkpHelper = await PkpHelperFactory.deploy(
      pkpContract.address,
      pkpPermissions.address
    );
  });

  describe("Attempt to Mint PKP NFT via PKPHelper", async () => {
    let minter;

    beforeEach(async () => ([minter, recipient, ...signers] = signers));
    beforeEach(async () => {
      pkpContract = pkpContract.connect(minter);
      pkpHelper = pkpHelper.connect(minter);
    });

    it("mints successfully with permitted auth methods", async () => {
      let pubkey =
        "0x0478a6d8579e7b595d2c4c04b8d822f2a0fd8801ab352443db93da793383766e0bee476b8a8ab2f72754237b3e31d6ee0e000646642c7b50757f8645f26d802336";
      const pubkeyHash = ethers.utils.keccak256(pubkey);
      const tokenId = ethers.BigNumber.from(pubkeyHash);
      //console.log("PubkeyHash: " , pubkeyHash);
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
        true, //addPkpEthAddressAsPermittedAddress,
        transaction
      );

      // check the token was minted
      const owner = await pkpContract.ownerOf(tokenId);
      expect(owner).to.equal(minter.address);

      const pkpEthAddress = await pkpPermissions.getEthAddress(tokenId);

      // check the auth methods
      for (let i = 0; i < addressesToPermit.length; i++) {
        const actionIsPermitted = await pkpPermissions.isPermittedAction(
          tokenId,
          ipfsIdsBytes[i]
        );
        expect(actionIsPermitted).to.equal(true);
      }

      for (let i = 0; i < addressesToPermit.length; i++) {
        const addressIsPermitted = await pkpPermissions.isPermittedAddress(
          tokenId,
          addressesToPermit[i]
        );
        expect(addressIsPermitted).to.equal(true);
      }

      // confirm that the owner is also permitted
      const ownerIsPermitted = await pkpPermissions.isPermittedAddress(
        tokenId,
        minter.address
      );
      expect(ownerIsPermitted).to.equal(true);

      // confirm that the pkp eth address is permitted
      const pkpEthAddressIsPermitted = await pkpPermissions.isPermittedAddress(
        tokenId,
        pkpEthAddress
      );
      expect(pkpEthAddressIsPermitted).to.equal(true);

      for (let i = 0; i < authMethodTypes.length; i++) {
        const authMethodIsPermitted =
          await pkpPermissions.isPermittedAuthMethod(
            tokenId,
            authMethodTypes[i],
            authMethodUserIds[i],
            authMethodPubkeys[i]
          );
        expect(authMethodIsPermitted).to.equal(true);
      }

      // check the reverse mapping of the auth method
      for (let i = 0; i < authMethodTypes.length; i++) {
        const authedTokenIds = await pkpPermissions.getTokenIdsForAuthMethod(
          authMethodTypes[i],
          authMethodUserIds[i]
        );
        expect(authedTokenIds).to.deep.equal([tokenId]);
      }

      // check all the getters
      const permittedActions = await pkpPermissions.getPermittedActions(
        tokenId
      );
      // console.log("permittedActions: ", permittedActions);
      expect(permittedActions).to.deep.equal(ipfsIdsBytes);

      const permittedAddresses = await pkpPermissions.getPermittedAddresses(
        tokenId
      );
      expect(permittedAddresses).to.deep.equal([
        minter.address,
        ...addressesToPermit,
        pkpEthAddress,
      ]);

      const permittedAuthMethods = await pkpPermissions.getPermittedAuthMethods(
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

    it("mints without setting the pkp nft address as permitted", async () => {
      let pubkey =
        "0x04aae08ba986cf0c2e41b367e452751c9efb81170adb9c5e5a96cb0359f592c2b6fa5b12c752a501fdaf4701b4b6b2edd3ecb852c8c36b3759e802c45988dad84b";
      const pubkeyHash = ethers.utils.keccak256(pubkey);
      const tokenId = ethers.BigNumber.from(pubkeyHash);
      //console.log("PubkeyHash: " , pubkeyHash);

      // route it
      await router.setRoutingData(
        tokenId,
        pubkey,
        "0x0000000000000000000000000000000000000003",
        2
      );

      // send eth with the txn
      const mintCost = await pkpContract.mintCost();
      const transaction = {
        value: mintCost,
      };

      await pkpHelper.mintNextAndAddAuthMethods(
        2,
        [],
        [],
        [],
        [],
        [],
        false, //addPkpEthAddressAsPermittedAddress,
        transaction
      );

      // check the token was minted
      const owner = await pkpContract.ownerOf(tokenId);
      expect(owner).to.equal(minter.address);

      // check all the getters
      const permittedActions = await pkpPermissions.getPermittedActions(
        tokenId
      );
      // console.log("permittedActions: ", permittedActions);
      expect(permittedActions).to.deep.equal([]);

      const permittedAddresses = await pkpPermissions.getPermittedAddresses(
        tokenId
      );
      expect(permittedAddresses).to.deep.equal([minter.address]);

      const permittedAuthMethods = await pkpPermissions.getPermittedAuthMethods(
        tokenId
      );
      expect(permittedAuthMethods.length).to.equal(0);
    });
  });
});
