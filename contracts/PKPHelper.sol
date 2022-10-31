//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PKPPermissions} from "./PKPPermissions.sol";
import {PKPNFT} from "./PKPNFT.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// TODO: tests for the mintGrantAndBurn function, withdraw function, some of the setters, transfer function, freeMint and freeMintGrantAndBurn

/// @title Programmable Keypair NFT
///
/// @dev This is the contract for the PKP NFTs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract PKPHelper is Ownable, IERC721Receiver {
    /* ========== STATE VARIABLES ========== */

    PKPNFT public pkpNFT;
    PKPPermissions public pkpPermissions;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft, address _pkpPermissions) {
        pkpNFT = PKPNFT(_pkpNft);
        pkpPermissions = PKPPermissions(_pkpPermissions);
    }

    /* ========== VIEWS ========== */

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mintNextAndAddAuthMethods(
        uint keyType,
        uint[] memory permittedAuthMethodTypes,
        bytes[] memory permittedAuthMethodIds,
        bytes[] memory permittedAuthMethodPubkeys,
        uint[][] memory permittedAuthMethodScopes,
        bool addPkpEthAddressAsPermittedAddress,
        bool sendPkpToItself
    ) public payable returns (uint) {
        return
            mintNextAndAddAuthMethodsWithTypes(
                keyType,
                new bytes[](0), // permitted ipfs CIDs
                new uint[][](0), // permitted ipfs CIDs scopes
                new address[](0), // permitted addresses
                new uint[][](0), // permitted addresses scopes
                permittedAuthMethodTypes,
                permittedAuthMethodIds,
                permittedAuthMethodPubkeys,
                permittedAuthMethodScopes,
                addPkpEthAddressAsPermittedAddress,
                sendPkpToItself
            );
    }

    function mintNextAndAddAuthMethodsWithTypes(
        uint keyType,
        bytes[] memory permittedIpfsCIDs,
        uint[][] memory permittedIpfsCIDScopes,
        address[] memory permittedAddresses,
        uint[][] memory permittedAddressScopes,
        uint[] memory permittedAuthMethodTypes,
        bytes[] memory permittedAuthMethodIds,
        bytes[] memory permittedAuthMethodPubkeys,
        uint[][] memory permittedAuthMethodScopes,
        bool addPkpEthAddressAsPermittedAddress,
        bool sendPkpToItself
    ) public payable returns (uint) {
        // mint the nft and forward the funds
        uint tokenId = pkpNFT.mintNext{value: msg.value}(keyType);

        // sanity checking array lengths
        require(
            permittedIpfsCIDs.length == permittedIpfsCIDScopes.length,
            "PKPHelper: ipfs cid and scope array lengths must match"
        );
        require(
            permittedAddresses.length == permittedAddressScopes.length,
            "PKPHelper: address and scope array lengths must match"
        );
        require(
            permittedAuthMethodTypes.length == permittedAuthMethodIds.length,
            "PKPHelper: auth method type and id array lengths must match"
        );
        require(
            permittedAuthMethodTypes.length ==
                permittedAuthMethodPubkeys.length,
            "PKPHelper: auth method type and pubkey array lengths must match"
        );
        require(
            permittedAuthMethodTypes.length == permittedAuthMethodScopes.length,
            "PKPHelper: auth method type and scopes array lengths must match"
        );

        // permit the action
        if (permittedIpfsCIDs.length != 0) {
            for (uint i = 0; i < permittedIpfsCIDs.length; i++) {
                pkpPermissions.addPermittedAction(
                    tokenId,
                    permittedIpfsCIDs[i],
                    permittedIpfsCIDScopes[i]
                );
            }
        }

        // permit the address
        if (permittedAddresses.length != 0) {
            for (uint i = 0; i < permittedAddresses.length; i++) {
                pkpPermissions.addPermittedAddress(
                    tokenId,
                    permittedAddresses[i],
                    permittedAddressScopes[i]
                );
            }
        }

        // permit the auth method
        if (permittedAuthMethodTypes.length != 0) {
            for (uint i = 0; i < permittedAuthMethodTypes.length; i++) {
                pkpPermissions.addPermittedAuthMethod(
                    tokenId,
                    permittedAuthMethodTypes[i],
                    permittedAuthMethodIds[i],
                    permittedAuthMethodPubkeys[i],
                    permittedAuthMethodScopes[i]
                );
            }
        }

        address pkpEthAddress = pkpPermissions.getEthAddress(tokenId);

        // add the pkp eth address as a permitted address
        if (addPkpEthAddressAsPermittedAddress) {
            pkpPermissions.addPermittedAddress(
                tokenId,
                pkpEthAddress,
                new uint[](0)
            );
        }

        if (sendPkpToItself) {
            pkpNFT.safeTransferFrom(address(this), pkpEthAddress, tokenId);
        } else {
            pkpNFT.safeTransferFrom(address(this), msg.sender, tokenId);
        }

        return tokenId;
    }

    function setPkpNftAddress(address newPkpNftAddress) public onlyOwner {
        pkpNFT = PKPNFT(newPkpNftAddress);
    }

    function setPkpPermissionsAddress(address newPkpPermissionsAddress)
        public
        onlyOwner
    {
        pkpPermissions = PKPPermissions(newPkpPermissionsAddress);
    }

    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external view override returns (bytes4) {
        // only accept transfers from the pkpNft contract
        require(
            msg.sender == address(pkpNFT),
            "PKPHelper: only accepts transfers from the PKPNFT contract"
        );
        return this.onERC721Received.selector;
    }
}
