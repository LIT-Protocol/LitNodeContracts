//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract PubkeyRouter is Ownable {

    /* ========== STATE VARIABLES ========== */

    struct PubkeyRoutingData {
      bytes32 keyPart1; // pubkeys are larger than 32 bytes
      bytes32 keyPart2; // so we pack them into these two 32 byte chunks
      uint keyLength; // length in bytes of the key
      address stakingContract;
      uint keyType; // 1 = BLS, 2 = ECDSA.  Not doing this in an enum so we can add more keytypes in the future without redeploying.
    }

    // map the sha256(compressed pubkey) -> PubkeyRoutingData
    mapping (bytes32 => PubkeyRoutingData) public pubkeys;


    /* ========== CONSTRUCTOR ========== */
    constructor() {}

    /* ========== VIEWS ========== */

    /// get the routing data for a given key hash
    function getRoutingData(bytes32 pubkeyHash) external view returns (PubkeyRoutingData memory) {
        return pubkeys[pubkeyHash];
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// Set the pubkey and routing data for a given key hash
    function setRoutingData(bytes32 pubkeyHash, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType) public onlyOwner {
        pubkeys[pubkeyHash] = PubkeyRoutingData({
            keyPart1: keyPart1,
            keyPart2: keyPart2,
            keyLength: keyLength,
            stakingContract: stakingContract,
            keyType: keyType
        });
        emit PubkeyRoutingDataSet(pubkeyHash, keyPart1, keyPart2, keyLength, stakingContract, keyType);
    }


    /* ========== EVENTS ========== */

    event PubkeyRoutingDataSet(bytes32 indexed pubkeyHash, bytes32 keyPart1, bytes32 keyPart2, uint keyLength, address stakingContract, uint keyType);
}
