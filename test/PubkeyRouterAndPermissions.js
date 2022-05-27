const { expect } = require("chai");
const { createHash } = require("crypto");

describe("PubkeyRouter", function () {
  let deployer;
  let signers;
  let contract;

  let ContractFactory;

  before(async () => {
    ContractFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    contract = await ContractFactory.deploy();
  });

  describe("store and retrieve routing data", async () => {
    context("when routing data is unset", async () => {
      let creator;
      let tester;

      beforeEach(async () => {
        [creator, tester, ...signers] = signers;
        contract = contract.connect(creator);
      });

      it("retrieves empty routing data", async () => {
        const hash = createHash("sha256");
        hash.update(Buffer.from("abcdef", "hex"));
        const pubkeyHash = "0x" + hash.digest("hex");
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await contract.getRoutingData(pubkeyHash);
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
        contract = contract.connect(deployer);
      });

      it("sets and retrieves routing data", async () => {
        const fakeBlsPubkey = ethers.utils.randomBytes(48);

        const hash = createHash("sha256");
        hash.update(Buffer.from(fakeBlsPubkey));
        const pubkeyHash = "0x" + hash.digest("hex");

        // validate that it's unset
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await contract.getRoutingData(pubkeyHash);
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
        const keyPart1Bytes = ethers.utils.hexDataSlice(fakeBlsPubkey, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(fakeBlsPubkey, 32),
          32
        );

        const stakingContractAddress =
          "0x6cB3Cd5064692ac8e3368A1d6C29b36aE1143dF7"; // a random address
        const keyLengthInput = 48;
        const keyTypeInput = 1;

        await contract.setRoutingData(
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
        ] = await contract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAfter).equal(stakingContractAddress);
        expect(keyTypeAfter).equal(keyTypeInput);
      });
    });
  });
});
