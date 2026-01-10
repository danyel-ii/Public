(() => {
  const themes = window.StudybookP5Themes || (window.StudybookP5Themes = {});

  themes.collage = (p, palette, state) => {
    const w = p.width;
    const h = p.height;
    const t = state.reducedMotion ? 0 : p.millis() * 0.00025;

    const withAlpha = (value, alpha) => {
      const c = p.color(value || "#000");
      c.setAlpha(Math.round(alpha * 255));
      return c;
    };

    if (!state.cache.collage || state.cache.collage.w !== w || state.cache.collage.h !== h) {
      const shapes = [];
      p.randomSeed(21);
      const accents = ["accent1", "accent2", "accent3"];
      for (let i = 0; i < 7; i += 1) {
        const pick = accents[i % accents.length];
        shapes.push({
          x: p.random(w * 0.1, w * 0.9),
          y: p.random(h * 0.12, h * 0.88),
          width: p.random(w * 0.12, w * 0.32),
          height: p.random(h * 0.08, h * 0.24),
          rotate: p.random(-0.4, 0.4),
          colorKey: pick,
          alpha: p.random(0.16, 0.24)
        });
      }
      state.cache.collage = { shapes, w, h };
    }

    const shapes = state.cache.collage.shapes;
    shapes.forEach((shape, index) => {
      p.push();
      p.translate(shape.x, shape.y);
      const wobble = state.reducedMotion ? 0 : Math.sin(t + index) * 0.03;
      p.rotate(shape.rotate + wobble);
      const color = palette[shape.colorKey] || palette.accent1;
      p.fill(withAlpha(color, shape.alpha));
      p.noStroke();
      p.rect(-shape.width / 2, -shape.height / 2, shape.width, shape.height, 16);
      p.pop();
    });

    p.stroke(withAlpha(palette.accent4, 0.2));
    p.strokeWeight(2);
    p.noFill();
    p.beginShape();
    const baseY = h * 0.65;
    for (let x = 0; x <= w; x += w / 12) {
      const offset = state.reducedMotion ? 0 : p.noise(x * 0.01, t * 0.6) * 18;
      p.vertex(x, baseY + offset);
    }
    p.endShape();
  };
})();
