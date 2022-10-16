const { expect } = require("chai");
const {
  ipfsIdToIpfsIdHash,
  getBytes32FromMultihash,
  getBytesFromMultihash,
} = require("../utils.js");
const { smock } = require("@defi-wonderland/smock");

describe("PubkeyRouterAndPermissions", function () {
  let deployer;
  let signers;
  let routerContract;
  let pkpContract;
  let stakingContract;
  let tokenContract;

  before(async () => {
    const RouterContractFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
    const PKPContractFactory = await ethers.getContractFactory("PKPNFT");
    // mock the staking contract so we can get it into the state we need
    const StakingContractFactory = await smock.mock("Staking");
    const TokenContractFactory = await ethers.getContractFactory("LITToken");

    [deployer, ...signers] = await ethers.getSigners();

    pkpContract = await PKPContractFactory.deploy();
    routerContract = await RouterContractFactory.deploy(pkpContract.address);
    tokenContract = await TokenContractFactory.deploy();

    await pkpContract.setRouterAddress(routerContract.address);

    stakingContract = await StakingContractFactory.deploy(
      tokenContract.address
    );

    stakingContract.isActiveValidator.returns(true);
    stakingContract.validatorCountForConsensus.returns(0);
  });

  describe("store and retrieve routing data", async () => {
    let fakePubkey =
      "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";

    context("when routing data is unset", async () => {
      beforeEach(async () => {
        routerContract = routerContract.connect(deployer);
      });

      it("retrieves empty routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [pubkey, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(pubkey).equal("0x");
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);
      });
    });

    context("when routing data is set", async () => {
      beforeEach(async () => {
        routerContract = await routerContract.connect(deployer);
        pkpContract = await pkpContract.connect(deployer);
      });

      it("sets and retrieves routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);

        // validate that it's unset
        const [pubkeyBefore, stakingContractAddressBefore, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(pubkeyBefore).equal("0x");
        expect(stakingContractAddressBefore).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        // set routing data
        const keyTypeInput = 1;

        await routerContract.voteForRoutingData(
          pubkeyHash,
          fakePubkey,
          stakingContract.address,
          keyTypeInput
        );

        // validate that it was set
        const [pubkeyAfter, stakingContractAddressAfter, keyTypeAfter] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(pubkeyAfter).equal(fakePubkey);
        expect(stakingContractAddressAfter).equal(stakingContract.address);
        expect(keyTypeAfter).equal(keyTypeInput);
      });
    });
  });

  describe("register a PKP and set routing permissions", async () => {
    context("when the PKP grants permission to an ETH address", async () => {
      // 64 byte pubkey - the max size we support
      let fakePubkey =
        "0x046db7b0736408e7874b746f6d54aa6e4d04fd8902b520af69493f62757e77e0b5247355f925af2b382b64c71fcb3ff3ad26469ca65b4d2945d6e6379a4f285b93";
      let tester;
      let creator;
      let tokenId;

      before(async () => {
        [creator, tester, ...signers] = signers;

        routerContract = await routerContract.connect(deployer);

        // check that the routing data for this pubkey is empty
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [pubkeyBefore, stakingContractAddressBefore, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(pubkeyBefore).equal("0x");
        expect(stakingContractAddressBefore).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        const keyTypeInput = 2;

        await routerContract.voteForRoutingData(
          pubkeyHash,
          fakePubkey,
          stakingContract.address,
          keyTypeInput
        );

        // validate that it was set
        const [pubkeyAfter, stakingContractAddressAfter, keyTypeAfter] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(pubkeyAfter).equal(fakePubkey);
        expect(stakingContractAddressAfter).equal(stakingContract.address);
        expect(keyTypeAfter).equal(keyTypeInput);

        tokenId = ethers.BigNumber.from(pubkeyHash);

        // mint the PKP to the tester account
        pkpContract = await pkpContract.connect(tester);
        // send eth with the txn
        const mintCost = await pkpContract.mintCost();
        const transaction = {
          value: mintCost,
        };
        await pkpContract.mintNext(2, transaction);
        const owner = await pkpContract.ownerOf(pubkeyHash);
        expect(owner).equal(tester.address);
      });

      it("grants permission to an eth address and then revokes it", async () => {
        const addressToPermit = "0x75EdCdfb5A678290A8654979703bdb75C683B3dD";

        pkpContract = await pkpContract.connect(tester);

        // validate that the address is not permitted
        let permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(false);

        // permit it
        routerContract = await routerContract.connect(tester);
        await routerContract.addPermittedAddress(tokenId, addressToPermit);
        permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAddress(tokenId, addressToPermit);
        permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(false);
      });

      it("grants permission to an IPFS id and then revokes it", async () => {
        const ipfsIdToPermit = "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z";
        // const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);
        const ipfsIdBytes = getBytesFromMultihash(ipfsIdToPermit);

        pkpContract = await pkpContract.connect(tester);

        // validate that the ipfs ID is not permitted
        let permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(false);

        // attempt to permit it
        // routerContract = await routerContract.connect(tester);
        // expect(
        //   routerContract.addPermittedAction(tokenId, ipfsIdBytes)
        // ).revertedWith(
        //   "Please register your Lit Action IPFS ID with the registerAction() function before permitting it to use a PKP"
        // );
        // permitted = await routerContract.isPermittedAction(tokenId, ipfsIdBytes);
        // expect(permitted).equal(false);

        // register the lit action
        // let registered = await routerContract.isActionRegistered(ipfsIdBytes);
        // expect(registered).equal(false);
        // const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
        // await routerContract.registerAction(
        //   multihashStruct.digest,
        //   multihashStruct.hashFunction,
        //   multihashStruct.size
        // );
        // registered = await routerContract.isActionRegistered(ipfsIdBytes);
        // expect(registered).equal(true);

        // permit it
        routerContract = await routerContract.connect(tester);
        await routerContract.addPermittedAction(tokenId, ipfsIdBytes);
        permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAction(tokenId, ipfsIdBytes);
        permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(false);
      });

      it("checks the PKP eth address", async () => {
        // validate that the address matches what ethers calculates
        console.log("fakePubkey", fakePubkey);
        const ethersResult = ethers.utils.computeAddress(fakePubkey);
        console.log("ethersResult", ethersResult);
        const pubkeyFromContract = await routerContract.getPubkey(tokenId);
        console.log("pubkeyFromContract", pubkeyFromContract);
        let ethAddressOfPKP = await routerContract.getEthAddress(tokenId);
        console.log("ethAddressOfPKP", ethAddressOfPKP);
        expect(ethAddressOfPKP).equal(ethersResult);
        expect(fakePubkey).equal(pubkeyFromContract);
      });

      it("grants permission to an IPFS id and then revokes it", async () => {
        const ipfsIdToPermit = "QmNc6gpdFBq1dF1imq5xhHQPmbWuL7ScGXChr2rjPgfkbZ";
        const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);

        pkpContract = await pkpContract.connect(tester);

        // validate that the ipfs ID is not permitted
        let permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdHash
        );
        expect(permitted).equal(false);

        const ipfsIdBytes = getBytesFromMultihash(ipfsIdToPermit);
        await routerContract.addPermittedAction(tokenId, ipfsIdBytes);

        permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAction(tokenId, ipfsIdBytes);
        permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(false);

        await routerContract.addPermittedAction(tokenId, ipfsIdBytes);

        permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdBytes
        );
        expect(permitted).equal(true);
      });

      it("registers and grants permission to a generic AuthMethod", async () => {
        const authMethodType = 1;
        const userId = "0xdeadbeef1234";
        const userPubkey = "0x9876543210";

        pkpContract = await pkpContract.connect(tester);

        // validate that the auth method is not permitted
        let permitted = await routerContract.isPermittedAuthMethod(
          tokenId,
          authMethodType,
          userId,
          userPubkey
        );
        expect(permitted).equal(false);

        // attempt to permit it
        routerContract = await routerContract.connect(tester);
        await routerContract.addPermittedAuthMethod(
          tokenId,
          authMethodType,
          userId,
          userPubkey
        );

        // lookup the pubkey by the user id
        let pubkey = await routerContract.getUserPubkeyForAuthMethod(
          authMethodType,
          userId
        );
        // console.log("pubkey stored in contract", pubkey);
        // console.log("userPubkey", userPubkey);
        expect(pubkey).equal(userPubkey);

        permitted = await routerContract.isPermittedAuthMethod(
          tokenId,
          authMethodType,
          userId,
          userPubkey
        );
        expect(permitted).equal(true);

        // do a reverse lookup
        let pkpIds = await routerContract.getTokenIdsForAuthMethod(
          authMethodType,
          userId
        );
        expect(pkpIds.length).equal(1);
        expect(pkpIds[0]).equal(tokenId);

        // try a check with the wrong pubkey
        await expect(
          routerContract.isPermittedAuthMethod(
            tokenId,
            authMethodType,
            userId,
            "0x55"
          )
        ).revertedWith(
          "The pubkey you submitted does not match the one stored"
        );

        // revoke
        await routerContract.removePermittedAuthMethod(
          tokenId,
          authMethodType,
          userId
        );
        permitted = await routerContract.isPermittedAuthMethod(
          tokenId,
          authMethodType,
          userId,
          userPubkey
        );
        expect(permitted).equal(false);

        // confirm that the reverse lookup is now empty
        pkpIds = await routerContract.getTokenIdsForAuthMethod(
          authMethodType,
          userId
        );
        expect(pkpIds.length).equal(0);
      });
    });
  });
});
