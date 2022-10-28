// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/structs/BitMaps.sol)
pragma solidity ^0.8.0;

/**
 * @dev Library for managing uint256 to bool mapping in a compact and efficient way, providing the keys are sequential.
 * Largelly inspired by Uniswap's https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol[merkle-distributor].
 */
library BitFields {
    /**
     * @dev Returns whether the bit at `index` is set.
     */
    function get(uint256 bitmap, uint8 index) internal view returns (bool) {
        uint256 mask = 1 << (index & 0xff);
        return bitmap & mask != 0;
    }

    /**
     * @dev Sets the bit at `index` to the boolean `value`.
     */
    function setTo(
        uint256 bitmap,
        uint8 index,
        bool value
    ) internal returns (uint256) {
        if (value) {
            return set(bitmap, index);
        } else {
            return unset(bitmap, index);
        }
    }

    /**
     * @dev Sets the bit at `index`.
     */
    function set(uint256 bitmap, uint8 index) internal returns (uint256) {
        uint256 mask = 1 << (index & 0xff);
        bitmap |= mask;
        return bitmap;
    }

    /**
     * @dev Unsets the bit at `index`.
     */
    function unset(uint256 bitmap, uint8 index) internal returns (uint256) {
        uint256 mask = 1 << (index & 0xff);
        bitmap &= ~mask;
        return bitmap;
    }
}
