const { assert } = require("chai");
const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("ethers");
const { ip2int, int2ip } = require("../utils.js");

chai.use(solidity);
const { expect } = chai;

const StakingState = {
  Active: 0,
  NextValidatorSetLocked: 1,
  ReadyForNextEpoch: 2,
};

const intToState = (num) => {
  return Object.keys(StakingState).filter((key) => {
    if (StakingState[key] === num) {
      return true;
    }
    return false;
  })[0];
};

describe("Staking", function () {
  let deployer;
  let signers;
  let token;
  let routerContract;
  let pkpNft;
  let stakingAccount1;
  let nodeAccount1;
  let stakingContract;
  let minStake;
  const stakingAccounts = [];
  const totalTokens = 1000000;
  const stakingAccount1IpAddress = "192.168.1.1";
  const stakingAccount1Port = 7777;
  const stakingAccountCount = 10;

  before(async () => {
    // deploy token
    const TokenFactory = await ethers.getContractFactory("LITToken");
    [deployer, stakingAccount1, nodeAccount1, ...signers] =
      await ethers.getSigners();

    token = await TokenFactory.deploy();
    await token.mint(deployer.getAddress(), totalTokens);
    token = token.connect(deployer);

    // deploy staking contract
    const StakingFactory = await ethers.getContractFactory("Staking");
    stakingContract = await StakingFactory.deploy(token.address);

    // deploy pkpNft
    const PkpNftFactory = await ethers.getContractFactory("PKPNFT");
    pkpNft = await PkpNftFactory.deploy();

    // deploy router
    const RouterFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
    routerContract = await RouterFactory.deploy(pkpNft.address);

    await pkpNft.setRouterAddress(routerContract.address);

    // set epoch length to 1 so that we can test quickly
    await stakingContract.setEpochLength(1);

    minStake = await stakingContract.minimumStake();

    let provider = deployer.provider;
    console.log(
      `deployer has ${await deployer.getBalance()} eth.  Funding stakers...`
    );

    // fund stakingAccount1 with tokens
    const totalToStake = minStake.mul(3); // 3 times the minimum stake
    await token.transfer(stakingAccount1.getAddress(), totalToStake);

    const ethForGas = ethers.utils.parseEther("1.0");
    // set stakingAccounts and stake with them
    for (let i = 0; i < stakingAccountCount; i++) {
      // create the wallets
      stakingAccounts.push({
        stakingAddress: ethers.Wallet.createRandom().connect(provider),
        nodeAddress: ethers.Wallet.createRandom().connect(provider),
      });

      // stake with them
      const stakingAccount = stakingAccounts[i];
      const stakingAddress = stakingAccount.stakingAddress.getAddress();
      const nodeAddress = stakingAccount.nodeAddress.getAddress();
      const ipAddress = ip2int(stakingAccount1IpAddress);
      const port = stakingAccount1Port + i + 1;

      // send them some gas
      await deployer.sendTransaction({
        to: stakingAddress,
        value: ethForGas,
      });
      await deployer.sendTransaction({
        to: nodeAddress,
        value: ethForGas,
      });

      // send them some tokens
      token = token.connect(deployer);
      await token.transfer(stakingAddress, totalToStake);
      token = token.connect(stakingAccount.stakingAddress);
      await token.approve(stakingContract.address, totalToStake);

      stakingContract = stakingContract.connect(stakingAccount.stakingAddress);

      await stakingContract.stakeAndJoin(
        minStake,
        ipAddress,
        0,
        port,
        nodeAddress
      );
    }

    // okay now that we're all staked, let's kickoff the first epoch
    await stakingContract.lockValidatorsForNextEpoch();
    // const currentState = await stakingContract.state();
    // console.log(
    //   `locked validators.  current state is ${intToState(currentState)}`
    // );
    // const validatorsInNextEpoch =
    // await stakingContract.getValidatorsInNextEpoch();
    // console.log(`validatorsInNextEpoch: ${validatorsInNextEpoch}`);
    for (let i = 0; i < stakingAccounts.length; i++) {
      stakingContract = stakingContract.connect(stakingAccounts[i].nodeAddress);
      await stakingContract.signalReadyForNextEpoch();
    }
    await stakingContract.advanceEpoch();
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
      // withdraw all tokens from staking contract
      await stakingContract.exit();
      token = token.connect(stakingAccount1);
      await token.approve(stakingContract.address, minStake);
      // const stakingAccount1TokenBalance = await token.balanceOf(
      //   stakingAccount1.getAddress()
      // );
      // console.log(
      //   `stakingAccount1TokenBalance: ${stakingAccount1TokenBalance}`
      // );
      // const stakingAccount1Allowance = await token.allowance(
      //   stakingAccount1.getAddress(),
      //   stakingContract.address
      // );
      // console.log(`stakingAccount1Allowance: ${stakingAccount1Allowance}`);
      expect(
        stakingContract.stakeAndJoin(
          minStake.sub(1),
          ip2int(stakingAccount1IpAddress),
          0,
          7777,
          nodeAccount1.getAddress()
        )
      ).revertedWith("Stake must be greater than or equal to minimumStake");
    });
  });

  it("can join as a staker", async () => {
    token = token.connect(deployer);
    await token.transfer(stakingAccount1.getAddress(), minStake);
    token = token.connect(stakingAccount1);
    await token.approve(stakingContract.address, minStake);

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
      minStake,
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
    expect(postBalance).to.equal(minStake);
    expect(initialReward).to.equal(0);
    expect(postReward).to.equal(0);

    expect(initialNodeAddressToStakerAddress).to.equal(
      "0x0000000000000000000000000000000000000000"
    );
    expect(postNodeAddressToStakerAddress).to.equal(
      await stakingAccount1.getAddress()
    );
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

      let currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

      // lock new validators
      await stakingContract.lockValidatorsForNextEpoch();

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.NextValidatorSetLocked);

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

      // signal that we are ready to advance epoch
      for (let i = 0; i < stakingAccounts.length; i++) {
        const stakingAccount = stakingAccounts[i];
        const { nodeAddress } = stakingAccount;
        stakingContract = stakingContract.connect(nodeAddress);
        await stakingContract.signalReadyForNextEpoch();
      }

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.ReadyForNextEpoch);

      stakingContract = stakingContract.connect(stakingAccount1);

      // advance the epoch.  this sets the validators to be the new set
      await stakingContract.advanceEpoch();

      const epochAfterAdvancingEpoch = await stakingContract.epoch();

      // advancing the epoch should reset validatorsForNextEpochLocked
      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

      expect(epochAfterAdvancingEpoch.number).to.equal(
        epochBeforeAdvancingEpoch.number.add(1)
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

    it("votes to register a PKP", async () => {
      const fakePubkey =
        "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";
      pkpNft = pkpNft.connect(deployer);

      // validate that it's not routed yet
      const pubkeyHash = ethers.utils.keccak256(fakePubkey);
      let [
        keyPart1,
        keyPart2,
        keyLength,
        stakingContractAddressBefore,
        keyType,
      ] = await routerContract.getRoutingData(pubkeyHash);
      expect(keyPart1).equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
      expect(keyPart2).equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
      expect(keyLength).equal(0);
      expect(stakingContractAddressBefore).equal(
        "0x0000000000000000000000000000000000000000"
      );
      expect(keyType).equal(0);

      let isRouted = await routerContract.isRouted(pubkeyHash);
      expect(isRouted).equal(false);

      // validate that it can't be minted because it's not routed yet
      let mintCost = await pkpNft.mintCost();

      expect(pkpNft.mintSpecific(pubkeyHash)).revertedWith(
        "This PKP has not been routed yet"
      );

      const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
      const keyPart2Bytes = ethers.utils.hexZeroPad(
        ethers.utils.hexDataSlice(fakePubkey, 32),
        32
      );
      const keyLengthInput = 48;
      const keyTypeInput = 2;

      // vote to register it with 5 nodes
      for (let i = 0; i < 5; i++) {
        const stakingAccount = stakingAccounts[i];
        const nodeAddress = stakingAccount.nodeAddress;
        routerContract = routerContract.connect(nodeAddress);
        // console.log("voting with address ", nodeAddress.address);
        await routerContract.voteForRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContract.address,
          keyTypeInput
        );
      }

      // validate that it was not set yet because the threshold of 6 have not voted yet
      [keyPart1, keyPart2, keyLength, stakingContractAddressBefore, keyType] =
        await routerContract.getRoutingData(pubkeyHash);
      expect(keyPart1).equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
      expect(keyPart2).equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
      expect(keyLength).equal(0);
      expect(stakingContractAddressBefore).equal(
        "0x0000000000000000000000000000000000000000"
      );
      expect(keyType).equal(0);

      isRouted = await routerContract.isRouted(pubkeyHash);
      expect(isRouted).equal(false);

      // validate that the voting process is going as expected
      let [routingData, nodeVoteCount, nodeVoteThreshold, votedNodes] =
        await routerContract.pubkeyRegistrations(pubkeyHash);
      expect(nodeVoteThreshold).equal(6);
      expect(nodeVoteCount).equal(5);

      // this data is the candidate data.  if the votes pass, this becomes the real routing data.  this should match what the nodes are voting for
      [keyPart1, keyPart2, keyLength, stakingContractAddressBefore, keyType] =
        routingData;
      expect(keyPart1).equal(keyPart1Bytes);
      expect(keyPart2).equal(keyPart2Bytes);
      expect(keyLength).equal(keyLengthInput);
      expect(stakingContractAddressBefore).equal(stakingContract.address);
      expect(keyType).equal(keyTypeInput);

      // now vote with the rest of the nodes
      for (let i = 5; i < stakingAccounts.length; i++) {
        const stakingAccount = stakingAccounts[i];
        const nodeAddress = stakingAccount.nodeAddress;
        routerContract = routerContract.connect(nodeAddress);
        // console.log("voting with address ", nodeAddress.address);
        await routerContract.voteForRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContract.address,
          keyTypeInput
        );
        if (i === 6) {
          // confirm that it was set after the 7th node has voted
          // because it's set after the nodeVoteCount > nodeVoteThreshold which is 6.
          let [
            keyPart1After,
            keyPart2After,
            keyLengthAfter,
            stakingContractAddressAfter,
            keyTypeAfter,
          ] = await routerContract.getRoutingData(pubkeyHash);
          expect(keyPart1After).equal(keyPart1Bytes);
          expect(keyPart2After).equal(keyPart2Bytes);
          expect(keyLengthAfter).equal(keyLengthInput);
          expect(stakingContractAddressAfter).equal(stakingContract.address);
          expect(keyTypeAfter).equal(keyTypeInput);

          isRouted = await routerContract.isRouted(pubkeyHash);
          expect(isRouted).equal(true);
        }
      }

      // validate that it was set after all the voting finished
      let [
        keyPart1After,
        keyPart2After,
        keyLengthAfter,
        stakingContractAddressAfter,
        keyTypeAfter,
      ] = await routerContract.getRoutingData(pubkeyHash);
      expect(keyPart1After).equal(keyPart1Bytes);
      expect(keyPart2After).equal(keyPart2Bytes);
      expect(keyLengthAfter).equal(keyLengthInput);
      expect(stakingContractAddressAfter).equal(stakingContract.address);
      expect(keyTypeAfter).equal(keyTypeInput);

      isRouted = await routerContract.isRouted(pubkeyHash);
      expect(isRouted).equal(true);

      // confirm that we can now mint it
      // send eth with the txn
      // expect(pkpNft.ownerOf(pubkeyHash)).revertedWith(
      //   "ERC721: owner query for nonexistent token"
      // );
      pkpNft = pkpNft.connect(stakingAccount1);
      mintCost = await pkpNft.mintCost();
      transaction = {
        value: mintCost,
      };
      const tx = await pkpNft.mintNext(2, transaction);
      const ret = await tx.wait(); // 0ms, as tx is already confirmed
      const tokenIdFromEvent = ret.events[0].topics[3];
      expect(tokenIdFromEvent).to.equal(pubkeyHash);
      owner = await pkpNft.ownerOf(pubkeyHash);
      expect(owner).to.equal(stakingAccount1.address);

      // confirm that the getter that reassembles the pubkey returns a perfect match
      let pubkeyFromRouter = await routerContract.getFullPubkey(pubkeyHash);
      expect(pubkeyFromRouter).equal(fakePubkey);
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

      let currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

      // create the new validator set
      await stakingContract.lockValidatorsForNextEpoch();

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.NextValidatorSetLocked);

      // signal that we are ready to advance epoch
      for (let i = 0; i < stakingAccounts.length; i++) {
        const stakingAccount = stakingAccounts[i];
        const nodeAddress = stakingAccount.nodeAddress;
        stakingContract = stakingContract.connect(nodeAddress);
        await stakingContract.signalReadyForNextEpoch();
      }

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.ReadyForNextEpoch);

      stakingContract = stakingContract.connect(stakingAccount1);

      // advance the epoch.  this sets the validators to be the new set
      await stakingContract.advanceEpoch();

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

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

    it("kicks and slashes validator", async () => {
      const toBeKicked = stakingAccounts[stakingAccounts.length - 1];

      const validatorsBefore =
        await stakingContract.getValidatorsInCurrentEpoch();
      expect(validatorsBefore.length).equal(10);

      const validatorsInNextEpochBefore =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochBefore.length).equal(10);

      const kickedValidatorStakeBefore = await stakingContract.balanceOf(
        toBeKicked.stakingAddress.getAddress()
      );
      const totalStakedBefore = await stakingContract.totalStaked();

      // vote to kick the last stakingAccount
      for (let i = 0; i < stakingAccounts.length - 1; i++) {
        const stakingAccount = stakingAccounts[i];
        const nodeAddress = stakingAccount.nodeAddress;
        stakingContract = stakingContract.connect(nodeAddress);
        await stakingContract.kickValidatorInNextEpoch(
          toBeKicked.stakingAddress.getAddress()
        );
      }

      const validatorsInNextEpochAfter =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochAfter.length).equal(9);
      expect(
        validatorsInNextEpochAfter.includes(
          await toBeKicked.stakingAddress.getAddress()
        )
      ).is.false;

      // check that they were slashed
      const kickedValidatorStakeAfter = await stakingContract.balanceOf(
        toBeKicked.stakingAddress.getAddress()
      );
      const kickPenaltyPercent = await stakingContract.kickPenaltyPercent();
      const amountBurned = kickedValidatorStakeBefore.mul(
        kickPenaltyPercent.div(BigNumber.from(100))
      );

      expect(kickedValidatorStakeAfter.toString()).to.equal(
        kickedValidatorStakeBefore.sub(amountBurned).toString()
      );

      const totalStakedAfter = await stakingContract.totalStaked();
      expect(totalStakedAfter.toString()).to.equal(
        totalStakedBefore.sub(amountBurned).toString()
      );

      let currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

      // create the new validator set
      await stakingContract.lockValidatorsForNextEpoch();

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.NextValidatorSetLocked);

      // signal that we are ready to advance epoch
      for (let i = 0; i < stakingAccounts.length - 1; i++) {
        const stakingAccount = stakingAccounts[i];
        const nodeAddress = stakingAccount.nodeAddress;
        stakingContract = stakingContract.connect(nodeAddress);
        await stakingContract.signalReadyForNextEpoch();
      }

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.ReadyForNextEpoch);

      // advance the epoch.  this sets the validators to be the new set
      await stakingContract.advanceEpoch();

      currentState = await stakingContract.state();
      expect(currentState).to.equal(StakingState.Active);

      const validatorsAfterAdvancingEpoch =
        await stakingContract.getValidatorsInCurrentEpoch();
      expect(validatorsAfterAdvancingEpoch.length).equal(9);
      expect(
        validatorsAfterAdvancingEpoch.includes(
          await toBeKicked.stakingAddress.getAddress()
        )
      ).to.be.false;

      const validatorsInNextEpochAfterAdvancingEpoch =
        await stakingContract.getValidatorsInNextEpoch();
      expect(validatorsInNextEpochAfterAdvancingEpoch.length).equal(9);
      expect(
        validatorsInNextEpochAfterAdvancingEpoch.includes(
          await toBeKicked.stakingAddress.getAddress()
        )
      ).to.be.false;
    });
  });
});
