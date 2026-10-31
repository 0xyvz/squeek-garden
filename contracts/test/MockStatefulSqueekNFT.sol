// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Security-test NFT whose ownerOf tries to change state (as a reentrancy attempt would). The garden reads
///      ownerOf through a view interface, so the call is a STATICCALL and any state change makes it revert.
contract MockStatefulSqueekNFT {
    mapping(uint256 => address) public holderOf;
    uint256 public calls;

    function mint(address to, uint256 tokenId) external {
        holderOf[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external returns (address) {
        calls++; // a state write: reverts under STATICCALL
        return holderOf[tokenId];
    }
}
