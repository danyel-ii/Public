// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureRenderer } from "./SculptureRenderer.sol";

interface IERC721Receiver {
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
    external
    returns (bytes4);
}

/// @notice Minimal ERC721 mint contract for the paper sculpture.
contract SculptureMint {
  using SculptureRenderer for bytes;

  event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
  event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  string public name;
  string public symbol;

  uint256 public totalSupply;
  uint256 public mintPriceWei;
  address public feeRecipient;
  address public owner;

  mapping(uint256 => address) private _owners;
  mapping(address => uint256) private _balances;
  mapping(uint256 => address) private _tokenApprovals;
  mapping(address => mapping(address => bool)) private _operatorApprovals;
  mapping(uint256 => bytes) private _packedState;

  uint256 internal constant SCALE = 10000;
  uint256 internal constant FP = 1000000;
  uint256 internal constant SEED_SCALE = 1000000;
  uint256 internal constant GRID_MIN_FP = 3000000;
  uint256 internal constant GRID_MAX_FP = 22000000;
  uint256 internal constant HOLE_MIN_FP = 50000;
  uint256 internal constant HOLE_MAX_FP = 950000;
  uint256 internal constant RADIUS_MIN_FP = 180000;
  uint256 internal constant RADIUS_MAX_FP = 600000;
  int256 internal constant PAN_MIN_FP = -120000;
  int256 internal constant PAN_MAX_FP = 120000;
  uint256 internal constant SCALE_MIN_FP = 900000;
  uint256 internal constant SCALE_MAX_FP = 1100000;

  bool public useIpfsMetadata;
  string public ipfsBaseUri;

  modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
  }

  constructor(
    string memory name_,
    string memory symbol_,
    address feeRecipient_,
    uint256 mintPriceWei_
  ) {
    name = name_;
    symbol = symbol_;
    owner = msg.sender;
    feeRecipient = feeRecipient_;
    mintPriceWei = mintPriceWei_;
  }

  function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
    return
      interfaceId == 0x01ffc9a7 || // ERC165
      interfaceId == 0x80ac58cd || // ERC721
      interfaceId == 0x5b5e139f;   // ERC721Metadata
  }

  function balanceOf(address account) public view returns (uint256) {
    require(account != address(0), "Zero address");
    return _balances[account];
  }

  function ownerOf(uint256 tokenId) public view returns (address) {
    address tokenOwner = _owners[tokenId];
    require(tokenOwner != address(0), "Not minted");
    return tokenOwner;
  }

  function approve(address to, uint256 tokenId) public {
    address tokenOwner = ownerOf(tokenId);
    require(to != tokenOwner, "Already owner");
    require(msg.sender == tokenOwner || isApprovedForAll(tokenOwner, msg.sender), "Not approved");
    _tokenApprovals[tokenId] = to;
    emit Approval(tokenOwner, to, tokenId);
  }

  function getApproved(uint256 tokenId) public view returns (address) {
    require(_exists(tokenId), "Not minted");
    return _tokenApprovals[tokenId];
  }

  function setApprovalForAll(address operator, bool approved) public {
    require(operator != msg.sender, "Self approval");
    _operatorApprovals[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function isApprovedForAll(address account, address operator) public view returns (bool) {
    return _operatorApprovals[account][operator];
  }

  function transferFrom(address from, address to, uint256 tokenId) public {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
    require(ownerOf(tokenId) == from, "Wrong owner");
    require(to != address(0), "Zero address");
    _approve(address(0), tokenId);
    _balances[from] -= 1;
    _balances[to] += 1;
    _owners[tokenId] = to;
    emit Transfer(from, to, tokenId);
  }

  function safeTransferFrom(address from, address to, uint256 tokenId) public {
    safeTransferFrom(from, to, tokenId, "");
  }

  function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
    transferFrom(from, to, tokenId);
    require(_checkOnERC721Received(msg.sender, from, to, tokenId, data), "Unsafe receiver");
  }

  function mint(bytes calldata packed) external payable returns (uint256 tokenId) {
    require(msg.value >= mintPriceWei, "Mint price");
    tokenId = ++totalSupply;
    _safeMint(msg.sender, tokenId, "");
    _packedState[tokenId] = packed;
    _payout(msg.value);
  }

  function getPackedState(uint256 tokenId) external view returns (bytes memory) {
    require(_exists(tokenId), "Not minted");
    return _packedState[tokenId];
  }

  function tokenURI(uint256 tokenId) public view returns (string memory) {
    require(_exists(tokenId), "Not minted");
    if (useIpfsMetadata && bytes(ipfsBaseUri).length > 0) {
      return string(abi.encodePacked(ipfsBaseUri, toString(tokenId)));
    }
    bytes memory packed = _packedState[tokenId];
    string memory svg = SculptureRenderer.render(packed);
    string memory image = string(
      abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg)))
    );

    SculptureRenderer.State memory state = SculptureRenderer.decode(packed);
    string memory attrs = buildAttributes(state);
    string memory json = string(
      abi.encodePacked(
        "{",
        "\"name\":\"sculpture",
        toString(tokenId),
        "\",",
        "\"image\":\"",
        image,
        "\",",
        "\"image_data\":\"",
        svg,
        "\",",
        "\"attributes\":",
        attrs,
        "}"
      )
    );

    return string(
      abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json)))
    );
  }

  function setMintPriceWei(uint256 newPriceWei) external onlyOwner {
    mintPriceWei = newPriceWei;
  }

  function setFeeRecipient(address recipient) external onlyOwner {
    feeRecipient = recipient;
  }

  function setIpfsBaseUri(string calldata uri) external onlyOwner {
    ipfsBaseUri = uri;
  }

  function setUseIpfsMetadata(bool enabled) external onlyOwner {
    useIpfsMetadata = enabled;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "Zero address");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  function _safeMint(address to, uint256 tokenId, bytes memory data) internal {
    _mint(to, tokenId);
    require(_checkOnERC721Received(msg.sender, address(0), to, tokenId, data), "Unsafe receiver");
  }

  function _mint(address to, uint256 tokenId) internal {
    require(to != address(0), "Zero address");
    require(!_exists(tokenId), "Already minted");
    _balances[to] += 1;
    _owners[tokenId] = to;
    emit Transfer(address(0), to, tokenId);
  }

  function _exists(uint256 tokenId) internal view returns (bool) {
    return _owners[tokenId] != address(0);
  }

  function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
    address tokenOwner = ownerOf(tokenId);
    return (spender == tokenOwner || getApproved(tokenId) == spender || isApprovedForAll(tokenOwner, spender));
  }

  function _approve(address to, uint256 tokenId) internal {
    _tokenApprovals[tokenId] = to;
    emit Approval(ownerOf(tokenId), to, tokenId);
  }

  function _checkOnERC721Received(
    address operator,
    address from,
    address to,
    uint256 tokenId,
    bytes memory data
  ) private returns (bool) {
    if (to.code.length == 0) {
      return true;
    }
    try IERC721Receiver(to).onERC721Received(operator, from, tokenId, data) returns (bytes4 retval) {
      return retval == IERC721Receiver.onERC721Received.selector;
    } catch {
      return false;
    }
  }

  function _payout(uint256 amount) internal {
    if (feeRecipient == address(0) || amount == 0) {
      return;
    }
    (bool ok, ) = feeRecipient.call{ value: amount }("");
    require(ok, "Fee transfer failed");
  }

  function buildAttributes(SculptureRenderer.State memory state) internal pure returns (string memory) {
    string memory attrs = string(
      abi.encodePacked(
        "[",
        traitNumber("Base Seed", toString(state.baseSeed)), ",",
        traitNumber("Scene Index", toString(state.sceneIndex)), ",",
        traitNumber("Order 1", toString(state.layerOrder[0])), ",",
        traitNumber("Order 2", toString(state.layerOrder[1])), ",",
        traitNumber("Order 3", toString(state.layerOrder[2])), ",",
        traitNumber("Layer 1 Color R", toString(uint256(uint8(state.layerColors[0] >> 16)))), ",",
        traitNumber("Layer 1 Color G", toString(uint256(uint8(state.layerColors[0] >> 8)))), ",",
        traitNumber("Layer 1 Color B", toString(uint256(uint8(state.layerColors[0])))), ",",
        traitNumber("Layer 2 Color R", toString(uint256(uint8(state.layerColors[1] >> 16)))), ",",
        traitNumber("Layer 2 Color G", toString(uint256(uint8(state.layerColors[1] >> 8)))), ",",
        traitNumber("Layer 2 Color B", toString(uint256(uint8(state.layerColors[1])))), ",",
        traitNumber("Layer 3 Color R", toString(uint256(uint8(state.layerColors[2] >> 16)))), ",",
        traitNumber("Layer 3 Color G", toString(uint256(uint8(state.layerColors[2] >> 8)))), ",",
        traitNumber("Layer 3 Color B", toString(uint256(uint8(state.layerColors[2]))))
      )
    );

    for (uint256 i = 0; i < 3; i++) {
      (
        uint256 grid,
        uint256 squareMix,
        uint256 holeProb,
        uint256 radius,
        int256 panX,
        int256 panY,
        uint256 scale
      ) = layerValues(state, i);
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Seed", i), toFixed(uint256(state.layerSeeds[i]), SEED_SCALE, 3)),
          ",",
          traitNumber(layerTrait("Grid", i), toFixed(grid, FP, 3)),
          ",",
          traitNumber(layerTrait("Square Mix", i), toFixed(squareMix, FP, 3)),
          ",",
          traitNumber(layerTrait("Hole Prob", i), toFixed(holeProb, FP, 3)),
          ",",
          traitNumber(layerTrait("Radius", i), toFixed(radius, FP, 3)),
          ",",
          traitNumber(layerTrait("Pan X", i), toFixedSigned(panX, FP, 3)),
          ",",
          traitNumber(layerTrait("Pan Y", i), toFixedSigned(panY, FP, 3)),
          ",",
          traitNumber(layerTrait("Scale", i), toFixed(scale, FP, 3))
        )
      );
    }

    return string(abi.encodePacked(attrs, "]"));
  }

  function layerValues(
    SculptureRenderer.State memory state,
    uint256 layerIndex
  ) internal pure returns (
    uint256 grid,
    uint256 squareMix,
    uint256 holeProb,
    uint256 radius,
    int256 panX,
    int256 panY,
    uint256 scale
  ) {
    uint16[7] memory params = state.params[layerIndex];
    grid = mapParam(params[0], GRID_MIN_FP, GRID_MAX_FP);
    squareMix = mapParam(params[1], 0, FP);
    holeProb = mapParam(params[2], HOLE_MIN_FP, HOLE_MAX_FP);
    radius = mapParam(params[3], RADIUS_MIN_FP, RADIUS_MAX_FP);
    panX = mapParamSigned(params[4], PAN_MIN_FP, PAN_MAX_FP);
    panY = mapParamSigned(params[5], PAN_MIN_FP, PAN_MAX_FP);
    scale = mapParam(params[6], SCALE_MIN_FP, SCALE_MAX_FP);
  }

  function layerTrait(string memory label, uint256 layerIndex) internal pure returns (string memory) {
    return string(abi.encodePacked("Layer ", toString(layerIndex + 1), " ", label));
  }

  function layerOrderString(uint8[3] memory order) internal pure returns (string memory) {
    return string(
      abi.encodePacked(
        toString(order[0]),
        "-",
        toString(order[1]),
        "-",
        toString(order[2])
      )
    );
  }

  function traitNumber(string memory name_, string memory value) internal pure returns (string memory) {
    return string(
      abi.encodePacked(
        "{\"trait_type\":\"",
        name_,
        "\",\"value\":",
        value,
        "}"
      )
    );
  }

  function mapParam(uint16 value, uint256 min, uint256 max) internal pure returns (uint256) {
    return min + (uint256(value) * (max - min)) / SCALE;
  }

  function mapParamSigned(uint16 value, int256 min, int256 max) internal pure returns (int256) {
    return min + (int256(uint256(value)) * (max - min)) / int256(SCALE);
  }

  function toFixed(uint256 value, uint256 scale, uint256 decimals) internal pure returns (string memory) {
    uint256 base = 10 ** decimals;
    uint256 intPart = value / scale;
    uint256 fracPart = (value % scale) / (scale / base);
    return string(abi.encodePacked(toString(intPart), ".", padLeft(fracPart, decimals)));
  }

  function toFixedSigned(int256 value, uint256 scale, uint256 decimals) internal pure returns (string memory) {
    if (value >= 0) {
      return toFixed(uint256(value), scale, decimals);
    }
    return string(abi.encodePacked("-", toFixed(uint256(-value), scale, decimals)));
  }

  function padLeft(uint256 value, uint256 width) internal pure returns (string memory) {
    bytes memory raw = bytes(toString(value));
    if (raw.length >= width) {
      return string(raw);
    }
    bytes memory padded = new bytes(width);
    uint256 offset = width - raw.length;
    for (uint256 i = 0; i < offset; i++) {
      padded[i] = "0";
    }
    for (uint256 i = 0; i < raw.length; i++) {
      padded[offset + i] = raw[i];
    }
    return string(padded);
  }

  function toHexColor(uint24 value) internal pure returns (string memory) {
    bytes memory buffer = new bytes(7);
    buffer[0] = "#";
    uint24 temp = value;
    for (uint256 i = 0; i < 6; i++) {
      buffer[6 - i] = hexChar(uint8(temp & 0x0f));
      temp >>= 4;
    }
    return string(buffer);
  }

  function hexChar(uint8 value) internal pure returns (bytes1) {
    return value < 10 ? bytes1(value + 48) : bytes1(value + 87);
  }

  function toString(uint256 value) internal pure returns (string memory) {
    if (value == 0) {
      return "0";
    }
    uint256 temp = value;
    uint256 digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }
}

