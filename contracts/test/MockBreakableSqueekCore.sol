// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISqueekCore} from "../SqueekGarden.sol";

/// @dev Security-test core: works like MockSqueekCore, but can be switched to revert or to answer state() with
///      malformed (too short) return data, to model an old core that no longer answers properly.
contract MockBreakableSqueekCore {
    ISqueekCore.CoreState private _state;
    uint64 public recentWork;
    uint8 public mode; // 0 = normal, 1 = state() reverts, 2 = state() returns 32 bytes only

    function setState(uint64 work, uint64 blockHeight, uint64 settledRound, uint64 recentWork_) external {
        _state.cumulativeWork = work;
        _state.blockHeight = blockHeight;
        _state.settledThroughRound = settledRound;
        recentWork = recentWork_;
    }

    function run(uint64 work) external {
        _state.cumulativeWork += work;
        _state.blockHeight += work / 11;
        _state.settledThroughRound += 1;
        recentWork = work;
    }

    function setMode(uint8 mode_) external {
        mode = mode_;
    }

    function state() external view returns (ISqueekCore.CoreState memory) {
        if (mode == 1) revert("core gone");
        if (mode == 2) {
            assembly {
                mstore(0, 1)
                return(0, 32)
            }
        }
        return _state;
    }

    function roundPage(uint64, uint64, uint256) external view returns (ISqueekCore.RoundPage memory page) {
        page.certifiedThroughRound = _state.settledThroughRound;
        page.start.cumulativeWork = _state.cumulativeWork - recentWork;
        page.end.cumulativeWork = _state.cumulativeWork;
    }
}
