//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PubkeyRouterAndPermissions} from "./PubkeyRouterAndPermissions.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

// TODO: Set up free minting for us by letting the mint methods take a signature.  We sign the tokenId and the contract checks it

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract PKPNFT is
    ERC721("Programmable Keypair", "PKP"),
    Ownable,
    ERC721Burnable
{
    /* ========== STATE VARIABLES ========== */

    PubkeyRouterAndPermissions public router;
    uint256 public mintCost;
    uint256 public contractBalance;

    constructor() {
        mintCost = 1e14; // 0.0001 eth
    }

    /// create a valid token for a given public key.
    function mint(uint256 tokenId) public payable {
        require(router.isRouted(tokenId), "This PKP has not been routed yet");
        require(msg.value == mintCost, "You must pay exactly mint cost");

        _mint(msg.sender, tokenId);
        contractBalance += msg.value;
    }

    /// mint a PKP, grant access to a Lit Action, and then burn the PKP
    /// this happens in a single txn, so it's provable that only that lit action
    /// has ever had access to use the PKP.
    /// this is useful in the context of something like a "prime number certification lit action"
    /// where you could just trust the sig that a number is prime.
    /// without this function, a user could mint a PKP, sign a bunch of junk, and then burn the
    /// PKP to make it looks like only the Lit Action can use it.
    function mintGrantAndBurn(uint256 tokenId, bytes32 ipfsId) public {
        mint(tokenId);
        router.addPermittedAction(tokenId, ipfsId);
        burn(tokenId);
    }

    function transfer(
        address from,
        address to,
        uint256 tokenId
    ) public {
        _transfer(from, to, tokenId);
    }

    function setRouterAddress(address routerAddress) public onlyOwner {
        router = PubkeyRouterAndPermissions(routerAddress);
    }

    function setMintCost(uint256 newMintCost) public onlyOwner {
        mintCost = newMintCost;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(contractBalance);
        contractBalance = 0;
    }
}
