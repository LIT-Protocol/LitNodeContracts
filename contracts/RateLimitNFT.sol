//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ERC721Burnable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import "hardhat/console.sol";

/// @title Rate Limit NFT
///
/// @dev This is the contract for the Rate Limit NFTs
/// So the general idea here is that you can mint one of these NFTs to pay for service on Lit
/// And how it works, is that you can buy X requestsPerKilosecond over a period of time
/// 1 requestsPerKilosecond = 0.001 requests per second and
/// 1000 requestsPerKilosecond = 1 request per second
contract RateLimitNFT is
    ERC721("Rate Limit Increases on Lit Protocol", "RLI"),
    Ownable,
    ERC721Burnable,
    ERC721Enumerable,
    ReentrancyGuard
{
    using Strings for uint256;
    /* ========== STATE VARIABLES ========== */

    address public freeMintSigner;
    uint256 public additionalRequestsPerKilosecondCost;
    uint256 public tokenIdCounter;
    uint256 public defaultRateLimitWindowSeconds = 60 * 60; // 60 mins
    uint256 public RLIHolderRateLimitWindowSeconds = 5 * 60; // 5 mins
    uint256 public freeRequestsPerRateLimitWindow = 10;

    mapping(uint256 => RateLimit) public capacity;
    mapping(bytes32 => bool) public redeemedFreeMints;

    struct RateLimit {
        uint256 requestsPerKilosecond;
        uint256 expiresAt;
    }

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        additionalRequestsPerKilosecondCost = 1000000; // 1,000,000 wei
    }

    /* ========== VIEWS ========== */

    /// throws if the sig is bad or msg doesn't match
    function freeMintSigTest(
        uint256 expiresAt,
        uint256 requestsPerKilosecond,
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
            keccak256(abi.encodePacked(expiresAt, requestsPerKilosecond))
        );
        require(
            expectedHash == msgHash,
            "The msgHash is not a hash of the expiresAt + requestsPerKilosecond.  Explain yourself!"
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

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721, ERC721Enumerable) returns (bool) {
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

    function calculateCost(
        uint256 requestsPerKilosecond,
        uint256 expiresAt
    ) public view returns (uint256) {
        require(
            expiresAt > block.timestamp,
            "The expiresAt must be in the future"
        );
        require(
            requestsPerKilosecond > 0,
            "The requestsPerKilosecond must be greater than 0"
        );

        // calculate the duration
        uint256 durationInSeconds = (expiresAt - block.timestamp);

        // calculate the cost
        uint256 cost = (requestsPerKilosecond *
            durationInSeconds *
            additionalRequestsPerKilosecondCost) / 1000; // because we used durationInSeconds instead of in Kiloseconds, we need to divide by 1000 at the end to convert back to kiloseconds.  This is safe as long as additionalRequestsPerKilosecondCost is greater than 1000

        return cost;
    }

    function calculateRequestsPerKilosecond(
        uint256 payingAmount,
        uint256 expiresAt
    ) public view returns (uint256) {
        require(
            expiresAt > block.timestamp,
            "The expiresAt must be in the future"
        );

        // calculate the duration
        uint256 durationInSeconds = (expiresAt - block.timestamp);
        // console.log("durationInSeconds: ");
        // console.log(durationInSeconds);

        // calculate the cost
        uint256 requestsPerKilosecond = payingAmount /
            ((durationInSeconds * additionalRequestsPerKilosecondCost) / 1000); // because we used durationInSeconds instead of in Kiloseconds, we need to divide by 1000 at the end to convert back to kiloseconds.  This is safe as long as additionalRequestsPerKilosecondCost is greater than 1000

        return requestsPerKilosecond;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        string
            memory svgData = "<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1080' fill='none' xmlns:v='https://vecta.io/nano'><path d='M363.076 392.227s-.977 18.524-36.874 78.947c-41.576 70.018-45.481 151.978-3.017 220.4 89.521 144.245 332.481 141.52 422.556.089 34.832-54.707 44.816-117.479 32.924-181.248 0 0-28.819-133.144-127.237-217.099 1.553 1.308 5.369 19.122 6.101 26.722 2.241 23.354.045 47.838-7.787 70.062-5.746 16.33-13.711 30.467-27.178 41.368 0-3.811-.954-10.635-.976-12.918-.644-46.508-18.659-89.582-48.011-125.743-25.647-31.552-60.812-53.089-97.84-68.932.931 3.191 2.662 16.419 2.906 19.033 1.908 21.958 2.263 52.713-.621 74.649s-7.832 33.878-14.554 54.441c-10.184 31.175-24.05 54.285-41.621 82.004-3.24 5.096-12.913 19.078-18.082 26.146 0 0-8.897-56.191-40.667-87.921h-.022z' fill='#000'/><path d='M562.5 27.28l410.279 236.874c13.923 8.039 22.5 22.895 22.5 38.971v473.75c0 16.076-8.577 30.932-22.5 38.971L562.5 1052.72c-13.923 8.04-31.077 8.04-45 0L107.221 815.846c-13.923-8.039-22.5-22.895-22.5-38.971v-473.75a45 45 0 0 1 22.5-38.971L517.5 27.28a45 45 0 0 1 45 0z' stroke='#000' stroke-width='24.75'/></svg>";

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Lit Protocol Rate Limit Increase", "description": "This NFT entitles the holder to a rate limit increase on the Lit Protocol Network", "image_data": "',
                        bytes(svgData),
                        '","attributes": [{"display_type": "date", "trait_type": "Expiration Date", "value": ',
                        capacity[tokenId].expiresAt.toString(),
                        '}, {"display_type": "number", "trait_type": "Millirequests Per Second", "value": ',
                        capacity[tokenId].requestsPerKilosecond.toString(),
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
    function mint(uint256 expiresAt) public payable returns (uint256) {
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        uint256 requestsPerKilosecond = calculateRequestsPerKilosecond(
            msg.value,
            expiresAt
        );

        // sanity check
        uint256 cost = calculateCost(requestsPerKilosecond, expiresAt);

        require(
            msg.value > 0 && msg.value >= cost,
            "You must send the cost of this rate limit increase.  To check the cost, use the calculateCost function."
        );
        require(cost > 0, "The cost must be greater than 0");

        _mintWithoutValueCheck(tokenId, requestsPerKilosecond, expiresAt);

        return tokenId;
    }

    function freeMint(
        uint256 expiresAt,
        uint256 requestsPerKilosecond,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint256) {
        tokenIdCounter++;
        uint256 tokenId = tokenIdCounter;

        // this will panic if the sig is bad
        freeMintSigTest(expiresAt, requestsPerKilosecond, msgHash, v, r, s);
        redeemedFreeMints[msgHash] = true;

        _mintWithoutValueCheck(tokenId, requestsPerKilosecond, expiresAt);

        return tokenId;
    }

    function _mintWithoutValueCheck(
        uint256 tokenId,
        uint256 requestsPerKilosecond,
        uint256 expiresAt
    ) internal {
        _safeMint(msg.sender, tokenId);
        capacity[tokenId] = RateLimit(requestsPerKilosecond, expiresAt);
    }

    function setAdditionalRequestsPerKilosecondCost(
        uint256 newAdditionalRequestsPerKilosecondCost
    ) public onlyOwner {
        additionalRequestsPerKilosecondCost = newAdditionalRequestsPerKilosecondCost;
        emit AdditionalRequestsPerKilosecondCostSet(
            newAdditionalRequestsPerKilosecondCost
        );
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
        emit FreeMintSignerSet(newFreeMintSigner);
    }

    function withdraw() public onlyOwner nonReentrant {
        uint256 withdrawAmount = address(this).balance;
        (bool sent, ) = payable(msg.sender).call{ value: withdrawAmount }("");
        require(sent);
        emit Withdrew(withdrawAmount);
    }

    function setRateLimitWindowSeconds(
        uint256 newRateLimitWindowSeconds
    ) public onlyOwner {
        defaultRateLimitWindowSeconds = newRateLimitWindowSeconds;
        emit RateLimitWindowSecondsSet(newRateLimitWindowSeconds);
    }

    function setRLIHolderRateLimitWindowSeconds(
        uint256 newRLIHolderRateLimitWindowSeconds
    ) public onlyOwner {
        RLIHolderRateLimitWindowSeconds = newRLIHolderRateLimitWindowSeconds;
        emit RLIHolderRateLimitWindowSecondsSet(
            newRLIHolderRateLimitWindowSeconds
        );
    }

    function setFreeRequestsPerRateLimitWindow(
        uint256 newFreeRequestsPerRateLimitWindow
    ) public onlyOwner {
        freeRequestsPerRateLimitWindow = newFreeRequestsPerRateLimitWindow;
        emit FreeRequestsPerRateLimitWindowSet(
            newFreeRequestsPerRateLimitWindow
        );
    }

    /* ========== EVENTS ========== */

    event AdditionalRequestsPerKilosecondCostSet(
        uint256 newAdditionalRequestsPerKilosecondCost
    );
    event FreeMintSignerSet(address indexed newFreeMintSigner);
    event Withdrew(uint256 amount);
    event RateLimitWindowSecondsSet(uint256 newRateLimitWindowSeconds);
    event RLIHolderRateLimitWindowSecondsSet(
        uint256 newRLIHolderRateLimitWindowSeconds
    );
    event FreeRequestsPerRateLimitWindowSet(
        uint256 newFreeRequestsPerRateLimitWindow
    );
}
