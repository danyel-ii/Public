// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal on-chain SVG renderer for the paper sculpture state.
///         Packed data schema (bytes):
///         - uint32 baseSeed
///         - uint8 sceneIndex
///         - uint8[3] layerOrder
///         - uint24[3] layerColors
///         - uint32[3] layerSeeds (scaled by 1e6)
///         - uint16[3][7] layerParams
///           [grid, squareMix, holeProb, radius, panX, panY, scale]
library SculptureRenderer {
  uint256 internal constant VIEW = 1000;
  uint256 internal constant SCALE = 10000;
  uint256 internal constant FP = 1000000;
  uint256 internal constant GRID_MIN = 3;
  uint256 internal constant GRID_MAX = 22;

  uint256 internal constant HOLE_MIN_FP = 50000;    // 0.05 * FP
  uint256 internal constant HOLE_MAX_FP = 950000;   // 0.95 * FP
  uint256 internal constant RADIUS_MIN_FP = 180000; // 0.18 * FP
  uint256 internal constant RADIUS_MAX_FP = 600000; // 0.60 * FP
  int256 internal constant PAN_MIN_FP = -120000;    // -0.12 * FP
  int256 internal constant PAN_MAX_FP = 120000;     // 0.12 * FP
  uint256 internal constant SCALE_MIN_FP = 900000;  // 0.9 * FP
  uint256 internal constant SCALE_MAX_FP = 1100000; // 1.1 * FP

  int256 internal constant FP_I = 1000000;
  int256 internal constant HALF_FP_I = 500000;
  int256 internal constant CONST_33 = 33330000;     // 33.33 * FP

  struct State {
    uint32 baseSeed;
    uint8 sceneIndex;
    uint8[3] layerOrder;
    uint24[3] layerColors;
    uint32[3] layerSeeds;
    uint16[3][7] params;
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

    for (uint256 i = 0; i < 3; i++) {
      (state.layerSeeds[i], offset) = readUint32(data, offset);
    }

    for (uint256 layer = 0; layer < 3; layer++) {
      for (uint256 param = 0; param < 7; param++) {
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
        "</filter>",
        "<linearGradient id='paper-light' x1='0' y1='0' x2='1' y2='1'>",
        "<stop offset='0%' stop-color='#ffffff' stop-opacity='0.16'/>",
        "<stop offset='70%' stop-color='#000000' stop-opacity='0.12'/>",
        "<stop offset='100%' stop-color='#000000' stop-opacity='0.18'/>",
        "</linearGradient>"
      )
    );

    string[3] memory bevels;
    for (uint256 layer = 0; layer < 3; layer++) {
      (string memory mask, string memory bevel) = buildMask(state, layer);
      defs = string(abi.encodePacked(defs, mask));
      bevels[layer] = bevel;
    }
    defs = string(abi.encodePacked(defs, "</defs>"));

    string memory body = "";
    for (uint256 orderIndex = 3; orderIndex > 0; orderIndex--) {
      uint256 idx = orderIndex - 1;
      uint256 layerIndex = state.layerOrder[idx];
      string memory color = toHexColor(state.layerColors[layerIndex]);
      string memory offset = "0";
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
          "' fill='url(#paper-light)' opacity='0.18' mask='url(#mask-",
          toString(layerIndex),
          ")'/>",
          "<rect width='",
          toString(VIEW),
          "' height='",
          toString(VIEW),
          "' fill='white' filter='url(#paper-grain)' opacity='0.06' mask='url(#mask-",
          toString(layerIndex),
          ")'/>",
          bevels[layerIndex],
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

  function buildMask(State memory state, uint256 layerIndex) internal pure returns (string memory, string memory) {
    uint256 gridFp = mapParam(state.params[layerIndex][0], GRID_MIN * FP, GRID_MAX * FP);
    uint256 squareMixFp = mapParam(state.params[layerIndex][1], 0, FP);
    uint256 holeProbFp = mapParam(state.params[layerIndex][2], HOLE_MIN_FP, HOLE_MAX_FP);
    uint256 radiusFp = mapParam(state.params[layerIndex][3], RADIUS_MIN_FP, RADIUS_MAX_FP);
    int256 panX = mapParamSigned(state.params[layerIndex][4], PAN_MIN_FP, PAN_MAX_FP);
    int256 panY = mapParamSigned(state.params[layerIndex][5], PAN_MIN_FP, PAN_MAX_FP);
    uint256 scaleFp = mapParam(state.params[layerIndex][6], SCALE_MIN_FP, SCALE_MAX_FP);
    uint256 gridCount = gridFp / FP;
    if (gridFp % FP != 0) {
      gridCount += 1;
    }
    uint256 cellPx = (VIEW * FP) / gridFp;
    uint256 strokeWidth = cellPx / 16;
    if (strokeWidth < 1) {
      strokeWidth = 1;
    } else if (strokeWidth > 6) {
      strokeWidth = 6;
    }

    int256 seed = int256(uint256(state.layerSeeds[layerIndex]));
    int256 seed17 = (seed * 17) / 10;
    int256 seed29 = (seed * 29) / 10;
    int256 seed42 = (seed * 42) / 10;
    int256 seed53 = (seed * 53) / 10;

    string memory holes = "";
    string memory bevelShapes = "";
    for (uint256 y = 0; y < gridCount; y++) {
      for (uint256 x = 0; x < gridCount; x++) {
        int256 cellX = int256(x);
        int256 cellY = int256(y);
        uint256 roll = hash12(cellX * FP_I + seed, cellY * FP_I + seed);
        if (roll > holeProbFp) {
          continue;
        }

        int256 jitterX = int256(hash12(cellX * FP_I + seed17, cellY * FP_I + seed17));
        jitterX = (jitterX - HALF_FP_I) * 35 / 100;
        int256 jitterY = int256(hash12(cellX * FP_I + seed29, cellY * FP_I + seed29));
        jitterY = (jitterY - HALF_FP_I) * 35 / 100;

        bool perCellPick = hash12(cellX * FP_I + seed53, cellY * FP_I + seed53) >= uint256(HALF_FP_I);
        uint256 mixAmt = (squareMixFp * 4) / 10 + (perCellPick ? (FP * 6) / 10 : 0);

        uint256 rand = hash12(cellX * FP_I + seed42, cellY * FP_I + seed42);
        uint256 baseR = (radiusFp * 60) / 100;
        uint256 randR = (radiusFp * 50) / 100;
        uint256 r = baseR + (randR * rand) / FP;
        uint256 corner = (r * (FP - mixAmt)) / FP;

        int256 uvCenterX = ((cellX * FP_I + HALF_FP_I + jitterX) * FP_I) / int256(gridFp);
        int256 uvCenterY = ((cellY * FP_I + HALF_FP_I + jitterY) * FP_I) / int256(gridFp);

        int256 baseUvX = ((uvCenterX - HALF_FP_I - panX) * FP_I) / int256(scaleFp) + HALF_FP_I;
        int256 baseUvY = ((uvCenterY - HALF_FP_I - panY) * FP_I) / int256(scaleFp) + HALF_FP_I;
        baseUvX = clampSigned(baseUvX, 0, FP_I);
        baseUvY = clampSigned(baseUvY, 0, FP_I);

        int256 cx = (baseUvX * int256(VIEW)) / FP_I;
        int256 cy = int256(VIEW) - (baseUvY * int256(VIEW)) / FP_I;
        uint256 rPx = (r * FP * VIEW) / (gridFp * scaleFp);
        if (rPx == 0) {
          rPx = 1;
        }
        uint256 cornerPx = (corner * FP * VIEW) / (gridFp * scaleFp);
        uint256 size = rPx * 2;

        string memory rectShape = string(
          abi.encodePacked(
            "<rect x='",
            toStringSigned(cx - int256(rPx)),
            "' y='",
            toStringSigned(cy - int256(rPx)),
            "' width='",
            toString(size),
            "' height='",
            toString(size),
            "' rx='",
            toString(cornerPx),
            "' ry='",
            toString(cornerPx),
            "'"
          )
        );
        holes = string(abi.encodePacked(holes, rectShape, " fill='black'/>"));
        bevelShapes = string(abi.encodePacked(bevelShapes, rectShape, "/>"));
      }
    }

    string memory mask = string(
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

    string memory bevel = string(
      abi.encodePacked(
        "<g mask='url(#mask-",
        toString(layerIndex),
        ")' opacity='0.55'>",
        "<g transform='translate(-1 -1)' fill='none' stroke='rgba(255,255,255,0.22)' stroke-width='",
        toString(strokeWidth),
        "' stroke-linejoin='round'>",
        bevelShapes,
        "</g>",
        "<g transform='translate(1 1)' fill='none' stroke='rgba(0,0,0,0.25)' stroke-width='",
        toString(strokeWidth),
        "' stroke-linejoin='round'>",
        bevelShapes,
        "</g>",
        "</g>"
      )
    );

    return (mask, bevel);
  }

  function hash12(int256 x, int256 y) internal pure returns (uint256) {
    int256 p3x = fract((x * 1031) / 10000);
    int256 p3y = fract((y * 1031) / 10000);
    int256 p3z = p3x;
    int256 dot = (p3x * (p3y + CONST_33) + p3y * (p3z + CONST_33) + p3z * (p3x + CONST_33)) / FP_I;
    p3x += dot;
    p3y += dot;
    p3z += dot;
    int256 prod = ((p3x + p3y) * p3z) / FP_I;
    return uint256(fract(prod));
  }

  function fract(int256 value) internal pure returns (int256) {
    int256 m = value % FP_I;
    if (m < 0) {
      m += FP_I;
    }
    return m;
  }

  function mapParam(uint16 value, uint256 min, uint256 max) internal pure returns (uint256) {
    return min + (uint256(value) * (max - min)) / SCALE;
  }

  function mapParamSigned(uint16 value, int256 min, int256 max) internal pure returns (int256) {
    return min + (int256(uint256(value)) * (max - min)) / int256(SCALE);
  }

  function clampSigned(int256 value, int256 min, int256 max) internal pure returns (int256) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
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
