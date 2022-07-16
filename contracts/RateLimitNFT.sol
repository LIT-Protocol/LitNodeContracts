//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PubkeyRouterAndPermissions} from "./PubkeyRouterAndPermissions.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

// TODO: Set up free minting for us by letting the mint methods take a signature.  We sign the tokenId and the contract checks it
// TODO: tests for the mintGrantAndBurn function, withdraw function, some of the setters, transfer function, freeMint and freeMintGrantAndBurn

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract RateLimitNFT is
    ERC721("Rate Limit Increases on Lit Protocol", "RLI"),
    Ownable,
    ERC721Burnable,
    ERC721Enumerable
{
    /* ========== STATE VARIABLES ========== */

    uint256 public contractBalance;
    address public freeMintSigner;
    uint256 public additionalRequestSecondCost;
    uint256 public tokenIdCounter;

    mapping(uint256 => RateLimit) public capacity;

    struct RateLimit {
        uint256 requestsPerWindow;
        uint256 expiresAt;
    }

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        additionalRequestSecondCost = 1e14; // 0.0001 eth
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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Enumerable).interfaceId ||
            interfaceId == type(IERC721Metadata).interfaceId ||
            interfaceId == type(IERC721).interfaceId;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721Enumerable) {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function calculateCost(uint256 requestsPerWindow, uint256 expiresAt)
        public
        view
        returns (uint256)
    {
        // calculate the duration
        uint256 duration = expiresAt - block.timestamp;

        // calculate the cost
        uint256 cost = requestsPerWindow *
            duration *
            additionalRequestSecondCost;

        return cost;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// mint a token with a certain number of requests per window and a certain expiration time
    function mint(uint256 requestsPerWindow, uint256 expiresAt) public payable {
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        uint256 cost = calculateCost(requestsPerWindow, expiresAt);

        require(
            msg.value >= cost,
            "You must pay the exact cost of this rate limit increase.  To check the cost, use the calculateCost function."
        );

        _mintWithoutValueCheck(tokenId);
    }

    // function freeMint(
    //     uint256 tokenId,
    //     bytes32 msgHash,
    //     uint8 v,
    //     bytes32 r,
    //     bytes32 s
    // ) public {
    //     // this will panic if the sig is bad
    //     freeMintSigTest(tokenId, msgHash, v, r, s);
    //     _mintWithoutValueCheck(tokenId);
    // }

    function _mintWithoutValueCheck(uint256 tokenId) internal {
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

    function setAdditionalRequestSecondCost(
        uint256 newAdditionalRequestSecondCostt
    ) public onlyOwner {
        additionalRequestSecondCost = newAdditionalRequestSecondCostt;
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(contractBalance);
        contractBalance = 0;
    }
}
