// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockSqueekNFT is ERC721 {
    uint256 private _next = 1;

    constructor() ERC721("Squeek", "SQUEEK") {}

    function mint(address to) external returns (uint256 id) {
        id = _next++;
        _mint(to, id);
    }
}