library Base64 {
  string internal constant TABLE_ENCODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function encode(bytes memory data) internal pure returns (string memory) {
    if (data.length == 0) return "";

    string memory table = TABLE_ENCODE;
    uint256 encodedLen = 4 * ((data.length + 2) / 3);

    string memory result = new string(encodedLen + 32);

    assembly {
      mstore(result, encodedLen)

      let tablePtr := add(table, 1)
      let dataPtr := data
      let endPtr := add(dataPtr, mload(data))
      let resultPtr := add(result, 32)

      for {} lt(dataPtr, endPtr) {}
      {
        dataPtr := add(dataPtr, 3)
        let input := mload(dataPtr)

        mstore8(resultPtr, mload(add(tablePtr, and(shr(18, input), 0x3F))))
        resultPtr := add(resultPtr, 1)
        mstore8(resultPtr, mload(add(tablePtr, and(shr(12, input), 0x3F))))
        resultPtr := add(resultPtr, 1)
        mstore8(resultPtr, mload(add(tablePtr, and(shr(6, input), 0x3F))))
        resultPtr := add(resultPtr, 1)
        mstore8(resultPtr, mload(add(tablePtr, and(input, 0x3F))))
        resultPtr := add(resultPtr, 1)
      }

      switch mod(mload(data), 3)
      case 1 {
        mstore8(sub(resultPtr, 1), 0x3d)
        mstore8(sub(resultPtr, 2), 0x3d)
      }
      case 2 {
        mstore8(sub(resultPtr, 1), 0x3d)
      }
    }

    return result;
  }
}
