//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// TODO: Prevent users from minting when there are no available keypairs

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
contract PKPNFT is ERC721("Programmable Keypair", "PKP"), Ownable {
  /* ========== STATE VARIABLES ========== */

    constructor() {}

    // create a valid token for a given public key.   
    function mint( bytes memory pubkey) public returns (uint256) {
          
      uint256 tokenId = uint(keccak256(abi.encodePacked(pubkey)));
      require( !_exists(tokenId), "PKP: pubkey has already been minted.");  // really just a message override.    
      _mint(msg.sender, tokenId);
      return 333;
    }
}
