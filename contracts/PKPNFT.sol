//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PubkeyRouterAndPermissions} from "./PubkeyRouterAndPermissions.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

// TODO: Set up free minting for us by letting the mint methods take a signature.  We sign the tokenId and the contract checks it
// TODO: tests for the mintGrantAndBurn function, withdraw function, some of the setters, transfer function, freeMint and freeMintGrantAndBurn

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
    address public freeMintSigner;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        mintCost = 1e14; // 0.0001 eth
    }

    /* ========== VIEWS ========== */

    /// throws if the sig is bad or msg doesn't match
    function freeMintSigTest(
        uint256 tokenId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view {
        // make sure the msgHash matches the tokenId
        // if these don't match, the user could use any old signature
        // to mint any number of PKPs
        // and this would be vulnerable to replay attacks
        // FIXME this needs the whole "ethereum signed message: \27" thingy prepended to actually work
        bytes32 expectedHash = keccak256(abi.encodePacked(tokenId));
        require(
            expectedHash == msgHash,
            "The msgHash is not a hash of the tokenId.  Explain yourself!"
        );

        // make sure it was actually signed by freeMintSigner
        address recovered = ecrecover(msgHash, v, r, s);
        require(
            recovered == freeMintSigner,
            "This freeMint was not signed by freeMintSigner.  How embarassing."
        );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// create a valid token for a given public key.
    function mint(uint256 tokenId) public payable {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        _mintWithoutValueCheck(tokenId);
    }

    /// mint a PKP, grant access to a Lit Action, and then burn the PKP
    /// this happens in a single txn, so it's provable that only that lit action
    /// has ever had access to use the PKP.
    /// this is useful in the context of something like a "prime number certification lit action"
    /// where you could just trust the sig that a number is prime.
    /// without this function, a user could mint a PKP, sign a bunch of junk, and then burn the
    /// PKP to make it looks like only the Lit Action can use it.
    function mintGrantAndBurn(uint256 tokenId, bytes32 ipfsId) public payable {
        mint(tokenId);
        router.addPermittedAction(tokenId, ipfsId);
        burn(tokenId);
    }

    function freeMint(
        uint256 tokenId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        // this will panic if the sig is bad
        freeMintSigTest(tokenId, msgHash, v, r, s);
        _mintWithoutValueCheck(tokenId);
    }

    function freeMintGrantAndBurn(
        uint256 tokenId,
        bytes32 ipfsId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        freeMint(tokenId, msgHash, v, r, s);
        router.addPermittedAction(tokenId, ipfsId);
        burn(tokenId);
    }

    function _mintWithoutValueCheck(uint256 tokenId) internal {
        require(router.isRouted(tokenId), "This PKP has not been routed yet");

        _safeMint(msg.sender, tokenId);
        contractBalance += msg.value;
    }

    function transfer(
        address from,
        address to,
        uint256 tokenId
    ) public {
        _safeTransfer(from, to, tokenId, "");
    }

    function setRouterAddress(address routerAddress) public onlyOwner {
        router = PubkeyRouterAndPermissions(routerAddress);
    }

    function setMintCost(uint256 newMintCost) public onlyOwner {
        mintCost = newMintCost;
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(contractBalance);
        contractBalance = 0;
    }
}
