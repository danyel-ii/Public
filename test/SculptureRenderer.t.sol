// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureRenderer } from "../contracts/SculptureRenderer.sol";

contract SculptureRendererTest {
  bytes private constant PACKED_STATE = hex"0000013a02010200262b6445c3c39faba712b7428013db291014ff0fa007d010681faf129a157c123b13c4090c19641d841652114114ff136a0a7c0c1c216c10be148211be13a6";
  bytes32 private constant EXPECTED_SHA256 = 0x4ad48c844f05c96c8bf816ec27797f234ab271afc4e272717916a2333928fa76;

  function testRenderMatchesParityHash() public pure {
    string memory svg = SculptureRenderer.render(PACKED_STATE);
    bytes32 hash = sha256(bytes(svg));
    assert(hash == EXPECTED_SHA256);
  }

  function testRejectsInvalidPackedLength() public view {
    bytes memory bad = hex"00";
    bool ok;
    try this.renderSvg(bad) returns (string memory) {
      ok = true;
    } catch {
      ok = false;
    }
    assert(!ok);
  }

  function renderSvg(bytes memory data) external pure returns (string memory) {
    return SculptureRenderer.render(data);
  }
}
