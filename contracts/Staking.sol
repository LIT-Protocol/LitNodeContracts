//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "hardhat/console.sol";

contract Staking is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* ========== STATE VARIABLES ========== */

    enum States {
        Active,
        NextValidatorSetLocked,
        ReadyForNextEpoch
    }

    States public state = States.Active;

    IERC20 public stakingToken;

    // epoch vars
    struct Epoch {
        uint epochLength;
        uint number;
        uint endBlock;
    }
    Epoch public epoch;

    uint256 public tokenRewardPerTokenPerEpoch;

    uint256 public minimumStake;
    uint256 public totalStaked;

    EnumerableSet.AddressSet validatorsInCurrentEpoch;
    EnumerableSet.AddressSet validatorsInNextEpoch;

    struct Validator {
        uint32 ip;
        uint128 ipv6;
        uint32 port;
        address nodeAddress;
        uint256 balance;
        uint256 reward;
    }

    struct VoteToKickValidatorInNextEpoch {
        uint256 votes;
        mapping (address => bool) voted;
    }

    mapping (address => Validator) public validators;
    mapping (address => address) public nodeAddressToStakerAddress;
    mapping (address => bool) public readyForNextEpoch;
    mapping (uint => mapping (address => VoteToKickValidatorInNextEpoch)) public votesToKickValidatorsInNextEpoch;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _stakingToken) {
        stakingToken = IERC20(_stakingToken);
        epoch = Epoch({
            epochLength: 1,
            number: 1,
            endBlock: block.number + 1
        });
        tokenRewardPerTokenPerEpoch = (10^ERC20(address(stakingToken)).decimals()) / 20; // 0.05 tokens per token staked meaning a 5% per epoch inflation rate
        minimumStake = 2;
    }

    /* ========== VIEWS ========== */
    function rewardOf(address account) external view returns (uint256) {
        return validators[account].reward;
    }

    function balanceOf(address account) external view returns (uint256) {
        return validators[account].balance;
    }

    function getValidatorsInCurrentEpoch() external view returns (address[] memory) {
        address[] memory values = new address[](validatorsInCurrentEpoch.length());
        for(uint i = 0; i < validatorsInCurrentEpoch.length(); i++){
            values[i] = validatorsInCurrentEpoch.at(i);
        }
        return values;
    }

    function getValidatorsInNextEpoch() external view returns (address[] memory) {
        address[] memory values = new address[](validatorsInNextEpoch.length());
        for(uint i = 0; i < validatorsInNextEpoch.length(); i++){
            values[i] = validatorsInNextEpoch.at(i);
        }
        return values;
    }

    function isReadyForNextEpoch() public view returns (bool) {
        uint total = 0;
        for(uint i = 0; i < validatorsInCurrentEpoch.length(); i++){
            if (readyForNextEpoch[validatorsInCurrentEpoch.at(i)]){
                total++;
            }
        }
        if (total >= (validatorsInCurrentEpoch.length() / 3) * 2){ // 2/3 of validators must be ready
            return true;
        }
        return false;
    }

    function shouldKickValidator(address stakerAddress) public view returns (bool) {
        VoteToKickValidatorInNextEpoch storage vk = votesToKickValidatorsInNextEpoch[epoch.number][stakerAddress];
        if (vk.votes >= (validatorsInCurrentEpoch.length() / 3) * 2) { // 2/3 of validators must vote
            return true;
        }
        return false;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Lock in the validators for the next epoch
    function lockValidatorsForNextEpoch() public {
        require(block.number >= epoch.endBlock, "Enough blocks have not elapsed since the last epoch");
        require(state == States.Active, "Must be in active state");
        
        state = States.NextValidatorSetLocked;
        emit StateChanged(state);
    }

    /// After proactive secret sharing is complete, the nodes may signal that they are ready for the next epoch.  Note that this function is called by the node itself, and so msg.sender is the nodeAddress and not the stakerAddress.
    function signalReadyForNextEpoch() public {
        address stakerAddress = nodeAddressToStakerAddress[msg.sender];
        require(state == States.NextValidatorSetLocked, "Must be in state NextValidatorSetLocked");
        // at the first epoch, validatorsInCurrentEpoch is empty
        if (epoch.number != 1){
            require(validatorsInCurrentEpoch.contains(stakerAddress), "Validator is not in the current epoch");
        }
        require(!readyForNextEpoch[stakerAddress], "Validator is already ready for the next epoch");
        readyForNextEpoch[stakerAddress] = true;
        emit ReadyForNextEpoch(stakerAddress);

        if (isReadyForNextEpoch()){
            state = States.ReadyForNextEpoch;
            emit StateChanged(state);
        }
    }

    /// Advance to the next Epoch.  Rewards validators, adds the joiners, and removes the leavers
    function advanceEpoch() public {
        require(block.number >= epoch.endBlock, "Enough blocks have not elapsed since the last epoch");
        require(state == States.ReadyForNextEpoch, "Must be in ready for next epoch state");
        require(isReadyForNextEpoch() == true, "Not enough validators are ready for the next epoch");

        // reward the validators
        for(uint i = 0; i < validatorsInCurrentEpoch.length(); i++){
            address validatorAddress = validatorsInCurrentEpoch.at(i);
            validators[validatorAddress].reward += tokenRewardPerTokenPerEpoch * validators[validatorAddress].balance;

            // clear out readyForNextEpoch
            readyForNextEpoch[validatorAddress] = false;
        }

        // set the validators to the new validator set
        // ideally we could just do this:
        // validatorsInCurrentEpoch = validatorsInNextEpoch;
        // but solidity doesn't allow that, so we have to do it manually

        // clear out validators in current epoch
        while(validatorsInCurrentEpoch.length() > 0) {
            validatorsInCurrentEpoch.remove(validatorsInCurrentEpoch.at(0));
        }

        // copy validators from next epoch to current epoch
        for(uint i = 0; i < validatorsInNextEpoch.length(); i++){
            validatorsInCurrentEpoch.add(validatorsInNextEpoch.at(i));
        }

        epoch.number++;
        epoch.endBlock = epoch.endBlock + epoch.epochLength;

        state = States.Active;
        emit StateChanged(state);
    }

    /// Stake and request to join the validator set
    /// @param amount The amount of tokens to stake
    /// @param ip The IP address of the node
    /// @param port The port of the node
    function stakeAndJoin(uint256 amount, uint32 ip, uint128 ipv6, uint32 port, address nodeAddress) 
        public
        nonReentrant
        whenNotPaused
    {
        stake(amount);
        requestToJoin(ip, ipv6, port, nodeAddress);
    }

    /// Stake tokens for a validator
    function stake(uint256 amount) public {
        require(amount > 0, "Cannot stake 0");

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        validators[msg.sender].balance = validators[msg.sender].balance.add(amount);

        totalStaked = totalStaked.add(amount);

        emit Staked(msg.sender, amount);
    }

    function requestToJoin(uint32 ip, uint128 ipv6, uint32 port, address nodeAddress) public {
        uint256 amountStaked = validators[msg.sender].balance;
        require(amountStaked >= minimumStake, "Stake must be greater than or equal to minimumStake");
        require(state == States.Active, "Must be in active state to request to join");

        if (!validatorsInNextEpoch.contains(msg.sender)){
            validatorsInNextEpoch.add(msg.sender);
        }


        validators[msg.sender].ip = ip;
        validators[msg.sender].ipv6 = ipv6;
        validators[msg.sender].port = port;
        validators[msg.sender].nodeAddress = nodeAddress;
        nodeAddressToStakerAddress[nodeAddress] = msg.sender;

        emit RequestToJoin(msg.sender);
    }

    /// Withdraw staked tokens.  This can only be done by users who are not active in the validator set.
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint256 amount) public nonReentrant {
        require(amount > 0, "Cannot withdraw 0");

        require(validatorsInCurrentEpoch.contains(msg.sender) == false, "Active validators cannot leave.  Please use the leave() function and wait for the next epoch to leave");

        require(validators[msg.sender].balance >= amount, "Not enough tokens to withdraw");

        totalStaked = totalStaked.sub(amount);
        validators[msg.sender].balance = validators[msg.sender].balance.sub(amount);
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// Request to leave in the next Epoch
    function requestToLeave() public {
        require(state == States.Active, "Must be in active state to request to leave");
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
    function kickValidatorInNextEpoch(address validatorStakerAddress) public {
        require(state == States.NextValidatorSetLocked, "Must be in state NextValidatorSetLocked to kick validators");
        require(validatorsInNextEpoch.contains(validatorStakerAddress), "Validator is not in the next epoch");

        address stakerAddressOfSender = nodeAddressToStakerAddress[msg.sender];
        require(validatorsInNextEpoch.contains(stakerAddressOfSender), "You must be a validator in the next epoch to kick someone from the next epoch");
        require(votesToKickValidatorsInNextEpoch[epoch.number][validatorStakerAddress].voted[stakerAddressOfSender] == false, "You can only vote to kick someone once per epoch");

        // Vote to kick
        votesToKickValidatorsInNextEpoch[epoch.number][validatorStakerAddress].votes++;
        votesToKickValidatorsInNextEpoch[epoch.number][validatorStakerAddress].voted[stakerAddressOfSender] = true;

        if (shouldKickValidator(validatorStakerAddress)) {
            validatorsInNextEpoch.remove(validatorStakerAddress);
            emit ValidatorKickedFromNextEpoch(validatorStakerAddress);
        }

        emit VotedToKickValidatorInNextEpoch(stakerAddressOfSender, validatorStakerAddress);
    }

    /// Set the IP and port of your node
    /// @param ip The ip address of your node
    /// @param port The port of your node
    function setIpPortAndNodeAddress(uint32 ip, uint128 ipv6, uint32 port, address nodeAddress) public {
        validators[msg.sender].ip = ip;
        validators[msg.sender].ipv6 = ipv6;
        validators[msg.sender].port = port;
        validators[msg.sender].nodeAddress = nodeAddress;
    }


    function setEpochLength(uint256 newEpochLength) public onlyOwner {
        epoch.epochLength = newEpochLength;
    }

    function setStakingToken(address newStakingTokenAddress) public onlyOwner {
        stakingToken = IERC20(newStakingTokenAddress);
    }

    function setTokenRewardPerTokenPerEpoch(uint256 newTokenRewardPerTokenPerEpoch) public onlyOwner {
        tokenRewardPerTokenPerEpoch = newTokenRewardPerTokenPerEpoch;
    }

    function setMinimumStake(uint256 newMinimumStake) public onlyOwner {
        minimumStake = newMinimumStake;
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
    event VotedToKickValidatorInNextEpoch(address indexed staker, address indexed validatorStakerAddress);
    event ValidatorKickedFromNextEpoch(address indexed staker);
}
