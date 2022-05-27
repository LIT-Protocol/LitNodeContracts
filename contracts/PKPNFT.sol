//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
contract PKPNFT is ERC721("Programmable Keypair", "PKP"), Ownable {
  /* ========== STATE VARIABLES ========== */
    uint currentTokenId = 0;

    constructor() {}

    function mint() public returns (uint256) {
      // currentTokenId starts at 0 but we
      // want the first actual token to be 1
      currentTokenId++;
      _mint(msg.sender, currentTokenId);
      return currentTokenId;
    }
}
