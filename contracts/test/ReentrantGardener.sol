// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IGardenPlant {
    function plant(uint8 plot, uint32 seedId) external;
}

/// @dev Security-test player contract: while the garden pulls SQK for one paid seed, it tries to plant the same seed
///      again on the next plot (reentrancy through MockHookSQK's spend hook). Counts what got through.
contract ReentrantGardener {
    IGardenPlant public immutable garden;
    uint32 public seedId;
    uint8 public nextPlot;
    uint8 public maxPlot;
    uint256 public reentrySucceeded;
    uint256 public reentryFailed;

    constructor(IGardenPlant garden_) {
        garden = garden_;
    }

    function approve(IERC20 token, uint256 amount) external {
        token.approve(address(garden), amount);
    }

    function start(uint32 seedId_, uint8 maxPlot_) external {
        seedId = seedId_;
        nextPlot = 1;
        maxPlot = maxPlot_;
        garden.plant(0, seedId_);
    }

    function onTokenSpend() external {
        if (nextPlot > maxPlot) return;
        uint8 plot = nextPlot++;
        try garden.plant(plot, seedId) {
            reentrySucceeded++;
        } catch {
            reentryFailed++;
        }
    }
}
