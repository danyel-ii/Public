(() => {
  if (!window.p5) {
    return;
  }

  const ensureRoot = () => {
    let root = document.getElementById("p5-bg");
    if (root) {
      return root;
    }
    root = document.createElement("div");
    root.id = "p5-bg";
    root.className = "p5-bg";
    root.setAttribute("aria-hidden", "true");
    document.body.prepend(root);
    return root;
  };

  const root = ensureRoot();
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const themes = window.StudybookP5Themes || {};

  const state = {
    theme: null,
    palette: {},
    reducedMotion: prefersReducedMotion,
    cache: {},
    width: window.innerWidth,
    height: window.innerHeight,
    activeDraw: null
  };

  const readPalette = () => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => {
      const value = styles.getPropertyValue(name).trim();
      return value || fallback;
    };
    return {
      bg: read("--bg", "#f6efe4"),
      ink: read("--ink", "#1d1b1f"),
      accent1: read("--accent-1", "#e84b3c"),
      accent2: read("--accent-2", "#1d5fd1"),
      accent3: read("--accent-3", "#f1b434"),
      accent4: read("--accent-4", "#168f5c")
    };
  };

  const resolveTheme = () => document.documentElement.dataset.theme || "poster";

  let instance;

  const applyTheme = (force) => {
    const nextTheme = resolveTheme();
    if (!force && nextTheme === state.theme) {
      return;
    }
    state.theme = nextTheme;
    state.palette = readPalette();
    state.cache[nextTheme] = state.cache[nextTheme] || {};
    state.activeDraw = themes[nextTheme] || themes.poster || null;
    if (instance && prefersReducedMotion) {
      instance.redraw();
    }
  };

  const sketch = (p) => {
    p.setup = () => {
      const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
      canvas.parent(root);
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      if (prefersReducedMotion) {
        p.noLoop();
      }
      applyTheme(true);
    };

    p.draw = () => {
      p.clear();
      state.width = p.width;
      state.height = p.height;
      if (state.activeDraw) {
        state.activeDraw(p, state.palette, state);
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      state.width = p.width;
      state.height = p.height;
      if (prefersReducedMotion) {
        p.redraw();
      }
    };
  };

  instance = new p5(sketch);

  const observer = new MutationObserver(() => applyTheme(false));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
})();
