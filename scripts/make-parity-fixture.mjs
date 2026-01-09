import { renderSvgFromPacked } from "../js/sculpture-svg.js";
import { createHash } from "crypto";
import { writeFileSync } from "fs";

const PACK_SCALE = 10000;
const SEED_SCALE = 1000000;
const LIMITS = {
  grid: [3, 22],
  squareMix: [0, 1],
  holeProb: [0.05, 0.95],
  radius: [0.18, 0.6],
  pan: [-0.12, 0.12],
  scale: [0.9, 1.1],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const quantizeFloat = (value, min, max) => {
  const clamped = clamp(value, min, max);
  return Math.round(((clamped - min) / (max - min)) * PACK_SCALE);
};
const quantizeGrid = (value) => quantizeFloat(value, ...LIMITS.grid);

const parseHexColor = (value) => parseInt(value.replace("#", ""), 16);

const packState = (state) => {
  const bytes = [];
  const push8 = (value) => bytes.push(value & 0xff);
  const push16 = (value) => {
    bytes.push((value >> 8) & 0xff, value & 0xff);
  };
  const push24 = (value) => {
    bytes.push((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  };
  const push32 = (value) => {
    bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  };

  push32(state.baseSeed >>> 0);
  push8(state.sceneIndex ?? 0);
  state.layerOrder.forEach((value) => push8(value));
  state.layerColors.forEach((color) => push24(parseHexColor(color)));
  state.layers.forEach((layer) => push32(Math.round(layer.seed * SEED_SCALE)));

  state.layers.forEach((layer) => {
    push16(quantizeGrid(layer.grid));
    push16(quantizeFloat(layer.squareMix, ...LIMITS.squareMix));
    push16(quantizeFloat(layer.holeProb, ...LIMITS.holeProb));
    push16(quantizeFloat(layer.radius, ...LIMITS.radius));
    push16(quantizeFloat(layer.panX, ...LIMITS.pan));
    push16(quantizeFloat(layer.panY, ...LIMITS.pan));
    push16(quantizeFloat(layer.scale, ...LIMITS.scale));
  });

  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

const baseSeed = 314;
const state = {
  baseSeed,
  sceneIndex: 2,
  layerOrder: [1, 2, 0],
  layerColors: ["#262b64", "#45c3c3", "#9faba7"],
  layers: [
    {
      seed: baseSeed + 0 * 19.13,
      grid: 6.8,
      squareMix: 0.42,
      holeProb: 0.78,
      radius: 0.38,
      panX: 0.012,
      panY: -0.008,
      scale: 1.0012,
    },
    {
      seed: baseSeed + 1 * 19.13,
      grid: 7.4,
      squareMix: 0.65,
      holeProb: 0.73,
      radius: 0.42,
      panX: -0.014,
      panY: 0.009,
      scale: 0.9994,
    },
    {
      seed: baseSeed + 2 * 19.13,
      grid: 8.1,
      squareMix: 0.31,
      holeProb: 0.82,
      radius: 0.36,
      panX: 0.006,
      panY: -0.011,
      scale: 1.0006,
    },
  ],
};

const packed = packState(state);
const svg = renderSvgFromPacked(packed);
const hash = createHash("sha256").update(svg).digest("hex");

writeFileSync("scripts/parity-state.txt", `${packed}\n`);
writeFileSync("scripts/parity-hash.txt", `${hash}\n`);

console.log(`packed=${packed}`);
console.log(`sha256=${hash}`);
