// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ISpendHook {
    function onTokenSpend() external;
}

/// @dev Security-test token with an ERC777-style "tokensToSend" hook: before moving a contract holder's tokens it
///      calls back into that holder, which gives the holder a chance to reenter the garden mid-plant.
contract MockHookSQK is ERC20 {
    constructor() ERC20("Hook Squeek", "hSQK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (from.code.length > 0) ISpendHook(from).onTokenSpend();
        return super.transferFrom(from, to, value);
    }
}
