//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.3;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { PKPPermissions } from "./PKPPermissions.sol";
import { SoloNetPKP } from "./SoloNetPKP.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @title PKP Helper Contract
///
/// @dev This is the contract that helps minting PKPs
///
/// Simply put, whomever owns a PKP NFT can ask that PKP to sign a message.
/// The owner can also grant signing permissions to other eth addresses
/// or lit actions
contract SoloNetPKPHelper is Ownable, IERC721Receiver {
    /* ========== STATE VARIABLES ========== */

    SoloNetPKP public pkpNFT;
    PKPPermissions public pkpPermissions;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _pkpNft, address _pkpPermissions) {
        pkpNFT = SoloNetPKP(_pkpNft);
        pkpPermissions = PKPPermissions(_pkpPermissions);
    }

    /* ========== VIEWS ========== */

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mintAndAddAuthMethods(
        bytes memory pubkey,
        uint256[] memory permittedAuthMethodTypes,
        bytes[] memory permittedAuthMethodIds,
        bytes[] memory permittedAuthMethodPubkeys,
        uint256[][] memory permittedAuthMethodScopes,
        bool addPkpEthAddressAsPermittedAddress,
        bool sendPkpToItself
    ) public payable returns (uint256) {
        return
            mintAndAddAuthMethodsWithTypes(
                pubkey,
                new bytes[](0), // permitted ipfs CIDs
                new uint256[][](0), // permitted ipfs CIDs scopes
                new address[](0), // permitted addresses
                new uint256[][](0), // permitted addresses scopes
                permittedAuthMethodTypes,
                permittedAuthMethodIds,
                permittedAuthMethodPubkeys,
                permittedAuthMethodScopes,
                addPkpEthAddressAsPermittedAddress,
                sendPkpToItself
            );
    }

    function mintAndAddAuthMethodsWithTypes(
        bytes memory pubkey,
        bytes[] memory permittedIpfsCIDs,
        uint256[][] memory permittedIpfsCIDScopes,
        address[] memory permittedAddresses,
        uint256[][] memory permittedAddressScopes,
        uint256[] memory permittedAuthMethodTypes,
        bytes[] memory permittedAuthMethodIds,
        bytes[] memory permittedAuthMethodPubkeys,
        uint256[][] memory permittedAuthMethodScopes,
        bool addPkpEthAddressAsPermittedAddress,
        bool sendPkpToItself
    ) public payable returns (uint256) {
        // mint the nft and forward the funds
        uint256 tokenId = pkpNFT.mint{ value: msg.value }(pubkey);

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
            for (uint256 i = 0; i < permittedIpfsCIDs.length; i++) {
                pkpPermissions.addPermittedAction(
                    tokenId,
                    permittedIpfsCIDs[i],
                    permittedIpfsCIDScopes[i]
                );
            }
        }

        // permit the address
        if (permittedAddresses.length != 0) {
            for (uint256 i = 0; i < permittedAddresses.length; i++) {
                pkpPermissions.addPermittedAddress(
                    tokenId,
                    permittedAddresses[i],
                    permittedAddressScopes[i]
                );
            }
        }

        // permit the auth method
        if (permittedAuthMethodTypes.length != 0) {
            for (uint256 i = 0; i < permittedAuthMethodTypes.length; i++) {
                pkpPermissions.addPermittedAuthMethod(
                    tokenId,
                    PKPPermissions.AuthMethod(
                        permittedAuthMethodTypes[i],
                        permittedAuthMethodIds[i],
                        permittedAuthMethodPubkeys[i]
                    ),
                    permittedAuthMethodScopes[i]
                );
            }
        }

        address pkpEthAddress = pkpNFT.getEthAddress(tokenId);

        // add the pkp eth address as a permitted address
        if (addPkpEthAddressAsPermittedAddress) {
            pkpPermissions.addPermittedAddress(
                tokenId,
                pkpEthAddress,
                new uint256[](0)
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
        pkpNFT = SoloNetPKP(newPkpNftAddress);
    }

    function setPkpPermissionsAddress(
        address newPkpPermissionsAddress
    ) public onlyOwner {
        pkpPermissions = PKPPermissions(newPkpPermissionsAddress);
    }

    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
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
