(() => {
  const themes = window.StudybookP5Themes || (window.StudybookP5Themes = {});

  themes.grid = (p, palette, state) => {
    const w = p.width;
    const h = p.height;
    const size = Math.min(w, h);
    const spacing = Math.max(40, size / 8);
    const t = state.reducedMotion ? 0 : p.millis() * 0.00035;
    const drift = Math.sin(t) * spacing * 0.18;

    const withAlpha = (value, alpha) => {
      const c = p.color(value || "#000");
      c.setAlpha(Math.round(alpha * 255));
      return c;
    };

    p.stroke(withAlpha(palette.ink, 0.08));
    p.strokeWeight(1);
    for (let x = 0; x <= w; x += spacing) {
      p.line(x, 0, x, h);
    }
    for (let y = 0; y <= h; y += spacing) {
      p.line(0, y, w, y);
    }

    p.noStroke();
    p.fill(withAlpha(palette.accent1, 0.22));
    p.rect(spacing * 1.1 + drift, spacing * 1.2, spacing * 1.6, spacing * 1.6);

    p.fill(withAlpha(palette.accent4, 0.18));
    p.rect(spacing * 4.4, spacing * 2.8 + drift, spacing * 1.2, spacing * 2.1);

    p.fill(withAlpha(palette.accent3, 0.16));
    p.rect(spacing * 2.2, spacing * 5.1 - drift, spacing * 2.4, spacing * 0.6);

    p.stroke(withAlpha(palette.accent2, 0.18));
    p.strokeWeight(3);
    p.line(0, h * 0.62, w, h * 0.62);
  };
})();
