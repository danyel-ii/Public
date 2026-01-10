// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RendererParity } from "../contracts/RendererParity.sol";

contract RendererParityTest {
  function testParityCheckMatchesExpectedHash() public {
    RendererParity parity = new RendererParity();
    assert(parity.check());
  }
}
