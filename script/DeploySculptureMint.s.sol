// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { SculptureMint } from "../contracts/SculptureMint.sol";

interface Vm {
  function envUint(string calldata key) external returns (uint256);
  function envAddress(string calldata key) external returns (address);
  function envOr(string calldata key, uint256 defaultValue) external returns (uint256);
  function envOr(string calldata key, address defaultValue) external returns (address);
  function envOr(string calldata key, string calldata defaultValue) external returns (string memory);
  function startBroadcast() external;
  function startBroadcast(uint256 privateKey) external;
  function stopBroadcast() external;
}

/// @notice Foundry deployment script for SculptureMint on Base.
contract DeploySculptureMint {
  error MissingFeeRecipient();

  Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  event Deployed(address indexed contractAddress, address indexed feeRecipient, uint256 mintPriceWei);

  function run() external returns (SculptureMint deployed) {
    uint256 deployerKey = vm.envOr("BASE_DEPLOYER_PRIVATE_KEY", uint256(0));
    if (deployerKey == 0) {
      deployerKey = vm.envOr("BASE_DEPLOYER_KEY", uint256(0));
    }
    address feeRecipient = vm.envOr("EARNS_KEY", address(0));
    if (feeRecipient == address(0)) {
      revert MissingFeeRecipient();
    }

    uint256 mintPriceWei = 0.00036 ether;
    string memory gatewayBaseUri = normalizeGateway(
      vm.envOr("PINATA_GATEWAY_URL", string(""))
    );

    if (deployerKey == 0) {
      vm.startBroadcast();
    } else {
      vm.startBroadcast(deployerKey);
    }

    deployed = new SculptureMint(
      "sculpture",
      "SCULPT",
      feeRecipient,
      mintPriceWei,
      gatewayBaseUri
    );

    vm.stopBroadcast();
    emit Deployed(address(deployed), feeRecipient, mintPriceWei);
  }

  function normalizeGateway(string memory raw) internal pure returns (string memory) {
    if (bytes(raw).length == 0) {
      return "";
    }
    string memory gateway = raw;
    if (!contains(bytes(gateway), bytes("://"))) {
      gateway = string.concat("https://", gateway);
    }
    if (!contains(bytes(gateway), bytes("/ipfs"))) {
      if (!endsWithSlash(gateway)) {
        gateway = string.concat(gateway, "/");
      }
      gateway = string.concat(gateway, "ipfs/");
      return gateway;
    }
    if (!endsWithSlash(gateway)) {
      gateway = string.concat(gateway, "/");
    }
    return gateway;
  }

  function endsWithSlash(string memory value) internal pure returns (bool) {
    bytes memory data = bytes(value);
    if (data.length == 0) {
      return false;
    }
    return data[data.length - 1] == bytes1("/");
  }

  function contains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
    if (needle.length == 0) {
      return true;
    }
    if (haystack.length < needle.length) {
      return false;
    }
    for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
      bool matchFound = true;
      for (uint256 j = 0; j < needle.length; j++) {
        if (haystack[i + j] != needle[j]) {
          matchFound = false;
          break;
        }
      }
      if (matchFound) {
        return true;
      }
    }
    return false;
  }
}
