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

  function testRenderFuzzDoesNotRevert(uint256 seed) public pure {
    bytes memory packed = _packState(seed);
    string memory svg = SculptureRenderer.render(packed);
    assert(bytes(svg).length > 0);
  }

  function renderSvg(bytes memory data) external pure returns (string memory) {
    return SculptureRenderer.render(data);
  }

  function _packState(uint256 seed) private pure returns (bytes memory) {
    uint32 seed32 = uint32(seed);
    uint256 seedBase = uint256(seed32);
    uint8[3] memory order = _layerOrder(uint8(seed32));
    uint24[3] memory colors = [
      uint24(uint256(keccak256(abi.encodePacked(seedBase, "c1")))),
      uint24(uint256(keccak256(abi.encodePacked(seedBase, "c2")))),
      uint24(uint256(keccak256(abi.encodePacked(seedBase, "c3"))))
    ];

    bytes memory data = new bytes(71);
    uint256 offset = 0;
    _write32(data, offset, seed32);
    offset += 4;
    data[offset] = bytes1(uint8(seed32));
    offset += 1;
    for (uint256 i = 0; i < 3; i++) {
      data[offset++] = bytes1(order[i]);
    }
    for (uint256 i = 0; i < 3; i++) {
      _write24(data, offset, colors[i]);
      offset += 3;
    }
    for (uint256 i = 0; i < 3; i++) {
      _write32(data, offset, uint32(seedBase + i * 777));
      offset += 4;
    }
    for (uint256 layer = 0; layer < 3; layer++) {
      for (uint256 param = 0; param < 7; param++) {
        uint16 value = uint16(uint256(keccak256(abi.encodePacked(seedBase, layer, param))) % 7001);
        _write16(data, offset, value);
        offset += 2;
      }
    }
    return data;
  }

  function _layerOrder(uint8 seed) private pure returns (uint8[3] memory order) {
    order = [uint8(0), uint8(1), uint8(2)];
    if (seed & 1 == 1) {
      (order[0], order[1]) = (order[1], order[0]);
    }
    if (seed & 2 == 2) {
      (order[1], order[2]) = (order[2], order[1]);
    }
    if (seed & 4 == 4) {
      (order[0], order[2]) = (order[2], order[0]);
    }
  }

  function _write16(bytes memory data, uint256 offset, uint16 value) private pure {
    data[offset] = bytes1(uint8(value >> 8));
    data[offset + 1] = bytes1(uint8(value));
  }

  function _write24(bytes memory data, uint256 offset, uint24 value) private pure {
    data[offset] = bytes1(uint8(value >> 16));
    data[offset + 1] = bytes1(uint8(value >> 8));
    data[offset + 2] = bytes1(uint8(value));
  }

  function _write32(bytes memory data, uint256 offset, uint32 value) private pure {
    data[offset] = bytes1(uint8(value >> 24));
    data[offset + 1] = bytes1(uint8(value >> 16));
    data[offset + 2] = bytes1(uint8(value >> 8));
    data[offset + 3] = bytes1(uint8(value));
  }
}
