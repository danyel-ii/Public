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

  error AlreadyOwner();
  error AlreadyMinted(uint256 tokenId);
  error FeeTransferFailed();
  error IncorrectOwner();
  error InsufficientBalance(uint256 available, uint256 required);
  error MetadataFrozen();
  error MintPaused();
  error MintPriceNotMet(uint256 required, uint256 provided);
  error EmptyAnimationUri();
  error EmptyMetadataUri();
  error EmptyRasterUri();
  error NotApproved();
  error NotMinted(uint256 tokenId);
  error NotOwner();
  error Reentrancy();
  error SelfApproval();
  error UnsafeReceiver();
  error ZeroAddress();

  event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
  event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
  event IpfsBaseUriUpdated(string previousUri, string newUri);
  event IpfsMetadataToggled(bool enabled);
  event AnimationUriStored(uint256 indexed tokenId, string uri);
  event MetadataUriStored(uint256 indexed tokenId, string uri);
  event MetadataFrozenSet();
  event MintPausedSet(bool paused);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
  event RasterUriStored(uint256 indexed tokenId, string uri);
  event StrictSvgSet(bool enabled);
  event Withdrawal(address indexed to, uint256 amount);
  event MintPriceUpdated(uint256 previousPrice, uint256 newPrice);

  string public name;
  string public symbol;

  uint256 public totalSupply;
  uint256 public mintPriceWei;
  address payable public feeRecipient;
  address public owner;

  bool public mintPaused;
  bool public metadataFrozen;

  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;
  uint256 private _status = _NOT_ENTERED;

  mapping(uint256 => address) private _owners;
  mapping(address => uint256) private _balances;
  mapping(uint256 => address) private _tokenApprovals;
  mapping(address => mapping(address => bool)) private _operatorApprovals;
  mapping(uint256 => bytes) private _packedState;
  mapping(uint256 => string) private _rasterUri;
  mapping(uint256 => string) private _animationUri;
  mapping(uint256 => string) private _metadataUri;

  uint256 private constant LAYER_COUNT = 3;
  uint256 private constant PARAM_COUNT = 7;
  uint256 private constant SCALE = 10000;
  uint256 private constant FP = 1000000;
  uint256 private constant SEED_SCALE = 1000000;
  uint256 private constant GRID_MIN_FP = 3000000;
  uint256 private constant GRID_MAX_FP = 22000000;
  uint256 private constant HOLE_MIN_FP = 50000;
  uint256 private constant HOLE_MAX_FP = 950000;
  uint256 private constant RADIUS_MIN_FP = 180000;
  uint256 private constant RADIUS_MAX_FP = 600000;
  int256 private constant PAN_MIN_FP = -120000;
  int256 private constant PAN_MAX_FP = 120000;
  uint256 private constant SCALE_MIN_FP = 900000;
  uint256 private constant SCALE_MAX_FP = 1100000;
  string private constant IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

  bool public strictSvg;

  bool public useIpfsMetadata;
  string public ipfsBaseUri;

  modifier onlyOwner() {
    if (msg.sender != owner) {
      revert NotOwner();
    }
    _;
  }

  modifier nonReentrant() {
    if (_status == _ENTERED) {
      revert Reentrancy();
    }
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
  }

  constructor(
    string memory name_,
    string memory symbol_,
    address feeRecipient_,
    uint256 mintPriceWei_
  ) {
    if (feeRecipient_ == address(0)) {
      revert ZeroAddress();
    }
    name = name_;
    symbol = symbol_;
    owner = msg.sender;
    feeRecipient = payable(feeRecipient_);
    mintPriceWei = mintPriceWei_;
    strictSvg = false;
    emit OwnershipTransferred(address(0), msg.sender);
  }

  function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
    return
      interfaceId == 0x01ffc9a7 || // ERC165
      interfaceId == 0x80ac58cd || // ERC721
      interfaceId == 0x5b5e139f;   // ERC721Metadata
  }

  function balanceOf(address account) public view returns (uint256) {
    if (account == address(0)) {
      revert ZeroAddress();
    }
    return _balances[account];
  }

  function ownerOf(uint256 tokenId) public view returns (address) {
    address tokenOwner = _owners[tokenId];
    if (tokenOwner == address(0)) {
      revert NotMinted(tokenId);
    }
    return tokenOwner;
  }

  function approve(address to, uint256 tokenId) public {
    address tokenOwner = ownerOf(tokenId);
    if (to == tokenOwner) {
      revert AlreadyOwner();
    }
    if (msg.sender != tokenOwner && !isApprovedForAll(tokenOwner, msg.sender)) {
      revert NotApproved();
    }
    _tokenApprovals[tokenId] = to;
    emit Approval(tokenOwner, to, tokenId);
  }

  function getApproved(uint256 tokenId) public view returns (address) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    return _tokenApprovals[tokenId];
  }

  function setApprovalForAll(address operator, bool approved) public {
    if (operator == msg.sender) {
      revert SelfApproval();
    }
    _operatorApprovals[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function isApprovedForAll(address account, address operator) public view returns (bool) {
    return _operatorApprovals[account][operator];
  }

  function transferFrom(address from, address to, uint256 tokenId) public {
    if (!_isApprovedOrOwner(msg.sender, tokenId)) {
      revert NotApproved();
    }
    if (ownerOf(tokenId) != from) {
      revert IncorrectOwner();
    }
    if (to == address(0)) {
      revert ZeroAddress();
    }
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
    if (!_checkOnERC721Received(msg.sender, from, to, tokenId, data)) {
      revert UnsafeReceiver();
    }
  }

  function mint(bytes calldata packed) external payable nonReentrant returns (uint256 tokenId) {
    tokenId = _mintPacked(packed, "", "", "");
  }

  function mintWithImage(
    bytes calldata packed,
    string calldata rasterUri
  ) external payable nonReentrant returns (uint256 tokenId) {
    if (bytes(rasterUri).length == 0) {
      revert EmptyRasterUri();
    }
    tokenId = _mintPacked(packed, rasterUri, "", "");
  }

  function mintWithMedia(
    bytes calldata packed,
    string calldata rasterUri,
    string calldata animationUri
  ) external payable nonReentrant returns (uint256 tokenId) {
    if (bytes(rasterUri).length == 0) {
      revert EmptyRasterUri();
    }
    if (bytes(animationUri).length == 0) {
      revert EmptyAnimationUri();
    }
    tokenId = _mintPacked(packed, rasterUri, animationUri, "");
  }

  function mintWithMetadata(
    bytes calldata packed,
    string calldata rasterUri,
    string calldata animationUri,
    string calldata metadataUri
  ) external payable nonReentrant returns (uint256 tokenId) {
    if (bytes(rasterUri).length == 0) {
      revert EmptyRasterUri();
    }
    if (bytes(animationUri).length == 0) {
      revert EmptyAnimationUri();
    }
    if (bytes(metadataUri).length == 0) {
      revert EmptyMetadataUri();
    }
    tokenId = _mintPacked(packed, rasterUri, animationUri, metadataUri);
  }

  function _mintPacked(
    bytes calldata packed,
    string memory rasterUri,
    string memory animationUri,
    string memory metadataUri
  ) internal returns (uint256 tokenId) {
    if (mintPaused) {
      revert MintPaused();
    }
    packed.validatePackedState();
    if (msg.value < mintPriceWei) {
      revert MintPriceNotMet(mintPriceWei, msg.value);
    }
    tokenId = totalSupply + 1;
    _packedState[tokenId] = packed;
    if (bytes(rasterUri).length > 0) {
      _rasterUri[tokenId] = rasterUri;
      emit RasterUriStored(tokenId, rasterUri);
    }
    if (bytes(animationUri).length > 0) {
      _animationUri[tokenId] = animationUri;
      emit AnimationUriStored(tokenId, animationUri);
    }
    if (bytes(metadataUri).length > 0) {
      _metadataUri[tokenId] = metadataUri;
      emit MetadataUriStored(tokenId, metadataUri);
    }
    totalSupply = tokenId;
    _safeMint(msg.sender, tokenId, "");
    _payout(msg.value);
  }

  function getPackedState(uint256 tokenId) external view returns (bytes memory) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    return _packedState[tokenId];
  }

  function getRasterUri(uint256 tokenId) external view returns (string memory) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    return _rasterUri[tokenId];
  }

  function getAnimationUri(uint256 tokenId) external view returns (string memory) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    return _animationUri[tokenId];
  }

  function getMetadataUri(uint256 tokenId) external view returns (string memory) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    return _metadataUri[tokenId];
  }

  function tokenURI(uint256 tokenId) public view returns (string memory) {
    if (!_exists(tokenId)) {
      revert NotMinted(tokenId);
    }
    string memory metadataUri = _metadataUri[tokenId];
    if (bytes(metadataUri).length > 0) {
      return resolveGateway(metadataUri);
    }
    if (useIpfsMetadata && bytes(ipfsBaseUri).length > 0) {
      return string(abi.encodePacked(ipfsBaseUri, toString(tokenId)));
    }
    bytes memory packed = _packedState[tokenId];
    SculptureRenderer.State memory state = SculptureRenderer.decode(packed);
    string memory json = buildTokenJson(
      state,
      _rasterUri[tokenId],
      _animationUri[tokenId],
      toString(tokenId)
    );

    return string(
      abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json)))
    );
  }

  function previewMetadata(
    bytes calldata packed,
    string calldata rasterUri,
    string calldata animationUri
  ) external view returns (string memory) {
    SculptureRenderer.State memory state = SculptureRenderer.decode(packed);
    return buildTokenJson(state, rasterUri, animationUri, "preview");
  }

  function setMintPriceWei(uint256 newPriceWei) external onlyOwner {
    emit MintPriceUpdated(mintPriceWei, newPriceWei);
    mintPriceWei = newPriceWei;
  }

  function setFeeRecipient(address recipient) external onlyOwner {
    if (recipient == address(0)) {
      revert ZeroAddress();
    }
    emit FeeRecipientUpdated(feeRecipient, recipient);
    feeRecipient = payable(recipient);
  }

  function setIpfsBaseUri(string calldata uri) external onlyOwner {
    if (metadataFrozen) {
      revert MetadataFrozen();
    }
    emit IpfsBaseUriUpdated(ipfsBaseUri, uri);
    ipfsBaseUri = uri;
  }

  function setUseIpfsMetadata(bool enabled) external onlyOwner {
    if (metadataFrozen) {
      revert MetadataFrozen();
    }
    emit IpfsMetadataToggled(enabled);
    useIpfsMetadata = enabled;
  }

  function setStrictSvg(bool enabled) external onlyOwner {
    if (metadataFrozen) {
      revert MetadataFrozen();
    }
    strictSvg = enabled;
    emit StrictSvgSet(enabled);
  }

  function setMintPaused(bool paused) external onlyOwner {
    mintPaused = paused;
    emit MintPausedSet(paused);
  }

  function freezeMetadata() external onlyOwner {
    if (metadataFrozen) {
      revert MetadataFrozen();
    }
    metadataFrozen = true;
    emit MetadataFrozenSet();
  }

  function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) {
      revert ZeroAddress();
    }
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
    if (to == address(0)) {
      revert ZeroAddress();
    }
    uint256 balance = address(this).balance;
    if (amount > balance) {
      revert InsufficientBalance(balance, amount);
    }
    (bool ok, ) = payable(to).call{ value: amount }("");
    if (!ok) {
      revert FeeTransferFailed();
    }
    emit Withdrawal(to, amount);
  }

  function _safeMint(address to, uint256 tokenId, bytes memory data) internal {
    _mint(to, tokenId);
    if (!_checkOnERC721Received(msg.sender, address(0), to, tokenId, data)) {
      revert UnsafeReceiver();
    }
  }

  function _mint(address to, uint256 tokenId) internal {
    if (to == address(0)) {
      revert ZeroAddress();
    }
    if (_exists(tokenId)) {
      revert AlreadyMinted(tokenId);
    }
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
    if (amount == 0) {
      return;
    }
    if (feeRecipient == address(0)) {
      revert ZeroAddress();
    }
    (bool ok, ) = feeRecipient.call{ value: amount }("");
    if (!ok) {
      revert FeeTransferFailed();
    }
  }

  function buildAttributes(SculptureRenderer.State memory state) internal pure returns (string memory) {
    string memory attrs = string(
      abi.encodePacked(
        "[",
        traitNumber("Base Seed", toString(state.baseSeed))
      )
    );
    attrs = string(abi.encodePacked(attrs, ",", traitNumber("Scene Index", toString(state.sceneIndex))));
    attrs = string(abi.encodePacked(attrs, ",", traitNumber("Order 1", toString(state.layerOrder[0]))));
    attrs = string(abi.encodePacked(attrs, ",", traitNumber("Order 2", toString(state.layerOrder[1]))));
    attrs = string(abi.encodePacked(attrs, ",", traitNumber("Order 3", toString(state.layerOrder[2]))));
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 1 Color R", toString(uint256(uint8(state.layerColors[0] >> 16))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 1 Color G", toString(uint256(uint8(state.layerColors[0] >> 8))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 1 Color B", toString(uint256(uint8(state.layerColors[0])))
        )
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 2 Color R", toString(uint256(uint8(state.layerColors[1] >> 16))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 2 Color G", toString(uint256(uint8(state.layerColors[1] >> 8))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 2 Color B", toString(uint256(uint8(state.layerColors[1])))
        )
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 3 Color R", toString(uint256(uint8(state.layerColors[2] >> 16))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 3 Color G", toString(uint256(uint8(state.layerColors[2] >> 8))))
      )
    );
    attrs = string(
      abi.encodePacked(
        attrs,
        ",",
        traitNumber("Layer 3 Color B", toString(uint256(uint8(state.layerColors[2])))
        )
      )
    );

    for (uint256 i = 0; i < LAYER_COUNT; i++) {
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
          traitNumber(layerTrait("Seed", i), toFixed(uint256(state.layerSeeds[i]), SEED_SCALE, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Grid", i), toFixed(grid, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Square Mix", i), toFixed(squareMix, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Hole Prob", i), toFixed(holeProb, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Radius", i), toFixed(radius, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Pan X", i), toFixedSigned(panX, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Pan Y", i), toFixedSigned(panY, FP, 3))
        )
      );
      attrs = string(
        abi.encodePacked(
          attrs,
          ",",
          traitNumber(layerTrait("Scale", i), toFixed(scale, FP, 3))
        )
      );
    }

    return string(abi.encodePacked(attrs, "]"));
  }

  function buildTokenJson(
    SculptureRenderer.State memory state,
    string memory rasterUri,
    string memory animationUri,
    string memory nameSuffix
  ) internal view returns (string memory) {
    string memory preview = SculptureRenderer.renderSvgPreview(state);
    string memory fullSvg = SculptureRenderer.renderSvg(state);
    string memory svgForMetadata = strictSvg ? preview : fullSvg;
    string memory image = bytes(rasterUri).length > 0
      ? resolveGateway(rasterUri)
      : string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(preview))));
    string memory animationUrl = bytes(animationUri).length > 0
      ? resolveGateway(animationUri)
      : string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svgForMetadata))));
    string memory attrs = buildAttributes(state);
    return string(
      abi.encodePacked(
        "{",
        "\"name\":\"sculpture",
        nameSuffix,
        "\",",
        "\"image\":\"",
        image,
        "\",",
        "\"image_raster\":\"",
        rasterUri,
        "\",",
        "\"image_data\":\"",
        svgForMetadata,
        "\",",
        "\"animation_url\":\"",
        animationUrl,
        "\",",
        "\"attributes\":",
        attrs,
        "}"
      )
    );
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
    uint16[PARAM_COUNT] memory params = state.params[layerIndex];
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

  function resolveGateway(string memory uri) internal pure returns (string memory) {
    bytes memory uriBytes = bytes(uri);
    bytes memory prefix = bytes("ipfs://");
    if (uriBytes.length < prefix.length) {
      return uri;
    }
    for (uint256 i = 0; i < prefix.length; i++) {
      if (uriBytes[i] != prefix[i]) {
        return uri;
      }
    }
    bytes memory suffix = new bytes(uriBytes.length - prefix.length);
    for (uint256 i = prefix.length; i < uriBytes.length; i++) {
      suffix[i - prefix.length] = uriBytes[i];
    }
    return string(abi.encodePacked(IPFS_GATEWAY, suffix));
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
    // slither-disable-next-line divide-before-multiply
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
