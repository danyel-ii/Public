// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureMint } from "../contracts/SculptureMint.sol";
import { SculptureRenderer } from "../contracts/SculptureRenderer.sol";

interface Vm {
  function deal(address who, uint256 newBalance) external;
}

contract ForceSend {
  constructor() payable {}

  function destroy(address payable to) external {
    selfdestruct(to);
  }
}

contract SculptureMintTest {
  Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  bytes private constant PACKED_STATE = hex"0000013a02010200262b6445c3c39faba712b7428013db291014ff0fa007d010681faf129a157c123b13c4090c19641d841652114114ff136a0a7c0c1c216c10be148211be13a6";
  uint256 private constant PRICE = 0.1 ether;

  SculptureMint private mint;

  receive() external payable {}

  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }

  function setUp() public {
    mint = new SculptureMint("sculpture", "SCULPT", address(0xBEEF), PRICE);
    vm.deal(address(this), 10 ether);
  }

  function testMintStoresPackedState() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    bytes memory stored = mint.getPackedState(1);
    assert(keccak256(stored) == keccak256(PACKED_STATE));
  }

  function testMintRequiresPrice() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.mint.selector, PACKED_STATE)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.MintPriceNotMet.selector);
  }

  function testMintRejectsInvalidPackedLength() public {
    bytes memory bad = hex"00";
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, bad)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureRenderer.InvalidPackedLength.selector);
  }

  function testMintRejectsInvalidLayerOrder() public {
    bytes memory bad = abi.encodePacked(PACKED_STATE);
    bad[5] = 0x05;
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, bad)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureRenderer.InvalidLayerOrder.selector);
  }

  function testMintRejectsInvalidParamValue() public {
    bytes memory bad = abi.encodePacked(PACKED_STATE);
    bad[29] = 0xff;
    bad[30] = 0xff;
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, bad)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureRenderer.InvalidParamValue.selector);
  }

  function testTokenUriHasDataPrefix() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    string memory uri = mint.tokenURI(1);
    assert(_startsWith(uri, "data:application/json;base64,"));
  }

  function testTokenUriUsesIpfsWhenEnabled() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    mint.setIpfsBaseUri("ipfs://example/");
    mint.setUseIpfsMetadata(true);
    string memory uri = mint.tokenURI(1);
    assert(keccak256(bytes(uri)) == keccak256(bytes("ipfs://example/1")));
  }

  function testMintPausedPreventsMinting() public {
    mint.setMintPaused(true);
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, PACKED_STATE)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.MintPaused.selector);
  }

  function testFreezeMetadataBlocksUpdates() public {
    mint.freezeMetadata();
    (bool okUri, bytes memory dataUri) = address(mint).call(
      abi.encodeWithSelector(mint.setIpfsBaseUri.selector, "ipfs://example/")
    );
    assert(!okUri);
    assert(_revertSelector(dataUri) == SculptureMint.MetadataFrozen.selector);

    (bool okToggle, bytes memory dataToggle) = address(mint).call(
      abi.encodeWithSelector(mint.setUseIpfsMetadata.selector, true)
    );
    assert(!okToggle);
    assert(_revertSelector(dataToggle) == SculptureMint.MetadataFrozen.selector);
  }

  function testGetPackedStateRevertsIfNotMinted() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.getPackedState.selector, 99)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotMinted.selector);
  }

  function testSetFeeRecipientRejectsZero() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.setFeeRecipient.selector, address(0))
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.ZeroAddress.selector);
  }

  function testWithdrawTransfersBalance() public {
    uint256 start = address(this).balance;
    ForceSend force = new ForceSend{ value: 1 ether }();
    force.destroy(payable(address(mint)));
    mint.withdraw(address(this), 1 ether);
    assert(address(this).balance == start);
  }

  function _startsWith(string memory value, string memory prefix) private pure returns (bool) {
    bytes memory valueBytes = bytes(value);
    bytes memory prefixBytes = bytes(prefix);
    if (valueBytes.length < prefixBytes.length) {
      return false;
    }
    for (uint256 i = 0; i < prefixBytes.length; i++) {
      if (valueBytes[i] != prefixBytes[i]) {
        return false;
      }
    }
    return true;
  }

  function _revertSelector(bytes memory data) private pure returns (bytes4 selector) {
    if (data.length < 4) {
      return bytes4(0);
    }
    assembly {
      selector := mload(add(data, 32))
    }
  }
}
