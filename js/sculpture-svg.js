export const VIEW = 1000;
export const PACK_SCALE = 10000;
export const SEED_SCALE = 1000000;
export const LIMITS = {
  grid: [3, 22],
  squareMix: [0, 1],
  holeProb: [0.05, 0.95],
  radius: [0.18, 0.6],
  pan: [-0.12, 0.12],
  scale: [0.9, 1.1],
};

const FP = 1000000;
const HALF_FP = FP / 2;
const CONST_33 = 33330000;
const GRID_MIN_FP = Math.round(LIMITS.grid[0] * FP);
const GRID_MAX_FP = Math.round(LIMITS.grid[1] * FP);
const HOLE_MIN_FP = Math.round(LIMITS.holeProb[0] * FP);
const HOLE_MAX_FP = Math.round(LIMITS.holeProb[1] * FP);
const RADIUS_MIN_FP = Math.round(LIMITS.radius[0] * FP);
const RADIUS_MAX_FP = Math.round(LIMITS.radius[1] * FP);
const PAN_MIN_FP = Math.round(LIMITS.pan[0] * FP);
const PAN_MAX_FP = Math.round(LIMITS.pan[1] * FP);
const SCALE_MIN_FP = Math.round(LIMITS.scale[0] * FP);
const SCALE_MAX_FP = Math.round(LIMITS.scale[1] * FP);
const DEFAULT_SCALE_PARAM = Math.round(((1 - LIMITS.scale[0]) / (LIMITS.scale[1] - LIMITS.scale[0])) * PACK_SCALE);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampSigned = (value, min, max) => Math.min(max, Math.max(min, value));
const div = (value, denom) => Math.trunc(value / denom);
const mod = (value, modulus) => ((value % modulus) + modulus) % modulus;
const divBig = (value, denom) => value / denom;
const modBig = (value, modulus) => ((value % modulus) + modulus) % modulus;
const normalizeSvg = (svg) =>
  svg
    .replace(/\"/g, "'")
    .replace(/\s+\/>/g, "/>")
    .replace(/\s{2,}/g, " ");

const FP_BIG = BigInt(FP);
const CONST_33_BIG = BigInt(CONST_33);
const hash12 = (x, y) => {
  const xb = BigInt(x);
  const yb = BigInt(y);
  const p3x = modBig(divBig(xb * 1031n, 10000n), FP_BIG);
  const p3y = modBig(divBig(yb * 1031n, 10000n), FP_BIG);
  const p3z = p3x;
  const dot =
    divBig(p3x * (p3y + CONST_33_BIG) + p3y * (p3z + CONST_33_BIG) + p3z * (p3x + CONST_33_BIG), FP_BIG);
  const qx = p3x + dot;
  const qy = p3y + dot;
  const qz = p3z + dot;
  const prod = divBig((qx + qy) * qz, FP_BIG);
  return Number(modBig(prod, FP_BIG));
};

const mapParam = (value, min, max) => min + div(value * (max - min), PACK_SCALE);

const hexToBytes = (hex) => {
  const clean = hex.replace(/^0x/, "").trim();
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
};

export const decodePacked = (hex) => {
  const bytes = hexToBytes(hex);
  let offset = 0;
  const headerBytes = 29;
  const read = (count) => {
    const slice = bytes.slice(offset, offset + count);
    offset += count;
    return slice;
  };
  const readU8 = () => read(1)[0] || 0;
  const readU16 = () => {
    const [a, b] = read(2);
    return ((a || 0) << 8) + (b || 0);
  };
  const readU24 = () => {
    const [a, b, c] = read(3);
    return ((a || 0) << 16) + ((b || 0) << 8) + (c || 0);
  };
  const readU32 = () => {
    const [a, b, c, d] = read(4);
    return ((a || 0) << 24) + ((b || 0) << 16) + ((c || 0) << 8) + (d || 0);
  };

  const baseSeed = readU32();
  const sceneIndex = readU8();
  const layerOrder = [readU8(), readU8(), readU8()];
  const layerColors = [readU24(), readU24(), readU24()].map(
    (value) => `#${value.toString(16).padStart(6, "0")}`
  );
  const layerSeeds = [readU32(), readU32(), readU32()];
  const params = Array.from({ length: 3 }, () => Array(7).fill(0));
  const remaining = Math.max(0, bytes.length - headerBytes);
  const paramsPerLayer = Math.floor(remaining / (3 * 2));
  const hasScale = paramsPerLayer >= 7;
  for (let layer = 0; layer < 3; layer += 1) {
    for (let param = 0; param < 6; param += 1) {
      params[layer][param] = readU16();
    }
    params[layer][6] = hasScale ? readU16() : DEFAULT_SCALE_PARAM;
  }

  return { baseSeed, sceneIndex, layerOrder, layerColors, layerSeeds, params };
};

const buildMask = (state, layerIndex) => {
  const params = state.params[layerIndex];
  const gridFp = mapParam(params[0], GRID_MIN_FP, GRID_MAX_FP);
  const squareMixFp = mapParam(params[1], 0, FP);
  const holeProbFp = mapParam(params[2], HOLE_MIN_FP, HOLE_MAX_FP);
  const radiusFp = mapParam(params[3], RADIUS_MIN_FP, RADIUS_MAX_FP);
  const panXFp = mapParam(params[4], PAN_MIN_FP, PAN_MAX_FP);
  const panYFp = mapParam(params[5], PAN_MIN_FP, PAN_MAX_FP);
  const scaleFp = mapParam(params[6], SCALE_MIN_FP, SCALE_MAX_FP);
  const gridCount = div(gridFp, FP) + (gridFp % FP === 0 ? 0 : 1);
  const seedRaw = state.layerSeeds[layerIndex];
  const seedFp =
    seedRaw && seedRaw < 1000000
      ? seedRaw * 1000
      : seedRaw || Math.round((state.baseSeed + layerIndex * 19.13) * SEED_SCALE);

  const seed17 = div(seedFp * 17, 10);
  const seed29 = div(seedFp * 29, 10);
  const seed42 = div(seedFp * 42, 10);
  const seed53 = div(seedFp * 53, 10);

  const holes = [];
  const bevelShapes = [];
  const cellPx = div(VIEW * FP, gridFp);
  const strokeWidth = Math.max(1, Math.min(6, Math.floor(cellPx / 16)));
  for (let y = 0; y < gridCount; y += 1) {
    for (let x = 0; x < gridCount; x += 1) {
      const cellXFp = x * FP + seedFp;
      const cellYFp = y * FP + seedFp;
      const rnd = hash12(cellXFp, cellYFp);
      if (rnd > holeProbFp) {
        continue;
      }

      const jitterX = div((hash12(x * FP + seed17, y * FP + seed17) - HALF_FP) * 35, 100);
      const jitterY = div((hash12(x * FP + seed29, y * FP + seed29) - HALF_FP) * 35, 100);

      const perCellPick = hash12(x * FP + seed53, y * FP + seed53) >= HALF_FP ? 1 : 0;
      const mixAmt = div(squareMixFp * 4, 10) + (perCellPick ? div(FP * 6, 10) : 0);

      const rand = hash12(x * FP + seed42, y * FP + seed42);
      const baseR = div(radiusFp * 60, 100);
      const randR = div(radiusFp * 50, 100);
      const r = baseR + div(randR * rand, FP);
      const corner = div(r * (FP - mixAmt), FP);

      const uvCenterX = div((x * FP + HALF_FP + jitterX) * FP, gridFp);
      const uvCenterY = div((y * FP + HALF_FP + jitterY) * FP, gridFp);

      const baseUvX = clampSigned(div((uvCenterX - HALF_FP - panXFp) * FP, scaleFp) + HALF_FP, 0, FP);
      const baseUvY = clampSigned(div((uvCenterY - HALF_FP - panYFp) * FP, scaleFp) + HALF_FP, 0, FP);

      const cx = div(baseUvX * VIEW, FP);
      const cy = VIEW - div(baseUvY * VIEW, FP);
      const rPx = Math.max(1, div(r * FP * VIEW, gridFp * scaleFp));
      const cornerPx = Math.max(0, div(corner * FP * VIEW, gridFp * scaleFp));
      const size = rPx * 2;

      const shape = `<rect x="${cx - rPx}" y="${cy - rPx}" width="${size}" height="${size}" rx="${cornerPx}" ry="${cornerPx}" />`;
      holes.push(`${shape.replace("/>", " fill=\"black\" />")}`);
      bevelShapes.push(shape);
    }
  }

  const mask =
    `<mask id="mask-${layerIndex}" maskUnits="userSpaceOnUse">` +
    `<rect width="${VIEW}" height="${VIEW}" fill="white" />` +
    holes.join("") +
    `</mask>`;

  const bevel =
    `<g mask="url(#mask-${layerIndex})" opacity="0.55">` +
      `<g transform="translate(-1 -1)" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${strokeWidth}" stroke-linejoin="round">` +
        bevelShapes.join("") +
      `</g>` +
      `<g transform="translate(1 1)" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="${strokeWidth}" stroke-linejoin="round">` +
        bevelShapes.join("") +
      `</g>` +
    `</g>`;

  return { mask, bevel };
};

export const renderSvg = (state) => {
  const defs = [];
  defs.push(
    `<filter id="paper-shadow" x="-20%" y="-20%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="rgba(0,0,0,0.35)" />` +
    `</filter>`
  );
  defs.push(
    `<filter id="paper-grain" x="-10%" y="-10%" width="120%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="2" />` +
      `<feColorMatrix type="saturate" values="0" />` +
      `<feComponentTransfer>` +
        `<feFuncA type="table" tableValues="0 0.12" />` +
      `</feComponentTransfer>` +
    `</filter>`
  );
  defs.push(
    `<linearGradient id="paper-light" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.16" />` +
      `<stop offset="70%" stop-color="#000000" stop-opacity="0.12" />` +
      `<stop offset="100%" stop-color="#000000" stop-opacity="0.18" />` +
    `</linearGradient>`
  );

  const masks = [];
  const bevels = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const { mask, bevel } = buildMask(state, layer);
    masks.push(mask);
    bevels[layer] = bevel;
  }

  const layers = [];
  for (let orderIndex = state.layerOrder.length - 1; orderIndex >= 0; orderIndex -= 1) {
    const layerIndex = state.layerOrder[orderIndex];
    const color = state.layerColors[layerIndex] || "#ffffff";
    layers.push(
      `<g transform="translate(0 0)" filter="url(#paper-shadow)">` +
        `<rect width="${VIEW}" height="${VIEW}" fill="${color}" mask="url(#mask-${layerIndex})" />` +
        `<rect width="${VIEW}" height="${VIEW}" fill="url(#paper-light)" opacity="0.18" mask="url(#mask-${layerIndex})" />` +
        `<rect width="${VIEW}" height="${VIEW}" fill="white" filter="url(#paper-grain)" opacity="0.06" mask="url(#mask-${layerIndex})" />` +
        (bevels[layerIndex] || "") +
      `</g>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">` +
    `<defs>${defs.join("")}${masks.join("")}</defs>` +
    `<rect width="${VIEW}" height="${VIEW}" fill="#0b1220" />` +
    layers.join("") +
    `</svg>`
  );
};

export const renderSvgFromPacked = (hex) => normalizeSvg(renderSvg(decodePacked(hex)));
