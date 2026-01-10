(() => {
  const themes = window.StudybookP5Themes || (window.StudybookP5Themes = {});

  themes.poster = (p, palette, state) => {
    const w = p.width;
    const h = p.height;
    const size = Math.min(w, h);
    const t = state.reducedMotion ? 0 : p.millis() * 0.0004;

    const withAlpha = (value, alpha) => {
      const c = p.color(value || "#000");
      c.setAlpha(Math.round(alpha * 255));
      return c;
    };

    p.noStroke();
    p.fill(withAlpha(palette.accent1, 0.34));
    p.circle(w * 0.22, h * 0.3, size * 0.6);

    p.fill(withAlpha(palette.accent2, 0.3));
    p.rect(w * 0.56, h * 0.1, size * 0.38, size * 0.28, 12);

    p.push();
    p.translate(w * 0.08, h * 0.7);
    p.rotate(-0.18 + Math.sin(t) * 0.03);
    p.fill(withAlpha(palette.accent3, 0.32));
    p.rect(0, 0, size * 0.9, size * 0.14, 10);
    p.pop();

    p.stroke(withAlpha(palette.ink, 0.25));
    p.strokeWeight(3);
    p.noFill();
    p.circle(w * 0.74, h * 0.68, size * 0.42);

    p.stroke(withAlpha(palette.accent4, 0.22));
    p.strokeWeight(3);
    p.line(w * 0.1, h * 0.52, w * 0.62, h * 0.52);
  };
})();
