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
    // context('when unauthorized', async () => {
    //   let unauthorizedMinter
    //   let recipient

    //   beforeEach(async () => [unauthorizedMinter, recipient, ...signers] = signers)

    //   beforeEach(async () => token = token.connect(unauthorizedMinter))

    //   it('reverts', async () => {
    //     expect(token.mint(await recipient.getAddress(), 1))
    //       .revertedWith('LITToken: only minter')
    //   })
    // })

    context("when ready", async () => {
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
