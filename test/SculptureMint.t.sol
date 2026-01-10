// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureMint } from "../contracts/SculptureMint.sol";
import { SculptureRenderer } from "../contracts/SculptureRenderer.sol";

interface Vm {
  function deal(address who, uint256 newBalance) external;
  function prank(address who) external;
  function startPrank(address who) external;
  function stopPrank() external;
  function assume(bool condition) external;
}

contract ForceSend {
  constructor() payable {}

  function destroy(address payable to) external {
    selfdestruct(to);
  }
}

contract GoodReceiver {
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }
}

contract BadReceiver {
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
    return 0x0;
  }
}

contract ReenteringReceiver {
  SculptureMint private mint;
  bytes private packed;
  uint256 private price;
  bool public attempted;

  constructor(SculptureMint mint_, bytes memory packed_, uint256 price_) {
    mint = mint_;
    packed = packed_;
    price = price_;
  }

  function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
    if (!attempted) {
      attempted = true;
      try mint.mint{ value: price }(packed) {
        revert("reentrancy allowed");
      } catch {}
    }
    return this.onERC721Received.selector;
  }
}

contract RejectingReceiver {
  receive() external payable {
    revert("reject");
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

  function testSupportsInterface() public view {
    assert(mint.supportsInterface(0x01ffc9a7));
    assert(mint.supportsInterface(0x80ac58cd));
    assert(mint.supportsInterface(0x5b5e139f));
    assert(!mint.supportsInterface(0xffffffff));
  }

  function testBalanceOfUpdatesAfterMint() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    assert(mint.balanceOf(address(this)) == 1);
  }

  function testBalanceOfZeroAddressReverts() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.balanceOf.selector, address(0))
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.ZeroAddress.selector);
  }

  function testMintStoresPackedState() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    bytes memory stored = mint.getPackedState(1);
    assert(keccak256(stored) == keccak256(PACKED_STATE));
  }

  function testMintWithImageStoresRasterUri() public {
    string memory uri = "ipfs://example-cid/sculpture.png";
    mint.mintWithImage{ value: PRICE }(PACKED_STATE, uri);
    string memory stored = mint.getRasterUri(1);
    assert(keccak256(bytes(stored)) == keccak256(bytes(uri)));
  }

  function testMintWithImageRejectsEmptyUri() public {
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mintWithImage.selector, PACKED_STATE, "")
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.EmptyRasterUri.selector);
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

  function testTokenUriRevertsIfNotMinted() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.tokenURI.selector, 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotMinted.selector);
  }

  function testTokenUriUsesIpfsWhenEnabled() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    mint.setIpfsBaseUri("ipfs://example/");
    mint.setUseIpfsMetadata(true);
    string memory uri = mint.tokenURI(1);
    assert(keccak256(bytes(uri)) == keccak256(bytes("ipfs://example/1")));
  }

  function testGetApprovedRevertsIfNotMinted() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.getApproved.selector, 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotMinted.selector);
  }

  function testApproveRejectsSelf() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.approve.selector, address(this), 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.AlreadyOwner.selector);
  }

  function testApproveRejectsNonOwner() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    vm.prank(address(0xB0B));
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.approve.selector, address(0xB0B), 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotApproved.selector);
  }

  function testApproveAndTransferFrom() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    address recipient = address(0xB0B);
    mint.approve(recipient, 1);
    vm.prank(recipient);
    mint.transferFrom(address(this), recipient, 1);
    assert(mint.ownerOf(1) == recipient);
  }

  function testSetApprovalForAllAllowsTransfer() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    address operator = address(0xCAFE);
    mint.setApprovalForAll(operator, true);
    vm.prank(operator);
    mint.transferFrom(address(this), operator, 1);
    assert(mint.ownerOf(1) == operator);
  }

  function testSetApprovalForAllRejectsSelf() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.setApprovalForAll.selector, address(this), true)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.SelfApproval.selector);
  }

  function testIsApprovedForAllReflectsState() public {
    address operator = address(0xCAFE);
    mint.setApprovalForAll(operator, true);
    assert(mint.isApprovedForAll(address(this), operator));
  }

  function testTransferFromRejectsZeroAddress() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.transferFrom.selector, address(this), address(0), 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.ZeroAddress.selector);
  }

  function testTransferFromRejectsIncorrectOwner() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.transferFrom.selector, address(0xB0B), address(0xCAFE), 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.IncorrectOwner.selector);
  }

  function testSafeTransferRejectsBadReceiver() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    BadReceiver bad = new BadReceiver();
    bytes4 selector = bytes4(keccak256("safeTransferFrom(address,address,uint256)"));
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(selector, address(this), address(bad), 1)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.UnsafeReceiver.selector);
  }

  function testSafeTransferToGoodReceiver() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    GoodReceiver good = new GoodReceiver();
    mint.safeTransferFrom(address(this), address(good), 1);
    assert(mint.ownerOf(1) == address(good));
  }

  function testSafeTransferWithDataToGoodReceiver() public {
    mint.mint{ value: PRICE }(PACKED_STATE);
    GoodReceiver good = new GoodReceiver();
    bytes memory payload = hex"1234";
    mint.safeTransferFrom(address(this), address(good), 1, payload);
    assert(mint.ownerOf(1) == address(good));
  }

  function testMintPausedPreventsMinting() public {
    mint.setMintPaused(true);
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, PACKED_STATE)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.MintPaused.selector);
  }

  function testNonOwnerCannotPause() public {
    vm.prank(address(0xB0B));
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.setMintPaused.selector, true)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotOwner.selector);
  }

  function testTransferOwnershipUpdatesOwner() public {
    address nextOwner = address(0xCAFE);
    mint.transferOwnership(nextOwner);
    vm.prank(nextOwner);
    mint.setMintPaused(true);
    assert(mint.mintPaused());
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

  function testSetFeeRecipientUpdatesAndReceivesMint() public {
    address recipient = address(0xFEED);
    mint.setFeeRecipient(recipient);
    mint.mint{ value: PRICE }(PACKED_STATE);
    assert(address(recipient).balance == PRICE);
  }

  function testMintFailsWhenFeeRecipientRejects() public {
    RejectingReceiver rejector = new RejectingReceiver();
    mint.setFeeRecipient(address(rejector));
    (bool ok, bytes memory data) = address(mint).call{ value: PRICE }(
      abi.encodeWithSelector(mint.mint.selector, PACKED_STATE)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.FeeTransferFailed.selector);
    assert(mint.totalSupply() == 0);
  }

  function testSetMintPriceWeiUpdates() public {
    mint.setMintPriceWei(2 ether);
    assert(mint.mintPriceWei() == 2 ether);
  }

  function testTransferOwnershipRejectsZero() public {
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.transferOwnership.selector, address(0))
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.ZeroAddress.selector);
  }

  function testReentrancyBlockedOnMint() public {
    ReenteringReceiver receiver = new ReenteringReceiver(mint, PACKED_STATE, PRICE);
    vm.deal(address(receiver), PRICE);
    vm.prank(address(receiver));
    mint.mint{ value: PRICE }(PACKED_STATE);
    assert(receiver.attempted());
    assert(mint.totalSupply() == 1);
  }

  function testWithdrawRejectsZeroAddress() public {
    ForceSend force = new ForceSend{ value: 1 ether }();
    force.destroy(payable(address(mint)));
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.withdraw.selector, address(0), 1 ether)
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

  function testWithdrawRejectsNonOwner() public {
    ForceSend force = new ForceSend{ value: 1 ether }();
    force.destroy(payable(address(mint)));
    vm.prank(address(0xB0B));
    (bool ok, bytes memory data) = address(mint).call(
      abi.encodeWithSelector(mint.withdraw.selector, address(this), 1 ether)
    );
    assert(!ok);
    assert(_revertSelector(data) == SculptureMint.NotOwner.selector);
  }

  function testFuzzMintUpdatesSupply(uint256 seed) public {
    bytes memory packed = _packState(seed);
    mint.mint{ value: PRICE }(packed);
    assert(mint.totalSupply() == 1);
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
