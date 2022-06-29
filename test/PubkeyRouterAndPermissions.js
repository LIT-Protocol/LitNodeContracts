const { expect } = require("chai");

describe("PubkeyRouterAndPermissions", function () {
  let deployer;
  let signers;
  let routerContract;

  let RouterContractFactory;
  let TokenContractFactory;
  let tokenContract;

  before(async () => {
    RouterContractFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
    TokenContractFactory = await ethers.getContractFactory("PKPNFT");

    [deployer, ...signers] = await ethers.getSigners();

    tokenContract = await TokenContractFactory.deploy();

    routerContract = await RouterContractFactory.deploy(tokenContract.address);

    tokenContract = await tokenContract.connect(deployer);
    await tokenContract.setRouterAddress(routerContract.address);
  });

  describe("store and retrieve routing data", async () => {
    let fakePubkey =
      "0x0437891234581f78d14b8efcf73f3120b28d88ac5ca316dbd1a83797defcf20b5a";

    context("when routing data is unset", async () => {
      beforeEach(async () => {
        routerContract = routerContract.connect(deployer);
      });

      it("retrieves empty routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);
      });
    });

    context("when routing data is set", async () => {
      beforeEach(async () => {
        routerContract = await routerContract.connect(deployer);
        tokenContract = await tokenContract.connect(deployer);
      });

      it("sets and retrieves routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);

        // validate that it's unset
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        // set routing data
        const keyPart1Bytes = ethers.utils.hexDataSlice(pubkeyHash, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(pubkeyHash, 32),
          32
        );

        const stakingContractAddress =
          "0x6cB3Cd5064692ac8e3368A1d6C29b36aE1143dF7"; // a random address
        const keyLengthInput = 48;
        const keyTypeInput = 1;

        await routerContract.setRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContractAddress,
          keyTypeInput
        );

        // validate that it was set
        const [
          keyPart1After,
          keyPart2After,
          keyLengthAfter,
          stakingContractAfter,
          keyTypeAfter,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAfter).equal(stakingContractAddress);
        expect(keyTypeAfter).equal(keyTypeInput);
      });
    });
  });

  describe("register a PKP and set routing permissions", async () => {
    context("when the PKP grants permission to an ETH address", async () => {
      // 64 byte pubkey - the max size we support
      let fakePubkey =
        "0xf3eff7fd71d9ed07417480dd1bf36487d426d9a17129a1aa72ef946dff7be4769fca165782f439f85d594dca927187b98c65e978509dcc581b0cbc42abb9100f";
      let tester;
      let creator;

      beforeEach(async () => {
        [creator, tester, ...signers] = signers;

        routerContract = await routerContract.connect(deployer);

        // check that the routing data for this pubkey is empty
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        const keyPart1Bytes = ethers.utils.hexDataSlice(pubkeyHash, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(pubkeyHash, 32),
          32
        );

        const stakingContractAddress =
          "0x6cB3Cd5064692ac8e3368A1d6C29b36aE1143dF7"; // a random address
        const keyLengthInput = 48;
        const keyTypeInput = 1;

        await routerContract.setRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContractAddress,
          keyTypeInput
        );

        // validate that it was set
        const [
          keyPart1After,
          keyPart2After,
          keyLengthAfter,
          stakingContractAfter,
          keyTypeAfter,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAfter).equal(stakingContractAddress);
        expect(keyTypeAfter).equal(keyTypeInput);
      });

      it("mints a PKP and grants permission to an eth address", async () => {
        tokenContract = await tokenContract.connect(tester);
        const txn = await tokenContract.mint(fakePubkey);
      });
    });
  });
});
