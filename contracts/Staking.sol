//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {LITToken} from "./LITToken.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "hardhat/console.sol";

contract Staking is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for LITToken;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* ========== STATE VARIABLES ========== */

    enum States {
        Active,
        NextValidatorSetLocked,
        ReadyForNextEpoch,
        Unlocked
    }

    // this enum is not used, and instead we use an integer so that
    // we can add more reasons after the contract is deployed.
    // This enum is kept in the comments here for reference.
    // enum KickReason {
    //     NULLREASON, // 0
    //     UNRESPONSIVE, // 1
    //     BAD_ATTESTATION // 2
    // }

    States public state = States.Active;

    LITToken public stakingToken;

    struct Epoch {
        uint256 epochLength;
        uint256 number;
        uint256 endBlock; //
        uint256 retries; // incremented upon failure to advance and subsequent unlock
    }

    Epoch public epoch;

    uint256 public tokenRewardPerTokenPerEpoch;

    uint256 public minimumStake;
    uint256 public totalStaked;

    // tokens slashed when kicked
    uint256 public kickPenaltyPercent;

    EnumerableSet.AddressSet validatorsInCurrentEpoch;
    EnumerableSet.AddressSet validatorsInNextEpoch;
    EnumerableSet.AddressSet validatorsKickedFromNextEpoch;

    struct Validator {
        uint32 ip;
        uint128 ipv6;
        uint32 port;
        address nodeAddress;
        uint256 balance;
        uint256 reward;
        uint256 senderPubKey;
        uint256 receiverPubKey;
    }

    struct VoteToKickValidatorInNextEpoch {
        uint256 votes;
        mapping(address => bool) voted;
    }

    // list of all validators, even ones that are not in the current or next epoch
    // maps STAKER address to Validator struct
    mapping(address => Validator) public validators;

    // stakers join by staking, but nodes need to be able to vote to kick.
    // to avoid node operators having to run a hotwallet with their staking private key,
    // the node gets it's own private key that it can use to vote to kick,
    // or signal that the next epoch is ready.
    // this mapping lets you go from the nodeAddressto the stakingAddress.
    mapping(address => address) public nodeAddressToStakerAddress;

    // after the validator set is locked, nodes vote that they have successfully completed the PSS
    // operation.  Once a threshold of nodes have voted that they are ready, then the epoch can advance
    mapping(address => bool) public readyForNextEpoch;

    // nodes can vote to kick another node.  If a threshold of nodes vote to kick someone, they
    // are removed from the next validator set
    mapping(uint256 => mapping(address => VoteToKickValidatorInNextEpoch))
        public votesToKickValidatorsInNextEpoch;

    // resolver contract address. the resolver contract is used to lookup other contract addresses.
    address public resolverContractAddress;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _stakingToken) {
        stakingToken = LITToken(_stakingToken);
        epoch = Epoch({
            epochLength: 80,
            number: 1,
            endBlock: block.number + 1,
            retries: 0
        });
        // 0.05 tokens per token staked meaning a 5% per epoch inflation rate
        tokenRewardPerTokenPerEpoch = (10 ^ stakingToken.decimals()) / 20;
        // 1 token minimum stake
        minimumStake = (1 * 10) ^ stakingToken.decimals();
        kickPenaltyPercent = 5;
    }

    /* ========== VIEWS ========== */
    function isActiveValidator(address account) external view returns (bool) {
        return validatorsInCurrentEpoch.contains(account);
    }

    function rewardOf(address account) external view returns (uint256) {
        return validators[account].reward;
    }

    function balanceOf(address account) external view returns (uint256) {
        return validators[account].balance;
    }

    function getVotingStatusToKickValidator(
        uint256 epochNumber,
        address validatorStakerAddress,
        address voterStakerAddress
    ) external view returns (uint256, bool) {
        VoteToKickValidatorInNextEpoch
            storage votingStatus = votesToKickValidatorsInNextEpoch[
                epochNumber
            ][validatorStakerAddress];
        return (votingStatus.votes, votingStatus.voted[voterStakerAddress]);
    }

    function getValidatorsInCurrentEpoch()
        external
        view
        returns (address[] memory)
    {
        address[] memory values = new address[](
            validatorsInCurrentEpoch.length()
        );
        for (uint256 i = 0; i < validatorsInCurrentEpoch.length(); i++) {
            values[i] = validatorsInCurrentEpoch.at(i);
        }
        return values;
    }

    function getValidatorsInNextEpoch()
        external
        view
        returns (address[] memory)
    {
        address[] memory values = new address[](validatorsInNextEpoch.length());
        for (uint256 i = 0; i < validatorsInNextEpoch.length(); i++) {
            values[i] = validatorsInNextEpoch.at(i);
        }
        return values;
    }

    function isReadyForNextEpoch() public view returns (bool) {
        uint256 total = 0;
        for (uint256 i = 0; i < validatorsInNextEpoch.length(); i++) {
            if (readyForNextEpoch[validatorsInNextEpoch.at(i)]) {
                total++;
            }
        }
        if ((total >= validatorCountForConsensus())) {
            // 2/3 of validators must be ready
            return true;
        }
        return false;
    }

    function shouldKickValidator(address stakerAddress)
        public
        view
        returns (bool)
    {
        VoteToKickValidatorInNextEpoch
            storage vk = votesToKickValidatorsInNextEpoch[epoch.number][
                stakerAddress
            ];
        if (vk.votes >= validatorCountForConsensus()) {
            // 2/3 of validators must vote
            return true;
        }
        return false;
    }

    // these could be checked with uint return value with the state getter, but included defensively in case more states are added.
    function validatorsInNextEpochAreLocked() public view returns (bool) {
        return state == States.NextValidatorSetLocked;
    }

    function validatorStateIsActive() public view returns (bool) {
        return state == States.Active;
    }

    function validatorStateIsUnlocked() public view returns (bool) {
        return state == States.Unlocked;
    }

    // currently set to 2/3.  this could be changed to be configurable.
    function validatorCountForConsensus() public view returns (uint256) {
        if (validatorsInCurrentEpoch.length() <= 2) {
            return 1;
        }
        return (validatorsInCurrentEpoch.length() * 2) / 3;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Lock in the validators for the next epoch
    function lockValidatorsForNextEpoch() public {
        require(
            block.number >= epoch.endBlock,
            "Enough blocks have not elapsed since the last epoch"
        );
        require(
            state == States.Active || state == States.Unlocked,
            "Must be in active or unlocked state"
        );

        state = States.NextValidatorSetLocked;
        emit StateChanged(state);
    }

    /// After proactive secret sharing is complete, the nodes may signal that they are ready for the next epoch.  Note that this function is called by the node itself, and so msg.sender is the nodeAddress and not the stakerAddress.
    function signalReadyForNextEpoch() public {
        address stakerAddress = nodeAddressToStakerAddress[msg.sender];
        require(
            state == States.NextValidatorSetLocked ||
                state == States.ReadyForNextEpoch,
            "Must be in state NextValidatorSetLocked or ReadyForNextEpoch"
        );
        // at the first epoch, validatorsInCurrentEpoch is empty
        if (epoch.number != 1) {
            require(
                validatorsInNextEpoch.contains(stakerAddress),
                "Validator is not in the next epoch"
            );
        }
        readyForNextEpoch[stakerAddress] = true;
        emit ReadyForNextEpoch(stakerAddress);

        if (isReadyForNextEpoch()) {
            state = States.ReadyForNextEpoch;
            emit StateChanged(state);
        }
    }

    /// If the nodes fail to advance (e.g. because dkg failed), anyone can call to unlock and allow retry
    function unlockValidatorsForNextEpoch() public {
        // the deadline to advance is thus epoch.endBlock + epoch.epochlength
        require(
            block.number >= epoch.endBlock + epoch.epochLength,
            "Enough blocks have not elapsed since the last epoch"
        );
        require(
            state == States.NextValidatorSetLocked,
            "Must be in NextValidatorSetLocked"
        );

        for (uint256 i = 0; i < validatorsInNextEpoch.length(); i++) {
            readyForNextEpoch[validatorsInNextEpoch.at(i)] = false;
        }

        epoch.retries++;
        epoch.endBlock = block.number + epoch.epochLength;

        state = States.Unlocked;
        emit StateChanged(state);
    }

    /// Advance to the next Epoch.  Rewards validators, adds the joiners, and removes the leavers
    function advanceEpoch() public {
        require(
            block.number >= epoch.endBlock,
            "Enough blocks have not elapsed since the last epoch"
        );
        require(
            state == States.ReadyForNextEpoch,
            "Must be in ready for next epoch state"
        );
        require(
            isReadyForNextEpoch() == true,
            "Not enough validators are ready for the next epoch"
        );

        // reward the validators
        for (uint256 i = 0; i < validatorsInCurrentEpoch.length(); i++) {
            address validatorAddress = validatorsInCurrentEpoch.at(i);
            validators[validatorAddress].reward +=
                (tokenRewardPerTokenPerEpoch *
                    validators[validatorAddress].balance) /
                10**stakingToken.decimals();
        }

        // set the validators to the new validator set
        // ideally we could just do this:
        // validatorsInCurrentEpoch = validatorsInNextEpoch;
        // but solidity doesn't allow that, so we have to do it manually

        // clear out validators in current epoch
        while (validatorsInCurrentEpoch.length() > 0) {
            validatorsInCurrentEpoch.remove(validatorsInCurrentEpoch.at(0));
        }

        // copy validators from next epoch to current epoch
        for (uint256 i = 0; i < validatorsInNextEpoch.length(); i++) {
            validatorsInCurrentEpoch.add(validatorsInNextEpoch.at(i));

            // clear out readyForNextEpoch
            readyForNextEpoch[validatorsInNextEpoch.at(i)] = false;
        }

        epoch.number++;
        epoch.endBlock = block.number + epoch.epochLength; // not epoch.endBlock +

        state = States.Active;
        emit StateChanged(state);
    }

    /// Stake and request to join the validator set
    /// @param amount The amount of tokens to stake
    /// @param ip The IP address of the node
    /// @param port The port of the node
    function stakeAndJoin(
        uint256 amount,
        uint32 ip,
        uint128 ipv6,
        uint32 port,
        address nodeAddress,
        uint256 senderPubKey,
        uint256 receiverPubKey
    ) public whenNotPaused {
        stake(amount);
        requestToJoin(
            ip,
            ipv6,
            port,
            nodeAddress,
            senderPubKey,
            receiverPubKey
        );
    }

    /// Stake tokens for a validator
    function stake(uint256 amount) public nonReentrant {
        require(amount > 0, "Cannot stake 0");

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        validators[msg.sender].balance += amount;

        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    function requestToJoin(
        uint32 ip,
        uint128 ipv6,
        uint32 port,
        address nodeAddress,
        uint256 senderPubKey,
        uint256 receiverPubKey
    ) public nonReentrant {
        uint256 amountStaked = validators[msg.sender].balance;
        require(
            amountStaked >= minimumStake,
            "Stake must be greater than or equal to minimumStake"
        );
        require(
            state == States.Active || state == States.Unlocked,
            "Must be in Active or Unlocked state to request to join"
        );

        // make sure they haven't been kicked
        require(
            validatorsKickedFromNextEpoch.contains(msg.sender) == false,
            "You cannot rejoin if you have been kicked until the next epoch"
        );

        validators[msg.sender].ip = ip;
        validators[msg.sender].ipv6 = ipv6;
        validators[msg.sender].port = port;
        validators[msg.sender].nodeAddress = nodeAddress;
        validators[msg.sender].senderPubKey = senderPubKey;
        validators[msg.sender].receiverPubKey = receiverPubKey;
        nodeAddressToStakerAddress[nodeAddress] = msg.sender;

        validatorsInNextEpoch.add(msg.sender);

        emit RequestToJoin(msg.sender);
    }

    /// Withdraw staked tokens.  This can only be done by users who are not active in the validator set.
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint256 amount) public nonReentrant {
        require(amount > 0, "Cannot withdraw 0");

        require(
            validatorsInCurrentEpoch.contains(msg.sender) == false,
            "Active validators cannot leave.  Please use the leave() function and wait for the next epoch to leave"
        );

        require(
            validators[msg.sender].balance >= amount,
            "Not enough tokens to withdraw"
        );

        totalStaked = totalStaked - amount;
        validators[msg.sender].balance =
            validators[msg.sender].balance -
            amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// Request to leave in the next Epoch
    function requestToLeave() public nonReentrant {
        require(
            state == States.Active || state == States.Unlocked,
            "Must be in Active or Unlocked state to request to leave"
        );
        if (validatorsInNextEpoch.contains(msg.sender)) {
            // remove them
            validatorsInNextEpoch.remove(msg.sender);
        }
        emit RequestToLeave(msg.sender);
    }

    /// Transfer any outstanding reward tokens
    function getReward() public nonReentrant {
        uint256 reward = validators[msg.sender].reward;
        if (reward > 0) {
            validators[msg.sender].reward = 0;
            stakingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /// Exit staking and get any outstanding rewards
    function exit() public {
        withdraw(validators[msg.sender].balance);
        getReward();
    }

    /// If more than the threshold of validators vote to kick someone, kick them.
    /// It's expected that this will be called by the node directly, so msg.sender will be the nodeAddress
    function kickValidatorInNextEpoch(
        address validatorStakerAddress,
        uint reason,
        bytes calldata data
    ) public nonReentrant {
        address stakerAddressOfSender = nodeAddressToStakerAddress[msg.sender];
        require(
            stakerAddressOfSender != address(0),
            "Could not map your nodeAddress to your stakerAddress"
        );
        require(
            validatorsInNextEpoch.contains(stakerAddressOfSender),
            "You must be a validator in the next epoch to kick someone from the next epoch"
        );
        require(
            votesToKickValidatorsInNextEpoch[epoch.number][
                validatorStakerAddress
            ].voted[stakerAddressOfSender] == false,
            "You can only vote to kick someone once per epoch"
        );

        // Vote to kick
        votesToKickValidatorsInNextEpoch[epoch.number][validatorStakerAddress]
            .votes++;
        votesToKickValidatorsInNextEpoch[epoch.number][validatorStakerAddress]
            .voted[stakerAddressOfSender] = true;

        if (
            validatorsInNextEpoch.contains(validatorStakerAddress) &&
            shouldKickValidator(validatorStakerAddress)
        ) {
            // remove from next validator set
            validatorsInNextEpoch.remove(validatorStakerAddress);
            // block them from rejoining the next epoch
            validatorsKickedFromNextEpoch.add(validatorStakerAddress);
            // slash the stake
            uint256 amountToBurn = (validators[validatorStakerAddress].balance *
                kickPenaltyPercent) / 100;
            validators[validatorStakerAddress].balance -= amountToBurn;
            totalStaked -= amountToBurn;
            stakingToken.burn(amountToBurn);
            // shame them with an event
            emit ValidatorKickedFromNextEpoch(validatorStakerAddress);
        }

        emit VotedToKickValidatorInNextEpoch(
            stakerAddressOfSender,
            validatorStakerAddress,
            reason,
            data
        );
    }

    /// Set the IP and port of your node
    /// @param ip The ip address of your node
    /// @param port The port of your node
    function setIpPortNodeAddressAndCommunicationPubKeys(
        uint32 ip,
        uint128 ipv6,
        uint32 port,
        address nodeAddress,
        uint256 senderPubKey,
        uint256 receiverPubKey
    ) public {
        validators[msg.sender].ip = ip;
        validators[msg.sender].ipv6 = ipv6;
        validators[msg.sender].port = port;
        validators[msg.sender].nodeAddress = nodeAddress;
        validators[msg.sender].senderPubKey = senderPubKey;
        validators[msg.sender].receiverPubKey = receiverPubKey;
    }

    function setEpochLength(uint256 newEpochLength) public onlyOwner {
        epoch.epochLength = newEpochLength;
    }

    function setStakingToken(address newStakingTokenAddress) public onlyOwner {
        stakingToken = LITToken(newStakingTokenAddress);
    }

    function setTokenRewardPerTokenPerEpoch(
        uint256 newTokenRewardPerTokenPerEpoch
    ) public onlyOwner {
        tokenRewardPerTokenPerEpoch = newTokenRewardPerTokenPerEpoch;
    }

    function setMinimumStake(uint256 newMinimumStake) public onlyOwner {
        minimumStake = newMinimumStake;
    }

    function setKickPenaltyPercent(uint256 newKickPenaltyPercent)
        public
        onlyOwner
    {
        kickPenaltyPercent = newKickPenaltyPercent;
    }

    function setResolverContractAddress(address newResolverContractAddress)
        public
        onlyOwner
    {
        resolverContractAddress = newResolverContractAddress;

        emit ResolverContractAddressChanged(newResolverContractAddress);
    }

    /* ========== EVENTS ========== */

    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed staker, uint256 amount);
    event RewardPaid(address indexed staker, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event RequestToJoin(address indexed staker);
    event RequestToLeave(address indexed staker);
    event Recovered(address token, uint256 amount);
    event ReadyForNextEpoch(address indexed staker);
    event StateChanged(States newState);
    event VotedToKickValidatorInNextEpoch(
        address indexed reporter,
        address indexed validatorStakerAddress,
        uint indexed reason,
        bytes data
    );
    event ValidatorKickedFromNextEpoch(address indexed staker);
    event ResolverContractAddressChanged(address resolverContractAddress);
}
