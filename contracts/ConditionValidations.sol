//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "hardhat/console.sol";

/// @title Lit Protocol Validation Record
///
/// @dev This is the contract for recording cross chain validations.
///
/// Briefly, this contract is used to record the validation of a transaction

/*
Todos
- conditions are mutative by nature, and only exist at a point in time.   So do we need to be able to update them, or just keep a point in time record?
    - if we keep a running history, AND we want to be able to reference them by condition hash, we may end up with an array of arrays ... or other more complex structure.
    - alternatively, we could just map the most recent condition, storing historical conditions in a seperate structure (ie, move them -> however this risks significant gaps, based on updates.   
    It's also identical tot he "emit", but with no guarantees of emitted data being complete.)
- need to be able to update public keys / owners; currently this is a single owner contract, and we can't update the owner. 
*/

contract ConditionValidations is ReentrancyGuard {
    /* ========== STRUCTS ========== */
    struct ValidatedCondition {
        uint256 chainId;
        uint256 timestamp;
        address creator;
    }

    /* ========== STATE VARIABLES ========== */
    mapping(bytes32 => ValidatedCondition) public validatedConditions;
    address private _owner;

    /* ========== CONSTRUCTOR ========== */

    // constructor(bytes memory _publicKey) {
    //      require(_publicKey.length == 64);
    //     _owner = address(bytes20(uint160(uint256(keccak256(_publicKey)))));
    // }

    constructor(address _ownerAddress) {
        _owner = _ownerAddress;
    }

    /* ========== VIEWS ========== */

    function getOwnerAddress() public view returns (address) {
        return _owner;
    }

    function getValidatedCondition(bytes32 conditionHashKey)
        external
        view
        returns (ValidatedCondition memory)
    {
        // check if key exists in validatedConditions
        if (validatedConditions[conditionHashKey].timestamp != 0) {
            return validatedConditions[conditionHashKey];
        } else {
            return ValidatedCondition(0, 0, address(0));
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function storeValidatedCondition(
        uint256 chainId,
        bytes32 conditionHash,
        bytes memory signature
    ) external nonReentrant {
        // check if the signature is valid
        require(
            ECDSA.recover(conditionHash, signature) == _owner,
            "Signature doesn't match the LIT key for the given hashed condition"
        );

        validatedConditions[conditionHash] = ValidatedCondition(
            chainId,
            block.timestamp,
            msg.sender
        );
        emit ValidationStored(
            conditionHash,
            chainId,
            block.timestamp,
            msg.sender
        );
    }

    /* ========== EVENTS ========== */

    event ValidationStored(
        bytes32 indexed conditionHash,
        uint256 chainId,
        uint256 timestamp,
        address creator
    );
}
