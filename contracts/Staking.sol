//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract Staking is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */

    IERC20 public stakingToken;

    // epoch vars
    struct Epoch {
        uint epochLength;
        uint number;
        uint endBlock;
    }
    Epoch public epoch;
    uint256 public epochNumberForValidatorsInNextEpoch;

    uint256 public tokenRewardPerTokenPerEpoch;

    uint256 public minimumStake;
    uint256 public totalStaked;
    
    struct ValidatorAddressList {
        address[] values;
        mapping (address => bool) isIn;
        mapping (address => uint) indices;
    }
    ValidatorAddressList validatorsInCurrentEpoch;
    ValidatorAddressList validatorsInNextEpoch;
    bool public validatorsForNextEpochLocked;

    struct Validator {
        uint32 ip;
        uint32 port;
        address nodeAddress;
        uint256 balance;
        uint256 reward;
    }
    mapping(address => Validator) public validators;
    mapping(address => address) public nodeAddressToStakerAddress;

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

        // for testing
        // address[10] memory validatorAddresses = [
        //     address(0x2e910606fBa7c361Cee433D92ED2Cf21cBBe4EA5),
        //     address(0xC027471D03F30669C69ABC6D167835C4987185Ca),
        //     address(0x3dbFCf705d31d1B15C49379f2A27F1bbDFCc2544),
        //     address(0x4B8bf506c3A84F70F8d4846810b23ea7ba843E7B),
        //     address(0x40903E6df2038387eEA2751DE5d88980C8c3Ee9E),
        //     address(0x8a328Fee737Ff229c6a0EF73fFfaF745Fa7A9af8),
        //     address(0xa2e4dc9bDeB241A6d7DD6b1890508352041295fE),
        //     address(0xAA30b2396e0eE819FD3E02aeCd53083828C1daf1),
        //     address(0xeB9852914510d8248D367A0E4689Fb5A4e1cF375),
        //     address(0x237844451B37231Ea04c25031b86CC943EB0ed14)  
        // ];

        // uint32 ip = 2130706433;
        // uint32 startingPort = 7470;
        // for (uint32 i=0; i<validatorAddresses.length; i++) {
        //     validators[validatorAddresses[i]] = Validator({
        //         ip: ip,
        //         port: startingPort + i,
        //         nodeAddress: validatorAddresses[i],
        //         balance: 0,
        //         reward: 0
        //     });
        //     validatorsInCurrentEpoch.indices[validatorAddresses[i]] = validatorsInCurrentEpoch.values.length;
        //     validatorsInCurrentEpoch.values.push(validatorAddresses[i]);
        //     validatorsInCurrentEpoch.isIn[validatorAddresses[i]] = true;

        //     validatorsInNextEpoch.indices[validatorAddresses[i]] = validatorsInNextEpoch.values.length;
        //     validatorsInNextEpoch.values.push(validatorAddresses[i]);
        //     validatorsInNextEpoch.isIn[validatorAddresses[i]] = true;
        // }

        validatorsForNextEpochLocked = false;
    }

    /* ========== VIEWS ========== */
    function rewardOf(address account) external view returns (uint256) {
        return validators[account].reward;
    }

    function balanceOf(address account) external view returns (uint256) {
        return validators[account].balance;
    }

    function getValidatorsInCurrentEpoch() external view returns (address[] memory) {
        return validatorsInCurrentEpoch.values;
    }

    function getValidatorsInNextEpoch() external view returns (address[] memory) {
        return validatorsInNextEpoch.values;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Lock in the validators for the next epoch
    function lockValidatorsForNextEpoch() public {
        require(block.number >= epoch.endBlock, "Enough blocks have not elapsed since the last epoch");
        validatorsForNextEpochLocked = true;
    }

    /// Advance to the next Epoch.  Rewards validators, adds the joiners, and removes the leavers
    function advanceEpoch() public {
        require(block.number >= epoch.endBlock, "Enough blocks have not elapsed since the last epoch");
        require(validatorsForNextEpochLocked == true, "Validators for next epoch have not been locked.  Please lock them in before advancing to the next epoch.");

        // reward the validators
        for(uint i = 0; i < validatorsInCurrentEpoch.values.length; i++){
            address validatorAddress = validatorsInCurrentEpoch.values[i];
            validators[validatorAddress].reward += tokenRewardPerTokenPerEpoch * validators[validatorAddress].balance;
        }

        // set the validators to the new validator set
        // ideally we could just do this:
        // validatorsInCurrentEpoch = validatorsInNextEpoch;
        // but solidity doesn't allow that, so we have to do it manually

        // clear out isIn for all existing validators
        for(uint i = 0; i < validatorsInCurrentEpoch.values.length; i++){
            address validatorAddress = validatorsInCurrentEpoch.values[i];
            validatorsInCurrentEpoch.isIn[validatorAddress] = false;
        }

        // copy over the values
        validatorsInCurrentEpoch.values = validatorsInNextEpoch.values;

        // copy over the indices and isIn
        for(uint i = 0; i < validatorsInCurrentEpoch.values.length; i++){
            address validatorAddress = validatorsInCurrentEpoch.values[i];
            validatorsInCurrentEpoch.indices[validatorAddress] = i;
            validatorsInCurrentEpoch.isIn[validatorAddress] = true;
        }

        epoch.number++;
        epoch.endBlock = epoch.endBlock + epoch.epochLength;
        validatorsForNextEpochLocked = false;
    }

    /// Stake and request to join the validator set
    /// @param amount The amount of tokens to stake
    /// @param ip The IP address of the node
    /// @param port The port of the node
    function stakeAndJoin(uint256 amount, uint32 ip, uint32 port, address nodeAddress) 
        public
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "Cannot stake 0");
        require(amount >= minimumStake, "Stake must be greater than or equal to minimumStake");
        require(validatorsForNextEpochLocked == false, "Validators for next epoch have already been locked");

        totalStaked = totalStaked.add(amount);

        // check if they are already signed up as validator
        // or to join the next epoch and add them if not
        if (!validatorsInNextEpoch.isIn[msg.sender]) { 
            validatorsInNextEpoch.indices[msg.sender] = validatorsInNextEpoch.values.length;
            validatorsInNextEpoch.values.push(msg.sender);
            validatorsInNextEpoch.isIn[msg.sender] = true;
        }

        validators[msg.sender].balance = validators[msg.sender].balance.add(amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        validators[msg.sender].ip = ip;
        validators[msg.sender].port = port;
        validators[msg.sender].nodeAddress = nodeAddress;
        nodeAddressToStakerAddress[nodeAddress] = msg.sender;
        emit Staked(msg.sender, amount);
    }

    /// Withdraw staked tokens.  This can only be done by users who are not active in the validator set.
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint256 amount) public nonReentrant {
        require(amount > 0, "Cannot withdraw 0");

        require(validatorsInCurrentEpoch.isIn[msg.sender] == false, "Active validators cannot leave.  Please use the leave() function and wait for the next epoch to leave");

        require(validators[msg.sender].balance >= amount, "Not enough tokens to withdraw");

        totalStaked = totalStaked.sub(amount);
        validators[msg.sender].balance = validators[msg.sender].balance.sub(amount);
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// Request to leave in the next Epoch
    function requestToLeave() public {
        require(validatorsForNextEpochLocked == false, "Validators for next epoch have already been locked");
        if (validatorsInNextEpoch.isIn[msg.sender]) { 
            // remove them
            removeFromValidatorAddressList(validatorsInNextEpoch, msg.sender);
        }
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

    /// Set the IP and port of your node
    /// @param ip The ip address of your node
    /// @param port The port of your node
    function setIpPortAndNodeAddress(uint32 ip, uint32 port) public {
        validators[msg.sender].ip = ip;
        validators[msg.sender].port = port;
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


    /* ========== Internal Utils =========== */

     function removeFromValidatorAddressList(ValidatorAddressList storage val, address toRemove) internal {
        // get the index of the thing we are removing and make sure the array contains it
        uint256 index = val.indices[toRemove];
        require(index < val.values.length);

        // move the last element to the index of the item we are removing
        val.values[index] = val.values[val.values.length-1];
        // update the index of the element we moved
        val.indices[val.values[index]] = index;
        // the last element is now at val.values[index] so we can pop it off the end
        val.values.pop();
    }

    /* ========== EVENTS ========== */

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
}



/*

What causes a DKG to be required
- validators are locked  (Epoch transition - could be more than one DKG)


Node DKG state:

Not started
Working
Pending
Advanced  (Succeeded)   ---> locked
Reverted (Failed)       ---> Poisoned >>> need to unlock.

*/