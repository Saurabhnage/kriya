// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockAggregatorV3 - local stand-in for an Atlas Oracle single-feed contract
/// @notice Atlas feeds are Chainlink AggregatorV3-compatible; this mock exposes the same read
///         interface so the market risk engine can be tested end to end on Anvil.
contract MockAggregatorV3 {
    uint8 public immutable decimals;
    string public description;
    uint80 public roundId;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 decimals_, string memory description_, int256 answer_) {
        decimals = decimals_;
        description = description_;
        _set(answer_);
    }

    function setAnswer(int256 answer_) external {
        _set(answer_);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }

    function _set(int256 answer_) private {
        roundId++;
        answer = answer_;
        updatedAt = block.timestamp;
    }
}
