// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal on-chain SVG renderer for the paper sculpture state.
///         Packed data schema (bytes):
///         - uint32 baseSeed
///         - uint8 sceneIndex
///         - uint8[3] layerOrder
///         - uint24[3] layerColors
///         - uint16[3][6] layerParams
///           [grid, squareMix, holeProb, radius, panX, panY]
library SculptureRenderer {
  uint256 internal constant VIEW = 1000;
  uint256 internal constant SCALE = 1000;
  uint256 internal constant GRID_MIN = 3;
  uint256 internal constant GRID_MAX = 10;

  uint256 internal constant HOLE_MIN = 50;   // 0.05 * SCALE
  uint256 internal constant HOLE_MAX = 950;  // 0.95 * SCALE
  uint256 internal constant RADIUS_MIN = 120; // 0.12 * SCALE
  uint256 internal constant RADIUS_MAX = 450; // 0.45 * SCALE
  int256 internal constant PAN_MIN = -120;   // -0.12 * SCALE
  int256 internal constant PAN_MAX = 120;    // 0.12 * SCALE

  struct State {
    uint32 baseSeed;
    uint8 sceneIndex;
    uint8[3] layerOrder;
    uint24[3] layerColors;
    uint16[3][6] params;
  }

  function render(bytes memory data) internal pure returns (string memory) {
    State memory state = decode(data);
    return renderSvg(state);
  }

  function decode(bytes memory data) internal pure returns (State memory state) {
    uint256 offset = 0;
    (state.baseSeed, offset) = readUint32(data, offset);
    (state.sceneIndex, offset) = readUint8(data, offset);

    for (uint256 i = 0; i < 3; i++) {
      (state.layerOrder[i], offset) = readUint8(data, offset);
    }

    for (uint256 i = 0; i < 3; i++) {
      (state.layerColors[i], offset) = readUint24(data, offset);
    }

    for (uint256 layer = 0; layer < 3; layer++) {
      for (uint256 param = 0; param < 6; param++) {
        (state.params[layer][param], offset) = readUint16(data, offset);
      }
    }
  }

  function renderSvg(State memory state) internal pure returns (string memory) {
    string memory defs = string(
      abi.encodePacked(
        "<defs>",
        "<filter id='paper-shadow' x='-20%' y='-20%' width='160%' height='160%'>",
        "<feDropShadow dx='0' dy='12' stdDeviation='18' flood-color='rgba(0,0,0,0.35)'/>",
        "</filter>",
        "<filter id='paper-grain' x='-10%' y='-10%' width='120%' height='120%'>",
        "<feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='1' seed='2'/>",
        "<feColorMatrix type='saturate' values='0'/>",
        "<feComponentTransfer><feFuncA type='table' tableValues='0 0.12'/></feComponentTransfer>",
        "</filter>"
      )
    );

    for (uint256 layer = 0; layer < 3; layer++) {
      defs = string(abi.encodePacked(defs, buildMask(state, layer)));
    }
    defs = string(abi.encodePacked(defs, "</defs>"));

    string memory body = "";
    for (uint256 orderIndex = 0; orderIndex < 3; orderIndex++) {
      uint256 layerIndex = state.layerOrder[orderIndex];
      string memory color = toHexColor(state.layerColors[layerIndex]);
      string memory offset = toString(orderIndex * 14);
      body = string(
        abi.encodePacked(
          body,
          "<g transform='translate(",
          offset,
          " ",
          offset,
          ")' filter='url(#paper-shadow)'>",
          "<rect width='",
          toString(VIEW),
          "' height='",
          toString(VIEW),
          "' fill='",
          color,
          "' mask='url(#mask-",
          toString(layerIndex),
          ")'/>",
          "<rect width='",
          toString(VIEW),
          "' height='",
          toString(VIEW),
          "' fill='white' filter='url(#paper-grain)' opacity='0.06'/>",
          "</g>"
        )
      );
    }

    return string(
      abi.encodePacked(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ",
        toString(VIEW),
        " ",
        toString(VIEW),
        "'>",
        defs,
        "<rect width='",
        toString(VIEW),
        "' height='",
        toString(VIEW),
        "' fill='#0b1220'/>",
        body,
        "</svg>"
      )
    );
  }

  function buildMask(State memory state, uint256 layerIndex) internal pure returns (string memory) {
    uint256 grid = clamp(state.params[layerIndex][0], GRID_MIN, GRID_MAX);
    uint256 cell = VIEW / grid;
    uint256 squareMix = clamp(state.params[layerIndex][1], 0, SCALE);
    uint256 holeProb = HOLE_MIN + (uint256(state.params[layerIndex][2]) * (HOLE_MAX - HOLE_MIN)) / SCALE;
    uint256 radius = RADIUS_MIN + (uint256(state.params[layerIndex][3]) * (RADIUS_MAX - RADIUS_MIN)) / SCALE;
    int256 panX = PAN_MIN + (int256(uint256(state.params[layerIndex][4])) * (PAN_MAX - PAN_MIN)) / int256(SCALE);
    int256 panY = PAN_MIN + (int256(uint256(state.params[layerIndex][5])) * (PAN_MAX - PAN_MIN)) / int256(SCALE);

    string memory holes = "";
    for (uint256 y = 0; y < grid; y++) {
      for (uint256 x = 0; x < grid; x++) {
        uint256 roll = uint256(keccak256(abi.encodePacked(state.baseSeed, layerIndex, x, y, uint256(0)))) % SCALE;
        if (roll >= holeProb) {
          continue;
        }
        uint256 shapeRoll = uint256(keccak256(abi.encodePacked(state.baseSeed, layerIndex, x, y, uint256(1)))) % SCALE;
        int256 cx = int256(x * cell + cell / 2) + (panX * int256(cell)) / int256(SCALE);
        int256 cy = int256(y * cell + cell / 2) + (panY * int256(cell)) / int256(SCALE);
        uint256 r = (cell * radius) / SCALE;
        if (shapeRoll < squareMix) {
          holes = string(
            abi.encodePacked(
              holes,
              "<rect x='",
              toStringSigned(cx - int256(r)),
              "' y='",
              toStringSigned(cy - int256(r)),
              "' width='",
              toString(r * 2),
              "' height='",
              toString(r * 2),
              "' fill='black'/>"
            )
          );
        } else {
          holes = string(
            abi.encodePacked(
              holes,
              "<circle cx='",
              toStringSigned(cx),
              "' cy='",
              toStringSigned(cy),
              "' r='",
              toString(r),
              "' fill='black'/>"
            )
          );
        }
      }
    }

    return string(
      abi.encodePacked(
        "<mask id='mask-",
        toString(layerIndex),
        "' maskUnits='userSpaceOnUse'>",
        "<rect width='",
        toString(VIEW),
        "' height='",
        toString(VIEW),
        "' fill='white'/>",
        holes,
        "</mask>"
      )
    );
  }

  function readUint8(bytes memory data, uint256 offset) internal pure returns (uint8 value, uint256 next) {
    require(offset + 1 <= data.length, "EOF");
    value = uint8(data[offset]);
    next = offset + 1;
  }

  function readUint16(bytes memory data, uint256 offset) internal pure returns (uint16 value, uint256 next) {
    require(offset + 2 <= data.length, "EOF");
    value = (uint16(uint8(data[offset])) << 8) | uint16(uint8(data[offset + 1]));
    next = offset + 2;
  }

  function readUint24(bytes memory data, uint256 offset) internal pure returns (uint24 value, uint256 next) {
    require(offset + 3 <= data.length, "EOF");
    value =
      (uint24(uint8(data[offset])) << 16) |
      (uint24(uint8(data[offset + 1])) << 8) |
      uint24(uint8(data[offset + 2]));
    next = offset + 3;
  }

  function readUint32(bytes memory data, uint256 offset) internal pure returns (uint32 value, uint256 next) {
    require(offset + 4 <= data.length, "EOF");
    value =
      (uint32(uint8(data[offset])) << 24) |
      (uint32(uint8(data[offset + 1])) << 16) |
      (uint32(uint8(data[offset + 2])) << 8) |
      uint32(uint8(data[offset + 3]));
    next = offset + 4;
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

  function toStringSigned(int256 value) internal pure returns (string memory) {
    if (value >= 0) {
      return toString(uint256(value));
    }
    return string(abi.encodePacked("-", toString(uint256(-value))));
  }

  function clamp(uint256 value, uint256 min, uint256 max) internal pure returns (uint256) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }
}
