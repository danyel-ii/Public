(() => {
  const statusEl = document.getElementById("status");
  const previewEl = document.getElementById("preview");
  const packedEl = document.getElementById("packed-state");
  const copyButton = document.getElementById("copy-state");
  const downloadLink = document.getElementById("download-svg");

  const PACK_SCALE = 1000;
  const LIMITS = {
    grid: [3, 22],
    squareMix: [0, 1],
    holeProb: [0.05, 0.95],
    radius: [0.12, 0.45],
    pan: [-0.12, 0.12],
  };

  const setStatus = (message) => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const getPacked = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("state") || localStorage.getItem("sculpturePackedState");
  };

  const hexToBytes = (hex) => {
    const clean = hex.replace(/^0x/, "");
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return bytes;
  };

  const decodePacked = (hex) => {
    const bytes = hexToBytes(hex);
    let offset = 0;
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
    const layerColors = [
      readU24(),
      readU24(),
      readU24(),
    ].map((value) => `#${value.toString(16).padStart(6, "0")}`);

    const decodeFloat = (value, min, max) =>
      min + (value / PACK_SCALE) * (max - min);

    const layers = Array.from({ length: 3 }, () => {
      const grid = readU16();
      const squareMix = decodeFloat(readU16(), ...LIMITS.squareMix);
      const holeProb = decodeFloat(readU16(), ...LIMITS.holeProb);
      const radius = decodeFloat(readU16(), ...LIMITS.radius);
      const panX = decodeFloat(readU16(), ...LIMITS.pan);
      const panY = decodeFloat(readU16(), ...LIMITS.pan);
      return { grid, squareMix, holeProb, radius, panX, panY };
    });

    return { baseSeed, sceneIndex, layerOrder, layerColors, layers };
  };

  const randAt = (seed, layer, cellX, cellY, salt) => {
    if (!window.ethers) {
      return 0;
    }
    const hash = window.ethers.utils.solidityKeccak256(
      ["uint32", "uint8", "uint8", "uint8", "uint8"],
      [seed, layer, cellX, cellY, salt]
    );
    return parseInt(hash.slice(2, 10), 16);
  };

  const renderSvg = (state) => {
    const view = 1000;
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

    const masks = [];
    state.layers.forEach((layer, layerIndex) => {
      const grid = Math.max(LIMITS.grid[0], Math.min(LIMITS.grid[1], Math.round(layer.grid)));
      const cell = view / grid;
      const panX = layer.panX * cell;
      const panY = layer.panY * cell;
      const holeProb = Math.round(layer.holeProb * PACK_SCALE);
      const squareMix = Math.round(layer.squareMix * PACK_SCALE);
      const radius = Math.max(1, Math.round(cell * layer.radius));

      const holes = [];
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          const roll = randAt(state.baseSeed, layerIndex, x, y, 0) % PACK_SCALE;
          if (roll >= holeProb) {
            continue;
          }
          const shapeRoll = randAt(state.baseSeed, layerIndex, x, y, 1) % PACK_SCALE;
          const cx = Math.round(x * cell + cell * 0.5 + panX);
          const cy = Math.round(y * cell + cell * 0.5 + panY);
          if (shapeRoll < squareMix) {
            const size = radius * 2;
            holes.push(
              `<rect x="${cx - radius}" y="${cy - radius}" width="${size}" height="${size}" fill="black" />`
            );
          } else {
            holes.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="black" />`);
          }
        }
      }
      masks.push(
        `<mask id="mask-${layerIndex}" maskUnits="userSpaceOnUse">` +
          `<rect width="${view}" height="${view}" fill="white" />` +
          holes.join("") +
        `</mask>`
      );
    });

    const layers = [];
    state.layerOrder.forEach((layerIndex, orderIndex) => {
      const offset = orderIndex * 14;
      const color = state.layerColors[layerIndex] || "#ffffff";
      layers.push(
        `<g transform="translate(${offset} ${offset})" filter="url(#paper-shadow)">` +
          `<rect width="${view}" height="${view}" fill="${color}" mask="url(#mask-${layerIndex})" />` +
          `<rect width="${view}" height="${view}" fill="white" filter="url(#paper-grain)" opacity="0.06" />` +
        `</g>`
      );
    });

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}">` +
      `<defs>${defs.join("")}${masks.join("")}</defs>` +
      `<rect width="${view}" height="${view}" fill="#0b1220" />` +
      layers.join("") +
      `</svg>`
    );
  };

  const packed = getPacked();
  if (!packed) {
    setStatus("No packed state found. Generate one from index.html.");
    if (packedEl) {
      packedEl.value = "Missing packed state.";
    }
    return;
  }

  if (!window.ethers) {
    setStatus("Loading ethers (required for keccak). Refresh if it does not load.");
    return;
  }

  try {
    const state = decodePacked(packed);
    const svg = renderSvg(state);
    previewEl.innerHTML = svg;
    packedEl.value = packed;
    setStatus(`Scene ${state.sceneIndex + 1} · Seed ${state.baseSeed}`);

    if (downloadLink) {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = "paper-sculpture.svg";
    }
  } catch (error) {
    setStatus("Failed to decode packed state.");
    packedEl.value = packed;
  }

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(packed);
        setStatus("Packed state copied.");
      } catch (error) {
        setStatus("Unable to copy. Select the text manually.");
      }
    });
  }
})();
