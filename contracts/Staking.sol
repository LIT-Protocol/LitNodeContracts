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
    uint256 public epoch;
    uint256 public lastEpochBlock;
    uint256 public blocksBetweenEpochs;

    uint256 public tokenRewardPerTokenPerEpoch;
    mapping(address => uint256) public rewards;

    uint256 public minimumStake;
    uint256 public totalStaked;
    mapping(address => uint256) private balances;
    address[] public joiners;
    address[] public leavers;
    address[] public validators;


    mapping(address => uint32) public ips;
    mapping(address => uint32) public ports;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _stakingToken) {
        stakingToken = IERC20(_stakingToken);
        blocksBetweenEpochs = 1;
        tokenRewardPerTokenPerEpoch = (10^ERC20(address(stakingToken)).decimals()) / 20; // 0.05 tokens per token staked meaning a 5% per epoch inflation rate
        minimumStake = 1;
    }

    /* ========== VIEWS ========== */

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function getValidators() external view returns (address[] memory) {
        return validators;
    }

    function getJoiners() external view returns (address[] memory) {
        return joiners;
    }

    function getLeavers() external view returns (address[] memory) {
        return leavers;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Advance to the next Epoch.  Rewards validators, adds the joiners, and removes the leavers
    function advanceEpoch() public {
        require(block.number > lastEpochBlock + blocksBetweenEpochs, "Enough blocks have not elapsed since the last epoch");

        // reward the validators
        for(uint i = 0; i < validators.length; i++){
            rewards[validators[i]] += tokenRewardPerTokenPerEpoch * balances[validators[i]];
        }


        // add the joiners
        for(uint i = 0; i < joiners.length; i++){
            validators.push(joiners[i]);
        }
        delete joiners;

        // remove the leavers
        bool contained;
        uint256 index;
        for(uint i = 0; i < leavers.length; i++){
            (contained, index) = arrayContains(validators, leavers[i]);
            if (contained) {
                removeFromArray(validators, index);
            }
        }
        delete leavers;

        epoch++;
        lastEpochBlock = block.number;
    }

    /// Stake and request to join the validator set
    /// @param amount The amount of tokens to stake
    /// @param ip The IP address of the node
    /// @param port The port of the node
    function stakeAndJoin(uint256 amount, uint32 ip, uint32 port)
        public
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "Cannot stake 0");
        require(amount >= minimumStake, "Stake must be greater than or equal to minimumStake");
        totalStaked = totalStaked.add(amount);

        // check if they are already a validator
        bool contained;
        uint256 index;
        (contained, index) = arrayContains(validators, msg.sender);

        if (!contained && balances[msg.sender] == 0) { 
            // add to joiners
            joiners.push(msg.sender);
        }

        balances[msg.sender] = balances[msg.sender].add(amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        ips[msg.sender] = ip;
        ports[msg.sender] = port;
        emit Staked(msg.sender, amount);
    }

    /// Withdraw staked tokens.  This can only be done by users who are not active in the validator set.
    /// @param amount The amount of tokens to withdraw
    function withdraw(uint256 amount) public nonReentrant {
        require(amount > 0, "Cannot withdraw 0");
        bool contained;
        uint256 index;
        (contained, index) = arrayContains(validators, msg.sender);
        require(contained == false, "Active validators cannot leave.  Please use the leave() function and wait for the next epoch to leave");
        totalStaked = totalStaked.sub(amount);
        balances[msg.sender] = balances[msg.sender].sub(amount);
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// Request to leave in the next Epoch
    function requestToLeave() public {
        bool contained;
        uint256 index;
        (contained, index) = arrayContains(leavers, msg.sender);
        require(contained == false, "You have already signaled that you wish to leave");

        // handle the case where the user decides to leave before they become a validator
        (contained, index) = arrayContains(joiners, msg.sender);
        if (contained) {
            removeFromArray(joiners, index);
            return;
        }

        (contained, index) = arrayContains(validators, msg.sender);
        require(contained == true, "You must be either an active validator or on the list of joiners to request to leave");

        leavers.push(msg.sender);
    }

    /// Transfer any outstanding reward tokens
    function getReward() public nonReentrant {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            stakingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /// Exit staking and get any outstanding rewards
    function exit() public {
        withdraw(balances[msg.sender]);
        getReward();
    }

    /// Set the IP and port of your node
    /// @param ip The ip address of your node
    /// @param port The port of your node
    function setIpAndPort(uint32 ip, uint32 port) public {
        ips[msg.sender] = ip;
        ports[msg.sender] = port;
    }


    function setBlocksBetweenEpochs(uint256 newBlocksBetweenEpochs) public onlyOwner {
        blocksBetweenEpochs = newBlocksBetweenEpochs;
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

    function arrayContains(address[] storage array, address toFind) internal view returns (bool, uint256) {
        for(uint i = 0; i < array.length; i++){
            if (array[i] == toFind){
                return (true, i);
            }
        }
        return (false, 0);
    }

    function removeFromArray(address[] storage array, uint index) internal {
        require(index < array.length);
        array[index] = array[array.length-1];
        array.pop();
    }

    /* ========== EVENTS ========== */

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
}
