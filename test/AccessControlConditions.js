const { expect } = require("chai");

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

      beforeEach(async () => ([creator, tester, ...signers] = signers));

      beforeEach(
        async () => await contract.storeCondition(key, value, chainId)
      );

      beforeEach(async () => (contract = contract.connect(tester)));

      it("retrieves empty condition", async () => {
        const [valueFromContract, chainIdFromContract] =
          await contract.getCondition(0xabcdef);
        expect(valueFromContract).equal(0);
        expect(chainIdFromContract).equal(0);
      });
    });

    context("when key is correct", async () => {
      let creator;
      let tester;
      const key = 0x1234;
      const value = 0x5678;
      const chainId = 1;

      beforeEach(async () => ([creator, tester, ...signers] = signers));

      beforeEach(
        async () => await contract.storeCondition(key, value, chainId)
      );

      beforeEach(async () => (contract = contract.connect(tester)));

      it("retrieves condition", async () => {
        const [valueFromContract, chainIdFromContract] =
          await contract.getCondition(key);
        expect(valueFromContract).equal(value);
        expect(chainIdFromContract).equal(chainId);
      });
    });
  });
});
