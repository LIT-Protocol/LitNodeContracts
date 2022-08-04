//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Rate Limit NFT
///
/// @dev This is the contract for the Rate Limit NFTs
contract RateLimitNFT is
    ERC721("Rate Limit Increases on Lit Protocol", "RLI"),
    Ownable,
    ERC721Burnable,
    ERC721Enumerable
{
    using Strings for uint256;
    /* ========== STATE VARIABLES ========== */

    uint256 public contractBalance;
    address public freeMintSigner;
    uint256 public additionalRequestsPerMillisecondCost;
    uint256 public tokenIdCounter;
    uint256 public defaultRateLimitWindowMilliseconds = 60 * 60 * 1000; // 60 mins
    uint256 public RLIHolderRateLimitWindowMilliseconds = 5 * 60 * 1000; // 5 mins
    uint256 public freeRequestsPerRateLimitWindow = 10;

    mapping(uint256 => RateLimit) public capacity;
    mapping(bytes32 => bool) public redeemedFreeMints;

    struct RateLimit {
        uint256 requestsPerMillisecond;
        uint256 expiresAt;
    }

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        additionalRequestsPerMillisecondCost = 1; // 1 wei
    }

    /* ========== VIEWS ========== */

    /// throws if the sig is bad or msg doesn't match
    function freeMintSigTest(
        uint256 expiresAt,
        uint256 requestsPerMillisecond,
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
        bytes32 expectedHash = prefixed(
            keccak256(abi.encodePacked(expiresAt, requestsPerMillisecond))
        );
        require(
            expectedHash == msgHash,
            "The msgHash is not a hash of the expiresAt + requestsPerMillisecond.  Explain yourself!"
        );

        // make sure it was actually signed by freeMintSigner
        address recovered = ecrecover(msgHash, v, r, s);
        require(
            recovered == freeMintSigner,
            "This freeMint was not signed by freeMintSigner.  How embarassing."
        );

        // make sure it hasn't already been redeemed
        require(
            !redeemedFreeMints[msgHash],
            "This freeMint has already been redeemed.  How embarassing."
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

    function calculateCost(uint256 requestsPerMillisecond, uint256 expiresAt)
        public
        view
        returns (uint256)
    {
        require(
            expiresAt > block.timestamp,
            "The expiresAt must be in the future"
        );

        // calculate the duration
        uint256 durationInMilliseconds = (expiresAt - block.timestamp) * 1000;

        // calculate the cost
        uint256 cost = requestsPerMillisecond *
            durationInMilliseconds *
            additionalRequestsPerMillisecondCost;

        return cost;
    }

    function calculateRequestsPerSecond(uint256 payingAmount, uint256 expiresAt)
        public
        view
        returns (uint256)
    {
        require(
            expiresAt > block.timestamp,
            "The expiresAt must be in the future"
        );

        // calculate the duration
        uint256 durationInMilliseconds = (expiresAt - block.timestamp) * 1000;

        // calculate the cost
        uint256 requestsPerSecond = payingAmount /
            (durationInMilliseconds * additionalRequestsPerMillisecondCost);

        return requestsPerSecond;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        string
            memory svgData = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' xmlns:v='https://vecta.io/nano'><path d='M50.6 73.3c-17.7-.1-19-16.6-17.5-20.4 0 0 1.1 8.8 11.1 6.6 9.9-2.2 4.9-17.1 4.7-17.6.1.1 1.9 1.8 3.4 4.1 1.6 2.4 2 6.4 1.5 10-.5 3.5-.2 8.4 6.2 6.6 7.9-2.2 7.2-14.6 7.2-14.6 3.6 4.1 3.9 25.4-16.6 25.3z' fill='#fed428'/><path d='M64.1 38.6c-.4 2.9.6 8.5.2 12-.3 2.9-1.8 5.1-3.1 5.7-1.2.6-2 .2-2-.8-.1-1.1.7-3 .6-4.6-.1-2-1.3-4.3-1.3-4.3l.7-1.3.6.9a25.93 25.93 0 0 1 .8 1.3s1.2-7.4 3.3-11.6c1.5-3 5.2-4.2 5.4-4.3-2.9 1.7-4.7 3.4-5.2 7z' fill='#c60404'/><path d='M62 37.6l-1.3 4.2c-.6 1.8-1.5 3.6-1.5 3.6l-.7 1.3s-1-2-2.1-3.5l-2.3-3.1s.2-.6.4-1.6l.9.7s.6-2.1.7-5.2c.1-2.6-.7-5.6-.7-5.6 1 .8 2.6 2.3 3.7 3.8 1.4 1.7 2.9 5.4 2.9 5.4z' fill='#a70c0c'/><path d='M44.3 50c-.1.2-3 4.8-7.4 2.2-.8-.5-1.4-1-1.8-1.7-2.6-4 .7-10.8.8-11.2v.1.1.1c-.3 1.7-1.3 8.6 1.3 10.5.1.1.2.1.3.2.2.1.3.2.5.3 2.4 1.1 4.3.5 5.4 0 .1 0 .1-.1.2-.1.4-.3.6-.5.7-.5z' fill='#a40a0a'/><path d='M56.2 34c-.1 3.1-.7 5.2-.7 5.2l-.9-.7c.3-1.1.6-2.7.7-4.2.3-3.3-.7-6.5-.7-6.5s.3.3.8.7c.1 0 .9 2.9.8 5.5zM44.3 50c-.1 0-.3.2-.7.5-.1 0-.1.1-.2.1-1.1.5-3 1.1-5.4 0-.2-.1-.3-.2-.5-.3-.1-.1-.2-.1-.3-.2-2.6-1.9-1.6-8.9-1.3-10.5-.1 1.2-.5 5.5 1.3 8.3 2 3.2 7.1 2.1 7.1 2.1zm27-4.5c-2.4-4.9-2.4-8.7-2.4-10.5 0-1.9 1.3-3.4 1.3-3.4s-.4 0-.9.1c-1.1.3-3.3.8-4.3 1.7-2.3 2-2.9 4.2-2.9 4.2s-.7 2.4-1.3 4.2-1.5 3.6-1.5 3.6l.6.9a25.93 25.93 0 0 1 .8 1.3S61.9 40.2 64 36c1.5-3 5.2-4.2 5.4-4.3-3 1.5-4.8 3.2-5.2 6.9-.4 2.9.6 8.5.2 12-.3 2.9-1.8 5.1-3.1 5.7-1.2.6-2 .2-2-.8-.1-1.1.7-3 .6-4.6-.1-2-1.3-4.3-1.3-4.3s-1-2-2.1-3.5L54.2 40s-4-3.9-3.2-9.8c.6-5 4.8-8.1 5-8.3-.4.1-6 1.3-9.4 6.3-2.8 4.1-3.2 8.3-1.8 13.9 1.2 5-.4 7.8-.4 7.8-.1.2-3 4.8-7.4 2.2-.8-.5-1.4-1-1.8-1.7-2.6-4 .7-10.8.8-11.2 0 0-9.3 7.1-9.3 16.4 0 9.8 7.8 22.4 23.4 22.4 18 0 23.2-15.3 23.5-20 .3-4 .2-7.5-2.3-12.5zM50.6 73.3c-17.7-.1-19-16.6-17.5-20.4 0 0 1.1 8.8 11.1 6.6 9.9-2.2 4.9-17.1 4.7-17.6.1.1 1.9 1.8 3.4 4.1 1.6 2.4 2 6.4 1.5 10-.5 3.5-.2 8.4 6.2 6.6 7.9-2.2 7.2-14.6 7.2-14.6 3.6 4.1 3.9 25.4-16.6 25.3z' fill='#f12d2d'/></svg>";

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Lit Protocol Rate Limit Increase", "description": "This NFT entitles the holder to a rate limit increase on the Lit Protocol Network", "image_data": "',
                        bytes(svgData),
                        '","attributes": [{"display_type": "date", "trait_type": "Expiration Date", "value": ',
                        capacity[tokenId].expiresAt.toString(),
                        '}, {"display_type": "number", "trait_type": "Requests Per Millisecond", "value": ',
                        capacity[tokenId].requestsPerMillisecond.toString(),
                        "}]}"
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function isExpired(uint256 tokenId) public view returns (bool) {
        return capacity[tokenId].expiresAt <= block.timestamp;
    }

    // Builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /// mint a token with a certain number of requests per millisecond and a certain expiration time.  Requests per second is calculated from the msg.value amount.  You can find out the cost for a certain requests per second value by using the calculateCost() function.
    function mint(uint256 expiresAt) public payable {
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        uint256 requestsPerMillisecond = calculateRequestsPerSecond(
            msg.value,
            expiresAt
        );

        // sanity check
        uint256 cost = calculateCost(requestsPerMillisecond, expiresAt);
        require(
            msg.value > 0 && msg.value >= cost,
            "You must send the cost of this rate limit increase.  To check the cost, use the calculateCost function."
        );

        _mintWithoutValueCheck(tokenId, requestsPerMillisecond, expiresAt);
        contractBalance += msg.value;
    }

    function freeMint(
        uint256 expiresAt,
        uint256 requestsPerMillisecond,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        // this will panic if the sig is bad
        freeMintSigTest(expiresAt, requestsPerMillisecond, msgHash, v, r, s);
        redeemedFreeMints[msgHash] = true;

        _mintWithoutValueCheck(tokenId, requestsPerMillisecond, expiresAt);
    }

    function _mintWithoutValueCheck(
        uint256 tokenId,
        uint256 requestsPerMillisecond,
        uint256 expiresAt
    ) internal {
        _safeMint(msg.sender, tokenId);
        capacity[tokenId] = RateLimit(requestsPerMillisecond, expiresAt);
    }

    function transfer(
        address from,
        address to,
        uint256 tokenId
    ) public {
        _safeTransfer(from, to, tokenId, "");
    }

    function setAdditionalRequestsPerSecondCost(
        uint256 newAdditionalRequestsPerMillisecondCost
    ) public onlyOwner {
        additionalRequestsPerMillisecondCost = newAdditionalRequestsPerMillisecondCost;
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(contractBalance);
        contractBalance = 0;
    }

    function setRateLimitWindowMilliseconds(
        uint256 newRateLimitWindowMilliseconds
    ) public onlyOwner {
        defaultRateLimitWindowMilliseconds = newRateLimitWindowMilliseconds;
    }

    function setRLIHolderRateLimitWindowMilliseconds(
        uint256 newRLIHolderRateLimitWindowMilliseconds
    ) public onlyOwner {
        RLIHolderRateLimitWindowMilliseconds = newRLIHolderRateLimitWindowMilliseconds;
    }

    function setFreeRequestsPerRateLimitWindow(
        uint256 newFreeRequestsPerRateLimitWindow
    ) public onlyOwner {
        freeRequestsPerRateLimitWindow = newFreeRequestsPerRateLimitWindow;
    }
}
