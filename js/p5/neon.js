(() => {
  const themes = window.StudybookP5Themes || (window.StudybookP5Themes = {});

  themes.neon = (p, palette, state) => {
    const w = p.width;
    const h = p.height;
    const size = Math.min(w, h);
    const t = state.reducedMotion ? 0 : p.millis() * 0.0005;
    const pulse = 1 + Math.sin(t * 3) * 0.04;

    const withAlpha = (value, alpha) => {
      const c = p.color(value || "#fff");
      c.setAlpha(Math.round(alpha * 255));
      return c;
    };

    const ctx = p.drawingContext;

    const drawGlowRing = (x, y, diameter, color) => {
      ctx.save();
      ctx.shadowBlur = 28;
      ctx.shadowColor = color;
      p.noFill();
      p.stroke(withAlpha(color, 0.7));
      p.strokeWeight(2.6);
      p.circle(x, y, diameter);
      ctx.restore();
    };

    const drawGlowLine = (x1, y1, x2, y2, color) => {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      p.stroke(withAlpha(color, 0.6));
      p.strokeWeight(2);
      p.line(x1, y1, x2, y2);
      ctx.restore();
    };

    drawGlowRing(w * 0.28, h * 0.32, size * 0.36 * pulse, palette.accent2);
    drawGlowRing(w * 0.7, h * 0.62, size * 0.44 * pulse, palette.accent1);
    drawGlowRing(w * 0.52, h * 0.2, size * 0.26, palette.accent4);

    drawGlowLine(w * 0.1, h * 0.74, w * 0.9, h * 0.74, palette.accent3);
    drawGlowLine(w * 0.14, h * 0.18, w * 0.72, h * 0.48, palette.accent2);
  };
})();
