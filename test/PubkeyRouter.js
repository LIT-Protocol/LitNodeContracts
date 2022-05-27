const { expect } = require("chai");
const { createHash } = require("crypto");

describe("PubkeyRouter", function () {
  let deployer;
  let signers;
  let contract;

  let ContractFactory;

  before(async () => {
    ContractFactory = await ethers.getContractFactory("PubkeyRouter");
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
        const digest = "0x" + hash.digest("hex");
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await contract.getRoutingData(digest);
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

    // context("when routing data is set", async () => {
    //   let creator;
    //   let tester;

    //   beforeEach(async () => {
    //     [creator, tester, ...signers] = signers;
    //     contract = contract.connect(creator);
    //   });

    //   beforeEach(async () => (contract = contract.connect(tester)));

    //   it("retrieves condition and updates it", async () => {
    //     let [
    //       valueFromContract,
    //       chainIdFromContract,
    //       permanentFromContract,
    //       creatorFromContract,
    //     ] = await contract.getCondition(key);
    //     expect(valueFromContract).equal(value);
    //     expect(chainIdFromContract).equal(chainId);
    //     expect(permanentFromContract).equal(permanent);
    //     expect(creatorFromContract).equal(creator.address);

    //     const newValue = 0x8765;
    //     const newChainId = 2;

    //     // attempt to update it with the wrong address.  it should revert.
    //     expect(
    //       contract.storeCondition(key, newValue, newChainId, permanent)
    //     ).revertedWith("Only the condition creator can update it");

    //     // update with the correct address
    //     contract = contract.connect(creator);
    //     await contract.storeCondition(key, newValue, newChainId, permanent);

    //     [
    //       valueFromContract,
    //       chainIdFromContract,
    //       permanentFromContract,
    //       creatorFromContract,
    //     ] = await contract.getCondition(key);
    //     expect(valueFromContract).equal(newValue);
    //     expect(chainIdFromContract).equal(newChainId);
    //     expect(permanentFromContract).equal(permanent);
    //     expect(creatorFromContract).equal(creator.address);
    //   });
    // });
  });
});
