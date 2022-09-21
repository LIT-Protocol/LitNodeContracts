const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { ip2int, int2ip } = require("../utils.js");

chai.use(solidity);
const { expect } = chai;

describe("Staking Contract Inquiry", function () {
  let deployer;
  let signers;

    const ConditionValidations = '0x139e1D41943ee15dDe4DF876f9d0E7F85e26660A';
    const AccessControlConditions = '0x2625760C4A8e8101801D3a48eE64B2bEA42f1E96';
    const LITToken = '0xFE5f411481565fbF70D8D33D992C78196E014b90';
    const Staking = '0xD6b040736e948621c5b6E0a494473c47a6113eA8';

  // [deployer, ...signers] = await hre.ethers.getSigners()

    
  // describe("Constructor & Settings", () => {
  //       it("should staking token on constructor", async () => {
  //           expect(await stakingContract.stakingToken(), token.address).is.equal;
        
        
  //       });
  //  });
});
