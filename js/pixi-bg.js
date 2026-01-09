(() => {
  const root = document.getElementById("pixi-bg");
  const fxRoot = document.getElementById("pixi-fx") || root;
  if (!root || !window.PIXI) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = readPalette();
  const screenBlendMode = resolveScreenBlend();

  const pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.45,
    lastX: window.innerWidth * 0.5,
    lastY: window.innerHeight * 0.45,
    active: false,
    lastMoveAt: performance.now()
  };

  const maxTrailAge = 700;
  let impactStrength = 0;
  let impactArmed = true;
  let hoveredCardIndex = -1;

  let app;
  let fxApp;
  let scene;
  let fxScene;
  let displacementSprite;
  let displacementFilter;
  let vellumLayer;
  let shardLayer;
  let constellationLayer;
  let effectLayer;
  let linkLayer;
  let chaserDiamond;
  let cometTrail;
  let rippleLayer;

  const vellumSheets = [];
  const glassShards = [];
  const constellationPoints = [];
  const cardNodes = [];
  const ripples = [];
  const chaserTrail = [];
  const floatingCubes = [];

  const chaser = {
    x: pointer.x,
    y: pointer.y
  };

  const needsCardRefresh = { value: true };
  let refreshScheduled = false;

  init();

  async function init() {
    app = new PIXI.Application();
    fxApp = new PIXI.Application();
    await Promise.all([
      app.init({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true
      }),
      fxApp.init({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true
      })
    ]);

    root.appendChild(app.canvas);
    fxRoot.appendChild(fxApp.canvas);

    scene = new PIXI.Container();
    fxScene = new PIXI.Container();
    app.stage.addChild(scene);
    fxApp.stage.addChild(fxScene);
    fxApp.ticker.stop();

    vellumLayer = new PIXI.Container();
    shardLayer = new PIXI.Container();
    constellationLayer = new PIXI.Container();
    constellationLayer.alpha = 0.95;
    effectLayer = new PIXI.Container();
    linkLayer = new PIXI.Graphics();
    linkLayer.alpha = 0.9;
    linkLayer.blendMode = screenBlendMode;

    scene.addChild(vellumLayer, shardLayer);
    fxScene.addChild(constellationLayer, linkLayer, effectLayer);

    setupDisplacement();
    setupVellum();
    setupShards();
    setupConstellation();
    setupPointerFx();
    setupCardNodes();
    attachListeners();
    setupFloatingCubes();
    scheduleCardRefresh();

    if (prefersReducedMotion) {
      renderStaticFrame(false);
      return;
    }

    app.ticker.add((ticker) => {
      const deltaSeconds = getDeltaSeconds(ticker);
      update(deltaSeconds);
    });
  }

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
      inkStroke: cssColor(styles.getPropertyValue("--ink-stroke") || "#2dd4bf"),
      inkStrokeMuted: cssColor(styles.getPropertyValue("--ink-stroke-muted") || "rgba(210, 210, 210, 0.35)"),
      accent: cssColor(styles.getPropertyValue("--accent") || "#ffb84c"),
      accent2: cssColor(styles.getPropertyValue("--accent-2") || "#2dd4bf"),
      accent3: cssColor(styles.getPropertyValue("--accent-3") || "#8b5cf6"),
      accent4: cssColor(styles.getPropertyValue("--accent-4") || "#66a670"),
      paper: cssColor(styles.getPropertyValue("--paper") || "#f7f4ee"),
      muted: cssColor(styles.getPropertyValue("--muted") || "#b7b2a6")
    };
  }

  function cssColor(value) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = value.trim();
    const normalized = ctx.fillStyle;
    if (normalized.startsWith("#")) {
      return {
        hex: parseInt(normalized.slice(1), 16),
        alpha: 1
      };
    }
    const match = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) {
      return { hex: 0xffffff, alpha: 1 };
    }
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return {
      hex: (r << 16) + (g << 8) + b,
      alpha: match[4] ? Number(match[4]) : 1
    };
  }

  function resolveScreenBlend() {
    if (PIXI.BLEND_MODES && typeof PIXI.BLEND_MODES.SCREEN === "number") {
      return PIXI.BLEND_MODES.SCREEN;
    }
    return 4;
  }

  function setupDisplacement() {
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const ctx = noiseCanvas.getContext("2d");
    const imageData = ctx.createImageData(256, 256);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = 140 + Math.random() * 60;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = PIXI.Texture.from(noiseCanvas);
    const baseTexture = texture.baseTexture || texture.source;
    if (baseTexture && PIXI.WRAP_MODES) {
      baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    }

    displacementSprite = new PIXI.Sprite(texture);
    displacementSprite.alpha = 0;
    displacementSprite.blendMode = screenBlendMode;
    displacementSprite.width = window.innerWidth;
    displacementSprite.height = window.innerHeight;
    effectLayer.addChildAt(displacementSprite, 0);

    displacementFilter = new PIXI.DisplacementFilter(displacementSprite, 18);
  }

  function setupVellum() {
    const texture = createVellumTexture();
    const sheetCount = 4;
    for (let i = 0; i < sheetCount; i += 1) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.22 - i * 0.02;
      sprite.blendMode = screenBlendMode;
      sprite.scale.set(1.2 + i * 0.2);
      sprite.position.set(
        Math.random() * window.innerWidth,
        Math.random() * window.innerHeight
      );
      vellumLayer.addChild(sprite);
      vellumSheets.push({
        sprite,
        driftX: (Math.random() - 0.5) * 4,
        driftY: (Math.random() - 0.5) * 4,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        depth: 0.2 + i * 0.2
      });
    }
  }

  function createVellumTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 420, 420);
    gradient.addColorStop(0, "rgba(45, 212, 191, 0.12)");
    gradient.addColorStop(1, "rgba(139, 92, 246, 0.12)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 420, 420);

    for (let i = 0; i < 1200; i += 1) {
      const x = Math.random() * 420;
      const y = Math.random() * 420;
      const alpha = Math.random() * 0.08;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }

    return PIXI.Texture.from(canvas);
  }

  function setupShards() {
    const shardCount = 14;
    for (let i = 0; i < shardCount; i += 1) {
      const graphics = new PIXI.Graphics();
      const size = 18 + Math.random() * 72;
      const points = makePolygonPoints(3 + Math.floor(Math.random() * 5), size);
      const lineAlpha = 0.18 + Math.random() * 0.22;
      const fillAlpha = 0.05 + Math.random() * 0.12;
      const tint = Math.random() > 0.5 ? palette.accent3.hex : palette.accent2.hex;
      graphics.lineStyle(1 + Math.random(), palette.inkStrokeMuted.hex, lineAlpha);
      graphics.beginFill(tint, fillAlpha);
      graphics.drawPolygon(points);
      graphics.endFill();
      graphics.position.set(Math.random() * window.innerWidth, Math.random() * window.innerHeight);
      graphics.rotation = Math.random() * Math.PI;
      graphics.filters = [new PIXI.BlurFilter({ strength: 2 + Math.random() * 2 })];
      shardLayer.addChild(graphics);
      glassShards.push({
        sprite: graphics,
        velocityX: (Math.random() - 0.5) * 18,
        velocityY: (Math.random() - 0.5) * 18,
        rotationSpeed: (Math.random() - 0.5) * 0.5,
        depth: 0.2 + Math.random() * 0.6,
        size
      });
    }
  }

  function makePolygonPoints(count, radius) {
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const r = radius * (0.55 + Math.random() * 0.5);
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    return points;
  }

  function setupConstellation() {
    const pointCount = 96;
    const positions = generateConstellationPositions(pointCount, window.innerWidth, window.innerHeight);
    const paletteColors = [
      palette.accent.hex,
      palette.accent2.hex,
      palette.accent3.hex,
      palette.accent4.hex
    ];
    for (let i = 0; i < pointCount; i += 1) {
      const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
      const tint = paletteColors[Math.floor(Math.random() * paletteColors.length)];
      sprite.tint = tint;
      const twinkle = 0.55 + Math.random() * 0.45;
      sprite.alpha = twinkle;
      sprite.anchor.set(0.5);
      sprite.width = 2.8 + Math.random() * 3.8;
      sprite.height = sprite.width;
      const position = positions[i];
      sprite.position.set(position.x, position.y);
      constellationLayer.addChild(sprite);
      constellationPoints.push({
        sprite,
        color: tint,
        velocityX: (Math.random() - 0.5) * 10,
        velocityY: (Math.random() - 0.5) * 10,
        twinkle
      });
    }
  }

  function setupPointerFx() {
    cometTrail = new PIXI.Graphics();
    rippleLayer = new PIXI.Graphics();
    chaserDiamond = new PIXI.Graphics();

    effectLayer.addChild(cometTrail, rippleLayer, chaserDiamond);
    drawChaserDiamond();
    cometTrail.blendMode = screenBlendMode;
    chaserDiamond.alpha = 0.95;
    if (displacementFilter) {
      chaserDiamond.filters = [displacementFilter];
    }
  }

  function setupCardNodes() {
    const cardElements = document.querySelectorAll(".pane, .brew-chip");
    cardElements.forEach((element, index) => {
      const node = new PIXI.Graphics();
      const halo = new PIXI.Graphics();
      halo.alpha = 0;
      halo.blendMode = screenBlendMode;
      node.beginFill(palette.paper.hex, 0.12);
      node.drawCircle(0, 0, 4);
      node.endFill();
      node.lineStyle(1.2, palette.accent2.hex, 0.5);
      node.drawCircle(0, 0, 6);
      node.alpha = 0.8;
      halo.lineStyle(0);
      halo.beginFill(palette.accent2.hex, 0.25);
      halo.drawCircle(0, 0, 14);
      halo.endFill();
      constellationLayer.addChild(halo);
      constellationLayer.addChild(node);

      element.addEventListener("mouseenter", () => {
        hoveredCardIndex = index;
      });
      element.addEventListener("mouseleave", () => {
        if (hoveredCardIndex === index) {
          hoveredCardIndex = -1;
        }
      });

      cardNodes.push({
        element,
        node,
        halo,
        centerX: 0,
        centerY: 0
      });
    });
  }

  function setupFloatingCubes() {
    const cubes = document.querySelectorAll(".cube-link");
    const width = window.innerWidth;
    const height = window.innerHeight;
    cubes.forEach((cube) => {
      const size = 60;
      const startX = Math.random() * (width - size) + size / 2;
      const startY = Math.random() * (height - size) + size / 2;
      cube.style.left = `${startX}px`;
      cube.style.top = `${startY}px`;
      floatingCubes.push({
        el: cube,
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        size
      });
    });
  }

  function attachListeners() {
    window.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      pointer.lastMoveAt = performance.now();
    }, { passive: true });

    window.addEventListener("pointerleave", () => {
      pointer.active = false;
    }, { passive: true });

    const cubes = document.querySelectorAll(".cube-link");
    cubes.forEach((cube) => {
      cube.addEventListener("mouseenter", () => {
        cube.classList.add("glitch");
        window.setTimeout(() => cube.classList.remove("glitch"), 520);
      });
    });

    window.addEventListener("resize", scheduleCardRefresh, { passive: true });
    window.addEventListener("scroll", scheduleCardRefresh, { passive: true });
  }

  function scheduleCardRefresh() {
    needsCardRefresh.value = true;
    if (refreshScheduled) {
      return;
    }
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      updateCardNodes();
      if (prefersReducedMotion) {
        renderStaticFrame(true);
      }
    });
  }

  function updateCardNodes() {
    if (!needsCardRefresh.value) {
      return;
    }
    needsCardRefresh.value = false;
    cardNodes.forEach((nodeData) => {
      const rect = nodeData.element.getBoundingClientRect();
      nodeData.centerX = rect.left + rect.width / 2;
      nodeData.centerY = rect.top + rect.height / 2;
      nodeData.node.position.set(nodeData.centerX, nodeData.centerY);
    });
    if (displacementSprite) {
      displacementSprite.width = window.innerWidth;
      displacementSprite.height = window.innerHeight;
    }
  }

  function drawChaserDiamond() {
    const size = 14;
    chaserDiamond.clear();
    chaserDiamond.lineStyle(2, palette.accent2.hex, 0.95);
    chaserDiamond.beginFill(palette.accent2.hex, 0.28);
    chaserDiamond.drawPolygon([
      0, -size,
      size, 0,
      0, size,
      -size, 0
    ]);
    chaserDiamond.endFill();
    chaserDiamond.lineStyle(1, palette.accent.hex, 0.6);
    chaserDiamond.drawPolygon([
      0, -size * 0.6,
      size * 0.6, 0,
      0, size * 0.6,
      -size * 0.6, 0
    ]);
  }

  function update(deltaSeconds) {
    updateCardNodes();
    updateChaser(deltaSeconds);
    updateComet();
    updateRipples(deltaSeconds);
    updateVellum(deltaSeconds);
    updateShards(deltaSeconds);
    updateConstellation(deltaSeconds);
    updateDisplacement(deltaSeconds);
    updateFloatingCubes(deltaSeconds);
    fxApp?.render();
  }

  function updateChaser(deltaSeconds) {
    const followStrength = Math.min(1, deltaSeconds * 4.2);
    chaser.x += (pointer.x - chaser.x) * followStrength;
    chaser.y += (pointer.y - chaser.y) * followStrength;

    chaserDiamond.position.set(chaser.x, chaser.y);
    chaserDiamond.rotation += deltaSeconds * 0.9;

    const now = performance.now();
    chaserTrail.push({ x: chaser.x, y: chaser.y, time: now });
    while (chaserTrail.length && now - chaserTrail[0].time > maxTrailAge) {
      chaserTrail.shift();
    }

    const distance = Math.hypot(pointer.x - chaser.x, pointer.y - chaser.y);
    if (distance > 48) {
      impactArmed = true;
    }
    if (impactArmed && distance < 20) {
      spawnRipple(pointer.x, pointer.y);
      impactStrength = 1;
      impactArmed = false;
    }
  }

  function updateComet() {
    cometTrail.clear();
    if (chaserTrail.length < 2) {
      return;
    }

    for (let i = 1; i < chaserTrail.length; i += 1) {
      const prev = chaserTrail[i - 1];
      const point = chaserTrail[i];
      const t = i / chaserTrail.length;
      const alpha = t * 0.75;
      const width = 1.2 + t * 5.5;
      cometTrail.lineStyle(width, palette.accent.hex, alpha);
      cometTrail.moveTo(prev.x, prev.y);
      cometTrail.lineTo(point.x, point.y);
    }
  }

  function updateRipples(deltaSeconds) {
    ripples.forEach((ring) => {
      ring.radius += deltaSeconds * 80;
      ring.alpha -= deltaSeconds * 0.7;
    });

    rippleLayer.clear();
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const ring = ripples[i];
      if (ring.alpha <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      rippleLayer.lineStyle(1.6, palette.accent2.hex, ring.alpha);
      rippleLayer.drawCircle(ring.x, ring.y, ring.radius);
    }
  }

  function spawnRipple(x, y) {
    ripples.push(
      { x, y, radius: 10, alpha: 0.7 },
      { x, y, radius: 18, alpha: 0.45 }
    );
  }

  function updateVellum(deltaSeconds) {
    vellumSheets.forEach((sheet) => {
      const sprite = sheet.sprite;
      sprite.x += sheet.driftX * deltaSeconds;
      sprite.y += sheet.driftY * deltaSeconds;
      sprite.rotation += sheet.rotationSpeed * deltaSeconds;

      const offsetX = (pointer.x - window.innerWidth / 2) * sheet.depth * 0.02;
      const offsetY = (pointer.y - window.innerHeight / 2) * sheet.depth * 0.02;
      sprite.position.x += offsetX * deltaSeconds;
      sprite.position.y += offsetY * deltaSeconds;

      wrapSprite(sprite, 240);
    });
  }

  function updateShards(deltaSeconds) {
    glassShards.forEach((shard) => {
      const sprite = shard.sprite;
      sprite.x += shard.velocityX * deltaSeconds;
      sprite.y += shard.velocityY * deltaSeconds;
      sprite.rotation += shard.rotationSpeed * deltaSeconds;

      const offsetX = (pointer.x - window.innerWidth / 2) * shard.depth * 0.012;
      const offsetY = (pointer.y - window.innerHeight / 2) * shard.depth * 0.012;
      sprite.x += offsetX * deltaSeconds;
      sprite.y += offsetY * deltaSeconds;

      const padding = shard.size + 40;
      if (sprite.x < -padding || sprite.x > window.innerWidth + padding) {
        shard.velocityX *= -1;
      }
      if (sprite.y < -padding || sprite.y > window.innerHeight + padding) {
        shard.velocityY *= -1;
      }
    });
  }

  function updateConstellation(deltaSeconds) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const hoverBoost = hoveredCardIndex >= 0 ? 0.6 : 0;

    constellationPoints.forEach((point) => {
      const sprite = point.sprite;
      const twinkle = point.twinkle || 0.7;
      sprite.x += point.velocityX * deltaSeconds;
      sprite.y += point.velocityY * deltaSeconds;

      sprite.alpha = twinkle + Math.sin(performance.now() * 0.002 + sprite.x * 0.01) * 0.16;

      if (sprite.x < -20) sprite.x = width + 20;
      if (sprite.x > width + 20) sprite.x = -20;
      if (sprite.y < -20) sprite.y = height + 20;
      if (sprite.y > height + 20) sprite.y = -20;
    });

    linkLayer.clear();

    const now = performance.now();
    for (let i = 0; i < constellationPoints.length; i += 1) {
      const pointData = constellationPoints[i];
      const sprite = pointData.sprite;
      for (let j = i + 1; j < constellationPoints.length; j += 1) {
        const other = constellationPoints[j].sprite;
        const dx = sprite.x - other.x;
        const dy = sprite.y - other.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 120) {
          const intensity = Math.max(0, 1 - distance / 120);
          const pulse = connectionPulse(i, j, now);
          if (pulse > 0) {
            drawLink(
              sprite.x,
              sprite.y,
              other.x,
              other.y,
              1.4,
              pointData.color,
            intensity * pulse * 0.75
            );
          }
        }
      }
      cardNodes.forEach((nodeData, index) => {
        const dx = sprite.x - nodeData.centerX;
        const dy = sprite.y - nodeData.centerY;
        const distance = Math.hypot(dx, dy);
        if (distance < 200) {
          const intensity = Math.max(0, 1 - distance / 200);
          const hoverFactor = hoveredCardIndex === index ? 0.6 : 0;
          drawLink(
            sprite.x,
            sprite.y,
            nodeData.centerX,
            nodeData.centerY,
            1.2,
            pointData.color,
            intensity * (0.65 + hoverBoost + hoverFactor)
          );
        }
      });
    }

    cardNodes.forEach((nodeData, index) => {
      const node = nodeData.node;
      const halo = nodeData.halo;
      const pulse = 1 + Math.sin(performance.now() * 0.002 + index) * 0.1;
      node.scale.set(pulse);
      const isHovered = hoveredCardIndex === index;
      node.alpha = isHovered ? 1 : 0.85;
      halo.position.set(nodeData.centerX, nodeData.centerY);
      if (isHovered) {
        const glowPulse = 1 + Math.sin(performance.now() * 0.004) * 0.2;
        halo.scale.set(glowPulse);
        halo.alpha = 0.45;
      } else {
        halo.alpha = 0;
      }
    });
  }

  function updateDisplacement(deltaSeconds) {
    if (!displacementSprite || !displacementFilter) {
      return;
    }
    displacementSprite.x += deltaSeconds * 10;
    displacementSprite.y += deltaSeconds * 6;
    impactStrength = Math.max(0, impactStrength - deltaSeconds * 1.6);
    const base = 6;
    const burst = impactStrength * 70;
    displacementFilter.scale.x = base + burst;
    displacementFilter.scale.y = base + burst;
  }

  function updateFloatingCubes(deltaSeconds) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    floatingCubes.forEach((cube) => {
      cube.x += cube.vx * deltaSeconds;
      cube.y += cube.vy * deltaSeconds;

      const padding = cube.size * 0.6;
      if (cube.x < padding || cube.x > width - padding) {
        cube.vx *= -1;
      }
      if (cube.y < padding || cube.y > height - padding) {
        cube.vy *= -1;
      }

      cube.el.style.left = `${cube.x}px`;
      cube.el.style.top = `${cube.y}px`;
    });
  }

  function drawLink(x1, y1, x2, y2, width, color, alpha) {
    if (typeof linkLayer.stroke === "function") {
      linkLayer.moveTo(x1, y1).lineTo(x2, y2).stroke({
        width,
        color,
        alpha
      });
      return;
    }
    linkLayer.lineStyle(width, color, alpha);
    linkLayer.moveTo(x1, y1);
    linkLayer.lineTo(x2, y2);
  }

  function generateConstellationPositions(count, width, height) {
    const aspect = width / height;
    const rows = Math.ceil(Math.sqrt(count / aspect));
    const cols = Math.ceil(count / rows);
    const cellW = width / cols;
    const cellH = height / rows;
    const positions = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (positions.length >= count) {
          break;
        }
        const jitterX = (Math.random() - 0.5) * cellW * 0.6;
        const jitterY = (Math.random() - 0.5) * cellH * 0.6;
        positions.push({
          x: col * cellW + cellW * 0.5 + jitterX,
          y: row * cellH + cellH * 0.5 + jitterY
        });
      }
    }
    return positions;
  }

  function connectionPulse(i, j, now) {
    const seed = (i * 19 + j * 31) * 0.31;
    const wave = Math.sin(now * 0.0016 + seed);
    const pulse = (wave + 1) / 2;
    if (pulse < 0.25) {
      return 0;
    }
    return (pulse - 0.25) / 0.75 * 0.8;
  }

  function wrapSprite(sprite, padding) {
    const width = window.innerWidth + padding;
    const height = window.innerHeight + padding;
    if (sprite.x < -padding) sprite.x = width;
    if (sprite.x > width) sprite.x = -padding;
    if (sprite.y < -padding) sprite.y = height;
    if (sprite.y > height) sprite.y = -padding;
  }

  function renderStaticFrame(skipCardUpdate) {
    if (!skipCardUpdate) {
      updateCardNodes();
    }
    updateConstellation(0);
    app.render();
    fxApp?.render();
  }

  function getDeltaSeconds(ticker) {
    if (ticker && typeof ticker.deltaMS === "number") {
      return ticker.deltaMS / 1000;
    }
    if (typeof ticker === "number") {
      return ticker / 60;
    }
    return 1 / 60;
  }
})();
