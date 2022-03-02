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
  let nodeAccount1;
  let stakingContract;
  const totalTokens = 1000;
  const stakingAccount1IpAddress = "192.168.1.1";
  const stakingAccount1Port = 7777;

  before(async () => {
    // deploy token
    const TokenFactory = await ethers.getContractFactory("LITToken");
    [deployer, stakingAccount1, nodeAccount1, ...signers] =
      await ethers.getSigners();
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

  describe("validators and joining", () => {
    it("has the default validator set", async () => {
      stakingContract = stakingContract.connect(stakingAccount1);
      const validators = await stakingContract.getValidatorsInCurrentEpoch();
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
      const initialTokenBalance = await token.balanceOf(
        stakingAccount1.getAddress()
      );
      const initialValidatorEntry = await stakingContract.validators(
        stakingAccount1.getAddress()
      );
      const initialIpAddress = initialValidatorEntry.ip;
      const initialPort = initialValidatorEntry.port;
      const initialNodeAddresss = initialValidatorEntry.nodeAddress;
      const initialBalance = initialValidatorEntry.balance;
      const initialReward = initialValidatorEntry.reward;
      const initialNodeAddressToStakerAddress =
        await stakingContract.nodeAddressToStakerAddress(
          nodeAccount1.getAddress()
        );

      stakingContract = stakingContract.connect(stakingAccount1);
      await stakingContract.stakeAndJoin(
        totalToStake,
        ip2int(stakingAccount1IpAddress),
        0,
        stakingAccount1Port,
        nodeAccount1.getAddress()
      );

      const postStakeBal = await stakingContract.balanceOf(
        stakingAccount1.getAddress()
      );
      const postTokenBalance = await token.balanceOf(
        stakingAccount1.getAddress()
      );
      const postValidatorEntry = await stakingContract.validators(
        stakingAccount1.getAddress()
      );
      const postIpAddress = postValidatorEntry.ip;
      const postPort = postValidatorEntry.port;
      const postNodeAddress = postValidatorEntry.nodeAddress;
      const postBalance = postValidatorEntry.balance;
      const postReward = postValidatorEntry.reward;
      const postNodeAddressToStakerAddress =
        await stakingContract.nodeAddressToStakerAddress(
          nodeAccount1.getAddress()
        );

      expect(postTokenBalance).to.be.lt(initialTokenBalance);
      expect(postStakeBal).to.be.gt(initialStakeBal);
      expect(initialIpAddress).to.equal(0);
      expect(int2ip(postIpAddress)).to.equal(stakingAccount1IpAddress);
      expect(initialPort).to.equal(0);
      expect(postPort).to.equal(stakingAccount1Port);
      expect(initialNodeAddresss).to.equal(
        "0x0000000000000000000000000000000000000000"
      );
      // console.log("postNodeAddress", postNodeAddress);
      // console.log("nodeAccount1.getAddress()", await nodeAccount1.getAddress());
      expect(postNodeAddress).to.equal(await nodeAccount1.getAddress());
      expect(initialBalance).to.equal(0);
      expect(postBalance).to.equal(totalToStake);
      expect(initialReward).to.equal(0);
      expect(postReward).to.equal(0);

      expect(initialNodeAddressToStakerAddress).to.equal(
        "0x0000000000000000000000000000000000000000"
      );
      expect(postNodeAddressToStakerAddress).to.equal(
        await stakingAccount1.getAddress()
      );
    });

    it("cannot stake 0", async () => {
      stakingContract = stakingContract.connect(stakingAccount1);
      expect(
        stakingContract.stakeAndJoin(
          0,
          ip2int(stakingAccount1IpAddress),
          0,
          7777,
          nodeAccount1.getAddress()
        )
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
          0,
          7777,
          nodeAccount1.getAddress()
        )
      ).revertedWith("Stake must be greater than or equal to minimumStake");
    });
  });

  describe("setting new validators", () => {
    it("becomes a validator", async () => {
      // at this point, stakingAccount1 has already requested to join
      const validatorsInNextEpochBeforeTest =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochBeforeTest.length).equal(11);
      expect(
        validatorsInNextEpochBeforeTest.includes(
          await stakingAccount1.getAddress()
        )
      ).is.true;

      const epochBeforeAdvancingEpoch = await stakingContract.epoch();

      const validatorsForNextEpochLockedBeforeTest =
        await stakingContract.validatorsForNextEpochLocked();
      expect(validatorsForNextEpochLockedBeforeTest).is.false;

      // lock new validators
      await stakingContract.lockValidatorsForNextEpoch();

      const validatorsForNextEpochLockedAfterLocking =
        await stakingContract.validatorsForNextEpochLocked();
      expect(validatorsForNextEpochLockedAfterLocking).is.true;

      // validators should be unchanged
      const validators = await stakingContract.getValidatorsInCurrentEpoch();
      expect(validators.length).equal(10);

      // validators in next epoch should include stakingAccount1
      const validatorsInNextEpoch =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpoch.length).equal(11);
      expect(validatorsInNextEpoch[10]).equal(
        await stakingAccount1.getAddress()
      );

      // advance the epoch.  this sets the validators to be the new set
      await stakingContract.advanceEpoch();

      const epochAfterAdvancingEpoch = await stakingContract.epoch();

      // advancing the epoch should reset validatorsForNextEpochLocked
      const validatorsForNextEpochLockedAfterTest =
        await stakingContract.validatorsForNextEpochLocked();
      expect(validatorsForNextEpochLockedAfterTest).is.false;

      expect(epochAfterAdvancingEpoch.number).to.equal(
        epochBeforeAdvancingEpoch.number.add(1)
      );

      expect(epochAfterAdvancingEpoch.endBlock).to.equal(
        epochBeforeAdvancingEpoch.endBlock.add(
          epochBeforeAdvancingEpoch.epochLength
        )
      );

      // validators should include stakingAccount1
      const validatorsAfterAdvancingEpoch =
        await stakingContract.getValidatorsInCurrentEpoch();
      expect(validatorsAfterAdvancingEpoch.length).equal(11);
      expect(
        validatorsAfterAdvancingEpoch.includes(
          await stakingAccount1.getAddress()
        )
      ).is.true;
    });

    it("leaves as a validator", async () => {
      // validators should include stakingAccount1
      const validatorsBefore =
        await stakingContract.getValidatorsInCurrentEpoch();
      expect(validatorsBefore.length).equal(11);
      expect(validatorsBefore.includes(await stakingAccount1.getAddress())).is
        .true;

      const validatorsInNextEpochBefore =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochBefore.length).equal(11);
      expect(
        validatorsInNextEpochBefore.includes(await stakingAccount1.getAddress())
      ).is.true;

      // attempt to leave
      await stakingContract.requestToLeave();

      const validatorsInNextEpochAfter =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochAfter.length).equal(10);
      expect(
        validatorsInNextEpochAfter.includes(await stakingAccount1.getAddress())
      ).is.false;

      // create the new validator set
      await stakingContract.lockValidatorsForNextEpoch();

      const validatorsForNextEpochLockedAfterLocking =
        await stakingContract.validatorsForNextEpochLocked();
      expect(validatorsForNextEpochLockedAfterLocking).is.true;

      // advance the epoch.  this sets the validators to be the new set
      await stakingContract.advanceEpoch();

      const validatorsAfterAdvancingEpoch =
        await stakingContract.getValidatorsInCurrentEpoch();
      expect(validatorsAfterAdvancingEpoch.length).equal(10);
      expect(
        validatorsAfterAdvancingEpoch.includes(
          await stakingAccount1.getAddress()
        )
      ).to.be.false;

      const validatorsInNextEpochAfterAdvancingEpoch =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochAfterAdvancingEpoch.length).equal(10);
      expect(
        validatorsInNextEpochAfterAdvancingEpoch.includes(
          await stakingAccount1.getAddress()
        )
      ).to.be.false;
    });
  });
});
