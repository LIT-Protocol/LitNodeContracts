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
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

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
    ERC721Burnable,
    ERC721Enumerable
{
    using Strings for uint;
    /* ========== STATE VARIABLES ========== */

    PubkeyRouterAndPermissions public router;
    uint public mintCost;
    uint public contractBalance;
    address public freeMintSigner;

    // maps keytype to array of unminted routed token ids
    mapping(uint => uint[]) public unmintedRoutedTokenIds;

    mapping(uint => bool) public redeemedFreeMintIds;

    /* ========== CONSTRUCTOR ========== */
    constructor() {
        mintCost = 1e14; // 0.0001 eth
        freeMintSigner = msg.sender;
    }

    /* ========== VIEWS ========== */

    /// throws if the sig is bad or msg doesn't match
    function freeMintSigTest(
        uint freeMintId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view {
        bytes32 expectedHash = prefixed(
            keccak256(abi.encodePacked(address(this), freeMintId))
        );
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

        // prevent reuse
        require(
            redeemedFreeMintIds[freeMintId] == false,
            "This free mint ID has already been redeemed"
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
        uint tokenId
    ) internal virtual override(ERC721, ERC721Enumerable) {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function tokenURI(uint tokenId)
        public
        view
        override
        returns (string memory)
    {
        string
            memory svgData = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' xmlns:v='https://vecta.io/nano'><path d='M50.6 73.3c-17.7-.1-19-16.6-17.5-20.4 0 0 1.1 8.8 11.1 6.6 9.9-2.2 4.9-17.1 4.7-17.6.1.1 1.9 1.8 3.4 4.1 1.6 2.4 2 6.4 1.5 10-.5 3.5-.2 8.4 6.2 6.6 7.9-2.2 7.2-14.6 7.2-14.6 3.6 4.1 3.9 25.4-16.6 25.3z' fill='#fed428'/><path d='M64.1 38.6c-.4 2.9.6 8.5.2 12-.3 2.9-1.8 5.1-3.1 5.7-1.2.6-2 .2-2-.8-.1-1.1.7-3 .6-4.6-.1-2-1.3-4.3-1.3-4.3l.7-1.3.6.9a25.93 25.93 0 0 1 .8 1.3s1.2-7.4 3.3-11.6c1.5-3 5.2-4.2 5.4-4.3-2.9 1.7-4.7 3.4-5.2 7z' fill='#c60404'/><path d='M62 37.6l-1.3 4.2c-.6 1.8-1.5 3.6-1.5 3.6l-.7 1.3s-1-2-2.1-3.5l-2.3-3.1s.2-.6.4-1.6l.9.7s.6-2.1.7-5.2c.1-2.6-.7-5.6-.7-5.6 1 .8 2.6 2.3 3.7 3.8 1.4 1.7 2.9 5.4 2.9 5.4z' fill='#a70c0c'/><path d='M44.3 50c-.1.2-3 4.8-7.4 2.2-.8-.5-1.4-1-1.8-1.7-2.6-4 .7-10.8.8-11.2v.1.1.1c-.3 1.7-1.3 8.6 1.3 10.5.1.1.2.1.3.2.2.1.3.2.5.3 2.4 1.1 4.3.5 5.4 0 .1 0 .1-.1.2-.1.4-.3.6-.5.7-.5z' fill='#a40a0a'/><path d='M56.2 34c-.1 3.1-.7 5.2-.7 5.2l-.9-.7c.3-1.1.6-2.7.7-4.2.3-3.3-.7-6.5-.7-6.5s.3.3.8.7c.1 0 .9 2.9.8 5.5zM44.3 50c-.1 0-.3.2-.7.5-.1 0-.1.1-.2.1-1.1.5-3 1.1-5.4 0-.2-.1-.3-.2-.5-.3-.1-.1-.2-.1-.3-.2-2.6-1.9-1.6-8.9-1.3-10.5-.1 1.2-.5 5.5 1.3 8.3 2 3.2 7.1 2.1 7.1 2.1zm27-4.5c-2.4-4.9-2.4-8.7-2.4-10.5 0-1.9 1.3-3.4 1.3-3.4s-.4 0-.9.1c-1.1.3-3.3.8-4.3 1.7-2.3 2-2.9 4.2-2.9 4.2s-.7 2.4-1.3 4.2-1.5 3.6-1.5 3.6l.6.9a25.93 25.93 0 0 1 .8 1.3S61.9 40.2 64 36c1.5-3 5.2-4.2 5.4-4.3-3 1.5-4.8 3.2-5.2 6.9-.4 2.9.6 8.5.2 12-.3 2.9-1.8 5.1-3.1 5.7-1.2.6-2 .2-2-.8-.1-1.1.7-3 .6-4.6-.1-2-1.3-4.3-1.3-4.3s-1-2-2.1-3.5L54.2 40s-4-3.9-3.2-9.8c.6-5 4.8-8.1 5-8.3-.4.1-6 1.3-9.4 6.3-2.8 4.1-3.2 8.3-1.8 13.9 1.2 5-.4 7.8-.4 7.8-.1.2-3 4.8-7.4 2.2-.8-.5-1.4-1-1.8-1.7-2.6-4 .7-10.8.8-11.2 0 0-9.3 7.1-9.3 16.4 0 9.8 7.8 22.4 23.4 22.4 18 0 23.2-15.3 23.5-20 .3-4 .2-7.5-2.3-12.5zM50.6 73.3c-17.7-.1-19-16.6-17.5-20.4 0 0 1.1 8.8 11.1 6.6 9.9-2.2 4.9-17.1 4.7-17.6.1.1 1.9 1.8 3.4 4.1 1.6 2.4 2 6.4 1.5 10-.5 3.5-.2 8.4 6.2 6.6 7.9-2.2 7.2-14.6 7.2-14.6 3.6 4.1 3.9 25.4-16.6 25.3z' fill='#f12d2d'/></svg>";

        bytes memory pubKey = router.getPubkey(tokenId);
        address ethAddress = router.getEthAddress(tokenId);

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Lit Protocol Programmable Key Pair", "description": "This NFT entitles the holder to use a Lit Protocol PKP, and to grant access to other users and Lit Actions to use this PKP", "image_data": "',
                        bytes(svgData),
                        '","attributes": [{"trait_type": "Public Key", "value": ',
                        string(pubKey),
                        '}, {"trait_type": "ETH Wallet Address", "value": ',
                        ethAddress,
                        "}]}"
                    )
                )
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function getUnmintedRoutedTokenIdCount(uint keyType)
        public
        view
        returns (uint)
    {
        return unmintedRoutedTokenIds[keyType].length;
    }

    // Builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mintNext(uint keyType) public payable returns (uint) {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        uint tokenId = _getNextTokenIdToMint(keyType);
        _mintWithoutValueCheck(tokenId, msg.sender);
        return tokenId;
    }

    function mintGrantAndBurnNext(uint keyType, bytes memory ipfsCID)
        public
        payable
        returns (uint)
    {
        require(msg.value == mintCost, "You must pay exactly mint cost");
        uint tokenId = _getNextTokenIdToMint(keyType);
        _mintWithoutValueCheck(tokenId, address(this));
        router.addPermittedAction(tokenId, ipfsCID);
        _burn(tokenId);
        return tokenId;
    }

    function freeMintNext(
        uint keyType,
        uint freeMintId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint) {
        uint tokenId = _getNextTokenIdToMint(keyType);
        freeMint(freeMintId, tokenId, msgHash, v, r, s);
        return tokenId;
    }

    function freeMintGrantAndBurnNext(
        uint keyType,
        uint freeMintId,
        bytes memory ipfsCID,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (uint) {
        uint tokenId = _getNextTokenIdToMint(keyType);
        freeMintGrantAndBurn(freeMintId, tokenId, ipfsCID, msgHash, v, r, s);
        return tokenId;
    }

    /// create a valid token for a given public key.
    function mintSpecific(uint tokenId) public onlyOwner {
        _mintWithoutValueCheck(tokenId, msg.sender);
    }

    /// mint a PKP, grant access to a Lit Action, and then burn the PKP
    /// this happens in a single txn, so it's provable that only that lit action
    /// has ever had access to use the PKP.
    /// this is useful in the context of something like a "prime number certification lit action"
    /// where you could just trust the sig that a number is prime.
    /// without this function, a user could mint a PKP, sign a bunch of junk, and then burn the
    /// PKP to make it looks like only the Lit Action can use it.
    function mintGrantAndBurnSpecific(uint tokenId, bytes memory ipfsCID)
        public
        onlyOwner
    {
        _mintWithoutValueCheck(tokenId, address(this));
        router.addPermittedAction(tokenId, ipfsCID);
        _burn(tokenId);
    }

    function freeMint(
        uint freeMintId,
        uint tokenId,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        _mintWithoutValueCheck(tokenId, msg.sender);
        redeemedFreeMintIds[freeMintId] = true;
    }

    function freeMintGrantAndBurn(
        uint freeMintId,
        uint tokenId,
        bytes memory ipfsCID,
        bytes32 msgHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // this will panic if the sig is bad
        freeMintSigTest(freeMintId, msgHash, v, r, s);
        _mintWithoutValueCheck(tokenId, address(this));
        redeemedFreeMintIds[freeMintId] = true;
        router.addPermittedAction(tokenId, ipfsCID);
        _burn(tokenId);
    }

    function _mintWithoutValueCheck(uint tokenId, address to) internal {
        require(router.isRouted(tokenId), "This PKP has not been routed yet");

        if (to == address(this)) {
            // permit unsafe transfer only to this contract, because it's going to be burned
            _mint(to, tokenId);
        } else {
            _safeMint(to, tokenId);
        }

        contractBalance += msg.value;
    }

    /// Take a tokenId off the stack
    function _getNextTokenIdToMint(uint keyType) internal returns (uint) {
        require(
            unmintedRoutedTokenIds[keyType].length > 0,
            "There are no unminted routed token ids to mint"
        );
        uint tokenId = unmintedRoutedTokenIds[keyType][
            unmintedRoutedTokenIds[keyType].length - 1
        ];

        unmintedRoutedTokenIds[keyType].pop();

        return tokenId;
    }

    function setRouterAddress(address routerAddress) public onlyOwner {
        router = PubkeyRouterAndPermissions(routerAddress);
    }

    function setMintCost(uint newMintCost) public onlyOwner {
        mintCost = newMintCost;
    }

    function setFreeMintSigner(address newFreeMintSigner) public onlyOwner {
        freeMintSigner = newFreeMintSigner;
    }

    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(contractBalance);
        contractBalance = 0;
    }

    /// Push a tokenId onto the stack
    function pkpRouted(uint tokenId, uint keyType) public {
        require(
            msg.sender == address(router),
            "Only the routing contract can call this function"
        );
        unmintedRoutedTokenIds[keyType].push(tokenId);
    }
}
