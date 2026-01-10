// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureRenderer } from "./SculptureRenderer.sol";

/// @notice Parity check helper: compares a fixed packed state against a JS-computed SVG hash.
contract RendererParity {
  bytes public constant PACKED_STATE = hex"0000013a02010200262b6445c3c39faba712b7428013db291014ff0fa007d010681faf129a157c123b13c4090c19641d841652114114ff136a0a7c0c1c216c10be148211be13a6";
  bytes32 public constant EXPECTED_SHA256 = 0x4ad48c844f05c96c8bf816ec27797f234ab271afc4e272717916a2333928fa76;

  function check() external pure returns (bool) {
    bytes memory svg = bytes(SculptureRenderer.render(PACKED_STATE));
    return sha256(svg) == EXPECTED_SHA256;
  }
}
