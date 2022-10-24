const { expect } = require("chai");
// const hre = require("hardhat");
// const { ethers } = hre;
// const chainName = hre.network.name;

// console.log("chainName", chainName);

describe("AccessControlConditions", function () {
  let deployer;
  let signers;
  let contract;

  let ContractFactory;

  before(async () => {
    ContractFactory = await ethers.getContractFactory(
      "AccessControlConditions"
    );
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    contract = await ContractFactory.deploy();
  });

  describe("storeAndRetrieveCondition", async () => {
    context("when unauthorized", async () => {
      let creator;
      let tester;
      const key = 0x1234;
      const value = 0x5678;
      const chainId = 1;
      const permanent = false;

      beforeEach(async () => ([creator, tester, ...signers] = signers));

      beforeEach(
        async () =>
          await contract.storeCondition(key, value, chainId, permanent)
      );

      beforeEach(async () => (contract = contract.connect(tester)));

      it("retrieves empty condition", async () => {
        const [
          valueFromContract,
          chainIdFromContract,
          permanentFromContract,
          creatorFromContract,
        ] = await contract.getCondition(0xabcdef);
        expect(valueFromContract).equal(0);
        expect(chainIdFromContract).equal(0);
        expect(permanentFromContract).equal(permanent);
        expect(creatorFromContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
      });
    });

    context("when key is correct and condition is not permanent", async () => {
      let creator;
      let tester;
      const key = 0x1234;
      const value = 0x5678;
      const chainId = 1;
      const permanent = false;

      beforeEach(async () => {
        [creator, tester, ...signers] = signers;
        contract = contract.connect(creator);
      });

      beforeEach(
        async () =>
          await contract.storeCondition(key, value, chainId, permanent)
      );

      beforeEach(async () => (contract = contract.connect(tester)));

      it("retrieves condition and updates it", async () => {
        let [
          valueFromContract,
          chainIdFromContract,
          permanentFromContract,
          creatorFromContract,
        ] = await contract.getCondition(key);
        expect(valueFromContract).equal(value);
        expect(chainIdFromContract).equal(chainId);
        expect(permanentFromContract).equal(permanent);
        expect(creatorFromContract).equal(creator.address);

        const newValue = 0x8765;
        const newChainId = 2;

        // attempt to update it with the wrong address.  it should revert.
        expect(
          contract.storeCondition(key, newValue, newChainId, permanent)
        ).revertedWith("Only the condition creator can update it");

        // update with the correct address
        contract = contract.connect(creator);
        await contract.storeCondition(key, newValue, newChainId, permanent);

        [
          valueFromContract,
          chainIdFromContract,
          permanentFromContract,
          creatorFromContract,
        ] = await contract.getCondition(key);
        expect(valueFromContract).equal(newValue);
        expect(chainIdFromContract).equal(newChainId);
        expect(permanentFromContract).equal(permanent);
        expect(creatorFromContract).equal(creator.address);
      });
    });

    context("when key is correct and condition is permanent", async () => {
      let creator;
      let tester;
      const key = 0x1234;
      const value = 0x5678;
      const chainId = 1;
      const permanent = true;

      beforeEach(async () => {
        [creator, tester, ...signers] = signers;
        contract = contract.connect(creator);
      });

      beforeEach(
        async () =>
          await contract.storeCondition(key, value, chainId, permanent)
      );

      beforeEach(async () => (contract = contract.connect(tester)));

      it("retrieves condition and attempts to update it", async () => {
        let [
          valueFromContract,
          chainIdFromContract,
          permanentFromContract,
          creatorFromContract,
        ] = await contract.getCondition(key);
        expect(valueFromContract).equal(value);
        expect(chainIdFromContract).equal(chainId);
        expect(permanentFromContract).equal(permanent);
        expect(creatorFromContract).equal(creator.address);

        const newValue = 0x8765;
        const newChainId = 2;
        contract = contract.connect(creator);
        expect(
          contract.storeCondition(key, newValue, newChainId, permanent)
        ).revertedWith(
          "This condition was stored with the Permanent flag and cannot be updated"
        );

        // verify that nothing changed
        [
          valueFromContract,
          chainIdFromContract,
          permanentFromContract,
          creatorFromContract,
        ] = await contract.getCondition(key);
        expect(valueFromContract).equal(value);
        expect(chainIdFromContract).equal(chainId);
        expect(permanentFromContract).equal(permanent);
        expect(creatorFromContract).equal(creator.address);
      });
    });
  });
});
