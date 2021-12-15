const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { ip2int, int2ip } = require("../utils.js");

chai.use(solidity);
const { expect } = chai;

describe("Staking", function () {
  let deployer;
  let signers;
  let token;
  let stakingAccount1;
  let stakingContract;
  const totalTokens = 1000;
  const stakingAccount1IpAddress = "192.168.1.1";

  before(async () => {
    // deploy token
    const TokenFactory = await ethers.getContractFactory("LITToken");
    [deployer, stakingAccount1, ...signers] = await ethers.getSigners();
    token = await TokenFactory.deploy();
    await token.mint(deployer.getAddress(), totalTokens);

    // deploy staking contract
    const StakingFactory = await ethers.getContractFactory("Staking");
    stakingContract = await StakingFactory.deploy(token.address);
  });

  describe("Constructor & Settings", () => {
    it("should staking token on constructor", async () => {
      expect(await stakingContract.stakingToken(), token.address).is.equal;
    });

    it("should set owner on constructor", async () => {
      const ownerAddress = await stakingContract.owner();
      expect(ownerAddress, deployer).is.equal;
    });
  });

  describe("validators()", () => {
    it("has the default validator set", async () => {
      stakingContract = stakingContract.connect(stakingAccount1);
      const validators = await stakingContract.getValidators();
      expect(validators.length).equal(10);
    });

    it("can join as a staker", async () => {
      const totalToStake = 100;
      token = token.connect(deployer);
      await token.transfer(stakingAccount1.getAddress(), totalToStake);
      token = token.connect(stakingAccount1);
      await token.approve(stakingContract.address, totalToStake);

      const initialStakeBal = await stakingContract.balanceOf(
        stakingAccount1.getAddress()
      );
      const initialLpBal = await token.balanceOf(stakingAccount1.getAddress());
      const initialIpAddress = await stakingContract.ips(
        stakingAccount1.getAddress()
      );

      stakingContract = stakingContract.connect(stakingAccount1);
      await stakingContract.stakeAndJoin(
        totalToStake,
        ip2int(stakingAccount1IpAddress),
        7777
      );

      const postStakeBal = await stakingContract.balanceOf(
        stakingAccount1.getAddress()
      );
      const postLpBal = await token.balanceOf(stakingAccount1.getAddress());
      const postIpAddress = await stakingContract.ips(
        stakingAccount1.getAddress()
      );

      expect(postLpBal).to.be.lt(initialLpBal);
      expect(postStakeBal).to.be.gt(initialStakeBal);
      expect(initialIpAddress).to.equal(0);
      expect(int2ip(postIpAddress)).to.equal(stakingAccount1IpAddress);
    });

    it("cannot stake 0", async () => {
      stakingContract = stakingContract.connect(stakingAccount1);
      expect(
        stakingContract.stakeAndJoin(0, ip2int(stakingAccount1IpAddress), 7777)
      ).revertedWith("Cannot stake 0");
    });

    it("cannot stake less than the minimum stake", async () => {
      stakingContract = stakingContract.connect(stakingAccount1);
      const minStake = await stakingContract.minimumStake();
      // console.log("minStake", minStake);
      expect(
        stakingContract.stakeAndJoin(
          minStake - 1,
          ip2int(stakingAccount1IpAddress),
          7777
        )
      ).revertedWith("Stake must be greater than or equal to minimumStake");
    });
  });
});
