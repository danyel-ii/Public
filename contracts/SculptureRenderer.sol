// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal on-chain SVG renderer for the paper sculpture state.
///         Packed data schema (bytes):
///         - uint32 baseSeed
///         - uint8 sceneIndex
///         - uint8[3] layerOrder
///         - uint24[3] layerColors
///         - uint32[3] layerSeeds (scaled by 1e6)
///         - uint16[7][3] layerParams
///           [grid, squareMix, holeProb, radius, panX, panY, scale]
///         (stored as params[layerIndex][paramIndex])
library SculptureRenderer {
  error InvalidPackedLength(uint256 expected, uint256 actual);
  error DuplicateLayerOrder(uint8 value);
  error InvalidLayerOrder(uint256 index, uint8 value);
  error InvalidParamValue(uint256 layer, uint256 param, uint16 value);

  uint256 internal constant VIEW = 1000;
  uint256 internal constant LAYER_COUNT = 3;
  uint256 internal constant PARAM_COUNT = 7;
  uint256 internal constant PACKED_LENGTH = 29 + (LAYER_COUNT * PARAM_COUNT * 2);
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
    uint8[LAYER_COUNT] layerOrder;
    uint24[LAYER_COUNT] layerColors;
    uint32[LAYER_COUNT] layerSeeds;
    uint16[PARAM_COUNT][LAYER_COUNT] params;
  }

  struct MaskConfig {
    uint256 gridFp;
    uint256 squareMixFp;
    uint256 holeProbFp;
    uint256 radiusFp;
    int256 panX;
    int256 panY;
    uint256 scaleFp;
    uint256 gridCount;
    uint256 strokeWidth;
    int256 seed;
    int256 seed17;
    int256 seed29;
    int256 seed42;
    int256 seed53;
  }

  function render(bytes memory data) internal pure returns (string memory) {
    State memory state = decode(data);
    return renderSvg(state);
  }

  function decode(bytes memory data) internal pure returns (State memory state) {
    validatePacked(data);
    uint256 offset = 0;
    (state.baseSeed, offset) = readUint32(data, offset);
    (state.sceneIndex, offset) = readUint8(data, offset);

    for (uint256 i = 0; i < LAYER_COUNT; i++) {
      (state.layerOrder[i], offset) = readUint8(data, offset);
    }

    for (uint256 i = 0; i < LAYER_COUNT; i++) {
      (state.layerColors[i], offset) = readUint24(data, offset);
    }

    for (uint256 i = 0; i < LAYER_COUNT; i++) {
      (state.layerSeeds[i], offset) = readUint32(data, offset);
    }

    for (uint256 layer = 0; layer < LAYER_COUNT; layer++) {
      for (uint256 param = 0; param < PARAM_COUNT; param++) {
        (state.params[layer][param], offset) = readUint16(data, offset);
      }
    }

    validateState(state);
  }

  function renderSvg(State memory state) internal pure returns (string memory) {
    string memory viewStr = toString(VIEW);
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
    defs = string(
      abi.encodePacked(
        defs,
        "<linearGradient id='paper-light' x1='0' y1='0' x2='1' y2='1'>",
        "<stop offset='0%' stop-color='#ffffff' stop-opacity='0.16'/>",
        "<stop offset='70%' stop-color='#000000' stop-opacity='0.12'/>",
        "<stop offset='100%' stop-color='#000000' stop-opacity='0.18'/>",
        "</linearGradient>"
      )
    );

    string[LAYER_COUNT] memory bevels = ["", "", ""];
    for (uint256 layer = 0; layer < LAYER_COUNT; layer++) {
      (string memory mask, string memory bevel) = buildMask(state, layer);
      defs = string(abi.encodePacked(defs, mask));
      bevels[layer] = bevel;
    }
    defs = string(abi.encodePacked(defs, "</defs>"));

    string memory body = "";
    for (uint256 orderIndex = LAYER_COUNT; orderIndex > 0; orderIndex--) {
      uint256 idx = orderIndex - 1;
      uint256 layerIndex = state.layerOrder[idx];
      string memory color = toHexColor(state.layerColors[layerIndex]);
      body = string(
        abi.encodePacked(
          body,
          renderLayerGroup(layerIndex, viewStr, color, bevels[layerIndex])
        )
      );
    }

    return string(
      abi.encodePacked(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ",
        viewStr,
        " ",
        viewStr,
        "'>",
        defs,
        "<rect width='",
        viewStr,
        "' height='",
        viewStr,
        "' fill='#0b1220'/>",
        body,
        "</svg>"
      )
    );
  }

  function renderSvgPreview(State memory state) internal pure returns (string memory) {
    string memory viewStr = toString(VIEW);
    string memory body = "";
    for (uint256 orderIndex = LAYER_COUNT; orderIndex > 0; orderIndex--) {
      uint256 idx = orderIndex - 1;
      uint256 layerIndex = state.layerOrder[idx];
      string memory color = toHexColor(state.layerColors[layerIndex]);
      MaskConfig memory cfg = buildMaskConfig(state, layerIndex);
      (, string memory shapes) = buildShapes(cfg);
      body = string(abi.encodePacked(body, renderPreviewLayer(viewStr, color, shapes)));
    }

    return string(
      abi.encodePacked(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ",
        viewStr,
        " ",
        viewStr,
        "'>",
        "<rect width='",
        viewStr,
        "' height='",
        viewStr,
        "' fill='#0b1220'/>",
        body,
        "</svg>"
      )
    );
  }

  function renderLayerGroup(
    uint256 layerIndex,
    string memory viewStr,
    string memory color,
    string memory bevel
  ) internal pure returns (string memory) {
    string memory layerStr = toString(layerIndex);
    string memory rectBase = string(
      abi.encodePacked(
        "<rect width='",
        viewStr,
        "' height='",
        viewStr,
        "'"
      )
    );
    string memory maskRef = string(
      abi.encodePacked(
        " mask='url(#mask-",
        layerStr,
        ")'/>"
      )
    );
    string memory rect1 = string(
      abi.encodePacked(
        rectBase,
        " fill='",
        color,
        "'",
        maskRef
      )
    );
    string memory rect2 = string(
      abi.encodePacked(
        rectBase,
        " fill='url(#paper-light)' opacity='0.18'",
        maskRef
      )
    );
    string memory rect3 = string(
      abi.encodePacked(
        rectBase,
        " fill='white' filter='url(#paper-grain)' opacity='0.06'",
        maskRef
      )
    );
    return string(
      abi.encodePacked(
        "<g transform='translate(0 0)' filter='url(#paper-shadow)'>",
        rect1,
        rect2,
        rect3,
        bevel,
        "</g>"
      )
    );
  }

  function renderPreviewLayer(
    string memory viewStr,
    string memory color,
    string memory shapes
  ) internal pure returns (string memory) {
    return string(
      abi.encodePacked(
        "<g>",
        "<rect width='",
        viewStr,
        "' height='",
        viewStr,
        "' fill='",
        color,
        "'/>",
        "<g fill='#0b1220' opacity='0.92'>",
        shapes,
        "</g>",
        "</g>"
      )
    );
  }

  function buildMask(State memory state, uint256 layerIndex) internal pure returns (string memory, string memory) {
    MaskConfig memory cfg = buildMaskConfig(state, layerIndex);
    (string memory holes, string memory bevelShapes) = buildShapes(cfg);

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
        toString(cfg.strokeWidth),
        "' stroke-linejoin='round'>",
        bevelShapes,
        "</g>",
        "<g transform='translate(1 1)' fill='none' stroke='rgba(0,0,0,0.25)' stroke-width='",
        toString(cfg.strokeWidth),
        "' stroke-linejoin='round'>",
        bevelShapes,
        "</g>",
        "</g>"
      )
    );

    return (mask, bevel);
  }

  function buildMaskConfig(State memory state, uint256 layerIndex) internal pure returns (MaskConfig memory cfg) {
    cfg.gridFp = mapParam(state.params[layerIndex][0], GRID_MIN * FP, GRID_MAX * FP);
    cfg.squareMixFp = mapParam(state.params[layerIndex][1], 0, FP);
    cfg.holeProbFp = mapParam(state.params[layerIndex][2], HOLE_MIN_FP, HOLE_MAX_FP);
    cfg.radiusFp = mapParam(state.params[layerIndex][3], RADIUS_MIN_FP, RADIUS_MAX_FP);
    cfg.panX = mapParamSigned(state.params[layerIndex][4], PAN_MIN_FP, PAN_MAX_FP);
    cfg.panY = mapParamSigned(state.params[layerIndex][5], PAN_MIN_FP, PAN_MAX_FP);
    cfg.scaleFp = mapParam(state.params[layerIndex][6], SCALE_MIN_FP, SCALE_MAX_FP);
    cfg.gridCount = cfg.gridFp / FP;
    if (cfg.gridFp % FP != 0) {
      cfg.gridCount += 1;
    }
    uint256 cellPx = (VIEW * FP) / cfg.gridFp;
    uint256 strokeWidth = cellPx / 16;
    if (strokeWidth < 1) {
      strokeWidth = 1;
    } else if (strokeWidth > 6) {
      strokeWidth = 6;
    }
    cfg.strokeWidth = strokeWidth;

    cfg.seed = int256(uint256(state.layerSeeds[layerIndex]));
    cfg.seed17 = (cfg.seed * 17) / 10;
    cfg.seed29 = (cfg.seed * 29) / 10;
    cfg.seed42 = (cfg.seed * 42) / 10;
    cfg.seed53 = (cfg.seed * 53) / 10;
  }

  function buildShapes(MaskConfig memory cfg) internal pure returns (string memory holes, string memory bevelShapes) {
    holes = "";
    bevelShapes = "";
    for (uint256 y = 0; y < cfg.gridCount; y++) {
      for (uint256 x = 0; x < cfg.gridCount; x++) {
        int256 cellX = int256(x);
        int256 cellY = int256(y);
        string memory rectShape = buildCellShape(cfg, cellX, cellY);
        if (bytes(rectShape).length == 0) {
          continue;
        }
        holes = string(abi.encodePacked(holes, rectShape, " fill='black'/>"));
        bevelShapes = string(abi.encodePacked(bevelShapes, rectShape, "/>"));
      }
    }
  }

  function buildCellShape(
    MaskConfig memory cfg,
    int256 cellX,
    int256 cellY
  ) internal pure returns (string memory) {
    if (!cellHasHole(cfg, cellX, cellY)) {
      return "";
    }

    (int256 jitterX, int256 jitterY) = cellJitter(cfg, cellX, cellY);
    (uint256 r, uint256 corner) = cellRadius(cfg, cellX, cellY);
    (int256 cx, int256 cy) = cellCenter(cfg, cellX, cellY, jitterX, jitterY);
    (uint256 rPx, uint256 cornerPx) = cellSize(cfg, r, corner);
    return buildRectShape(cx, cy, rPx, cornerPx);
  }

  function cellHasHole(MaskConfig memory cfg, int256 cellX, int256 cellY) internal pure returns (bool) {
    uint256 roll = hash12(cellX * FP_I + cfg.seed, cellY * FP_I + cfg.seed);
    return roll <= cfg.holeProbFp;
  }

  function cellJitter(
    MaskConfig memory cfg,
    int256 cellX,
    int256 cellY
  ) internal pure returns (int256 jitterX, int256 jitterY) {
    jitterX = int256(hash12(cellX * FP_I + cfg.seed17, cellY * FP_I + cfg.seed17));
    jitterX = (jitterX - HALF_FP_I) * 35 / 100;
    jitterY = int256(hash12(cellX * FP_I + cfg.seed29, cellY * FP_I + cfg.seed29));
    jitterY = (jitterY - HALF_FP_I) * 35 / 100;
  }

  function cellRadius(
    MaskConfig memory cfg,
    int256 cellX,
    int256 cellY
  ) internal pure returns (uint256 r, uint256 corner) {
    uint256 mixAmt = (cfg.squareMixFp * 4) / 10;
    if (hash12(cellX * FP_I + cfg.seed53, cellY * FP_I + cfg.seed53) >= uint256(HALF_FP_I)) {
      mixAmt += (FP * 6) / 10;
    }
    uint256 rand = hash12(cellX * FP_I + cfg.seed42, cellY * FP_I + cfg.seed42);
    // slither-disable-next-line divide-before-multiply
    r = ((cfg.radiusFp * 60) / 100) + (((cfg.radiusFp * 50) / 100) * rand) / FP;
    corner = (r * (FP - mixAmt)) / FP;
  }

  function cellCenter(
    MaskConfig memory cfg,
    int256 cellX,
    int256 cellY,
    int256 jitterX,
    int256 jitterY
  ) internal pure returns (int256 cx, int256 cy) {
    int256 uvCenterX = ((cellX * FP_I + HALF_FP_I + jitterX) * FP_I) / int256(cfg.gridFp);
    int256 uvCenterY = ((cellY * FP_I + HALF_FP_I + jitterY) * FP_I) / int256(cfg.gridFp);

    int256 baseUvX = ((uvCenterX - HALF_FP_I - cfg.panX) * FP_I) / int256(cfg.scaleFp) + HALF_FP_I;
    int256 baseUvY = ((uvCenterY - HALF_FP_I - cfg.panY) * FP_I) / int256(cfg.scaleFp) + HALF_FP_I;
    baseUvX = clampSigned(baseUvX, 0, FP_I);
    baseUvY = clampSigned(baseUvY, 0, FP_I);

    cx = (baseUvX * int256(VIEW)) / FP_I;
    cy = int256(VIEW) - (baseUvY * int256(VIEW)) / FP_I;
  }

  function cellSize(
    MaskConfig memory cfg,
    uint256 r,
    uint256 corner
  ) internal pure returns (uint256 rPx, uint256 cornerPx) {
    rPx = (r * FP * VIEW) / (cfg.gridFp * cfg.scaleFp);
    if (rPx == 0) {
      rPx = 1;
    }
    cornerPx = (corner * FP * VIEW) / (cfg.gridFp * cfg.scaleFp);
  }

  function buildRectShape(
    int256 cx,
    int256 cy,
    uint256 radiusPx,
    uint256 cornerPx
  ) internal pure returns (string memory) {
    uint256 size = radiusPx * 2;
    return string(
      abi.encodePacked(
        "<rect x='",
        toStringSigned(cx - int256(radiusPx)),
        "' y='",
        toStringSigned(cy - int256(radiusPx)),
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
  }

  function validatePacked(bytes memory data) internal pure {
    if (data.length != PACKED_LENGTH) {
      revert InvalidPackedLength(PACKED_LENGTH, data.length);
    }
  }

  function validatePackedState(bytes memory data) internal pure {
    decode(data);
  }

  function validateState(State memory state) internal pure {
    uint256 mask = 0;
    for (uint256 i = 0; i < LAYER_COUNT; i++) {
      uint8 order = state.layerOrder[i];
      if (order >= LAYER_COUNT) {
        revert InvalidLayerOrder(i, order);
      }
      uint256 bit = 1 << order;
      if (mask & bit != 0) {
        revert DuplicateLayerOrder(order);
      }
      mask |= bit;
    }

    for (uint256 layer = 0; layer < LAYER_COUNT; layer++) {
      for (uint256 param = 0; param < PARAM_COUNT; param++) {
        uint16 value = state.params[layer][param];
        if (value > SCALE) {
          revert InvalidParamValue(layer, param, value);
        }
      }
    }
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

}
