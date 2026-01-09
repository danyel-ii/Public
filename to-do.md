# Bauhaus theme rollout (index.html)
- [x] Agent A: Draft token contract in `css/theme.base.css` (document tokens at top) and choose defaults.
- [x] Agent A: Build `css/theme.bauhaus.css` with four Bauhaus themes (`poster`, `grid`, `collage`, `neon`) using `:root[data-theme="..."]`.
- [x] Agent B: Refactor index components into `css/theme.base.css` using tokens; keep panels highly transparent and focus visible.
- [x] Agent C: Add p5 backgrounds (`js/p5/theme-router.js` + `poster.js`, `grid.js`, `collage.js`, `neon.js`) reading CSS variables and honoring reduced motion.
- [x] Agent D: Wire new CSS + p5 in `index.html`, set default `data-theme`, update cube theme toggles (same cube toggles back to default), keep green cube coffee chance behavior.
- [x] Agent E: QA pass (contrast, focus, reduced motion, mobile layout, no canvas click interception).
