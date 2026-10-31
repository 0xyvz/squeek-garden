// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISqueekCore} from "../SqueekGarden.sol";

/// @dev Test stand-in for SqueekCore. Tests move it by hand; scripts/mirror-hamster.js copies the real one into it.
contract MockSqueekCore {
    ISqueekCore.CoreState private _state;
    uint64 public recentWork;

    function setState(uint64 work, uint64 blockHeight, uint64 settledRound, uint64 recentWork_) external {
        _state.cumulativeWork = work;
        _state.blockHeight = blockHeight;
        _state.settledThroughRound = settledRound;
        recentWork = recentWork_;
    }

    function setWork(uint64 work) external {
        _state.cumulativeWork = work;
    }

    /// @dev The hamster runs: work, blocks (one per 11 work, like Oct 2026 difficulty) and one settled round.
    function run(uint64 work) external {
        _state.cumulativeWork += work;
        _state.blockHeight += work / 11;
        _state.settledThroughRound += 1;
        recentWork = work;
    }

    /// @dev The hamster naps for `rounds` settled rounds.
    function nap(uint64 rounds) external {
        _state.settledThroughRound += rounds;
        recentWork = 0;
    }

    function state() external view returns (ISqueekCore.CoreState memory) {
        return _state;
    }

    function roundPage(uint64, uint64, uint256) external view returns (ISqueekCore.RoundPage memory page) {
        page.certifiedThroughRound = _state.settledThroughRound;
        page.start.cumulativeWork = _state.cumulativeWork - recentWork;
        page.end.cumulativeWork = _state.cumulativeWork;
    }
}
