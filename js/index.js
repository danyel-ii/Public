window.addEventListener("DOMContentLoaded", () => {
  const waveSvg = document.getElementById("wave-svg");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let waveLines = [];
  let wavePointer = { x: 0, y: 0 };

  const waveTextLines = [
    "studybook // applied labs / field notes ---------------------------",
    "signal array // nodes / orbit / relay #############################",
    "apps channel // glassbox / hash / verify ##########################",
    "slop channel // anchor / drift / remix ############################",
    "other index // contracts / catalog / explore ######################",
    "studio log // open access / daily run #############################"
  ];

  const initWaveLines = () => {
    if (!waveSvg) return;
    const width = waveSvg.clientWidth || 600;
    const lineHeight = 22;
    const height = lineHeight * waveTextLines.length;
    waveSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    waveSvg.innerHTML = "";
    waveLines = waveTextLines.map((label, index) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "transparent");
      path.setAttribute("id", `wave-path-${index}`);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("class", "wave-text");
      const textPath = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      textPath.setAttribute("href", `#wave-path-${index}`);
      textPath.setAttribute("startOffset", "0%");
      textPath.textContent = label;
      text.appendChild(textPath);

      waveSvg.appendChild(path);
      waveSvg.appendChild(text);

      return {
        path,
        textPath,
        baseY: lineHeight * (index + 1),
        phase: Math.random() * Math.PI * 2
      };
    });
  };

  const updateWavePaths = (time) => {
    if (!waveSvg || !waveLines.length) return;
    const width = waveSvg.viewBox.baseVal.width || waveSvg.clientWidth;
    const pointerY = wavePointer.y;
    waveLines.forEach((line, index) => {
      const distance = Math.abs(pointerY - line.baseY);
      const influence = Math.max(0, 1 - distance / 120);
      const ampBase = 8;
      const amp = prefersReducedMotion ? 0 : ampBase * (1 - influence);
      const step = 32;
      const phase = time * 0.0015 + line.phase;
      let d = `M 0 ${line.baseY}`;
      for (let x = 0; x <= width; x += step) {
        const wave = Math.sin((x / width) * Math.PI * 2 + phase + index * 0.35);
        const y = line.baseY + wave * amp;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      line.path.setAttribute("d", d);
    });
  };

  const tickWave = (time) => {
    updateWavePaths(time);
    window.requestAnimationFrame(tickWave);
  };

  const handlePointer = (event) => {
    if (!waveSvg) return;
    const rect = waveSvg.getBoundingClientRect();
    wavePointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  initWaveLines();

  if (prefersReducedMotion) {
    updateWavePaths(0);
  } else {
    window.requestAnimationFrame(tickWave);
  }

  window.addEventListener("resize", initWaveLines, { passive: true });
  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("pointerover", handlePointer, { passive: true });
  window.addEventListener("pointerenter", handlePointer, { passive: true });
  document.addEventListener("pointermove", handlePointer, { passive: true, capture: true });
  document.addEventListener("pointerover", handlePointer, { passive: true, capture: true });
  document.addEventListener("pointerenter", handlePointer, { passive: true, capture: true });

  const themeToggles = document.querySelectorAll(".theme-toggle");
  const pressableButtons = document.querySelectorAll(".theme-toggle[aria-pressed]");
  const standardButtons = document.querySelectorAll(".theme-toggle:not(.chance-toggle)");
  const chanceToggles = document.querySelectorAll(".chance-toggle");
  const defaultTheme = "poster";
  const allowedThemes = new Set(["poster", "grid", "collage", "neon"]);

  const createPrng = (seed) => {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const prngSeed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  const prng = createPrng(prngSeed);

  const normalizeTheme = (themeName) => {
    if (!themeName || !allowedThemes.has(themeName)) {
      return defaultTheme;
    }
    return themeName;
  };

  const setActiveTheme = (themeName, { persist = true } = {}) => {
    const nextTheme = normalizeTheme(themeName);
    document.documentElement.dataset.theme = nextTheme;
    if (persist) {
      try {
        localStorage.setItem("theme", nextTheme);
      } catch (err) {
        // Ignore storage errors.
      }
    }
    themeToggles.forEach((btn) => {
      const isActive = btn.dataset.theme === nextTheme;
      btn.classList.toggle("is-open", isActive && nextTheme !== defaultTheme);
    });
    pressableButtons.forEach((btn) => {
      const isActive = btn.dataset.theme === nextTheme;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  setActiveTheme(document.documentElement.dataset.theme || defaultTheme, { persist: false });

  standardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const themeName = button.dataset.theme;
      if (!themeName) return;
      const currentTheme = document.documentElement.dataset.theme || defaultTheme;
      const isActive = currentTheme === themeName;
      setActiveTheme(isActive ? defaultTheme : themeName);
    });
  });

  chanceToggles.forEach((link) => {
    link.addEventListener("click", (event) => {
      const probability = Number(link.dataset.probability || 0.36);
      if (Number.isNaN(probability)) {
        return;
      }
      const roll = prng();
      if (roll < probability) {
        event.preventDefault();
        const themeName = link.dataset.theme;
        if (!themeName) return;
        const currentTheme = document.documentElement.dataset.theme || defaultTheme;
        const isActive = currentTheme === themeName;
        setActiveTheme(isActive ? defaultTheme : themeName);
      }
    });
  });

  document.querySelectorAll(".glitchable").forEach((el) => {
    el.addEventListener("click", () => {
      el.classList.remove("glitch-hit");
      void el.offsetWidth;
      el.classList.add("glitch-hit");
      window.setTimeout(() => el.classList.remove("glitch-hit"), 500);
    });
  });

  const cubeNodes = Array.from(document.querySelectorAll(".cube-link"));
  const cubeState = [];
  let cubeTickId = null;
  let cubeLastTime = performance.now();

  const initCubes = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    cubeState.length = 0;
    cubeNodes.forEach((cube) => {
      const size = 60;
      const x = Math.random() * (width - size) + size / 2;
      const y = Math.random() * (height - size) + size / 2;
      cube.style.left = `${x}px`;
      cube.style.top = `${y}px`;
      cubeState.push({
        el: cube,
        x,
        y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        size
      });
    });
  };

  const updateCubes = (deltaSeconds) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    cubeState.forEach((cube) => {
      cube.x += cube.vx * deltaSeconds;
      cube.y += cube.vy * deltaSeconds;

      const padding = cube.size * 0.6;
      if (cube.x < padding) {
        cube.x = padding;
        cube.vx *= -1;
      } else if (cube.x > width - padding) {
        cube.x = width - padding;
        cube.vx *= -1;
      }
      if (cube.y < padding) {
        cube.y = padding;
        cube.vy *= -1;
      } else if (cube.y > height - padding) {
        cube.y = height - padding;
        cube.vy *= -1;
      }

      cube.el.style.left = `${cube.x}px`;
      cube.el.style.top = `${cube.y}px`;
    });
  };

  const tickCubes = (time) => {
    const deltaSeconds = Math.min(0.05, (time - cubeLastTime) / 1000);
    cubeLastTime = time;
    updateCubes(deltaSeconds);
    cubeTickId = window.requestAnimationFrame(tickCubes);
  };

  const startCubeMotion = () => {
    if (!cubeNodes.length) {
      return;
    }
    initCubes();
    if (prefersReducedMotion) {
      return;
    }
    if (cubeTickId) {
      window.cancelAnimationFrame(cubeTickId);
    }
    cubeLastTime = performance.now();
    cubeTickId = window.requestAnimationFrame(tickCubes);
  };

  startCubeMotion();
  window.addEventListener("resize", startCubeMotion, { passive: true });
});
