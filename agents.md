# agents.md — Codex Agent Roles & Working Agreement (Bauhaus Themes)

This file defines agent responsibilities and collaboration rules for implementing Bauhaus-inspired CSS themes and matching p5.js backgrounds inside an existing project.

## Shared Principles
- **Do not break existing pages.** Prefer additive styling and tokenization.
- **Theme via CSS variables** and `:root[data-theme="..."]`.
- **Keep animations subtle** and respect `prefers-reduced-motion`.
- **Accessibility is not optional:** visible focus, adequate contrast, semantic HTML preserved.
- **Performance matters:** p5 sketches must be lightweight and behind content.

---

## Agent Overview

### Agent A — Theme Architect (CSS Tokens & System)
**Mission**
Design the token system and define what’s shared vs theme-specific.

**Responsibilities**
- Create/approve `css/theme.base.css` token names and component contract.
- Define the four theme token blocks in `css/theme.bauhaus.css`.
- Ensure naming consistency (`--bg`, `--ink`, `--accent-1`, etc.).
- Provide guidance on mapping existing classes to the new system.

**Deliverables**
- Token spec (in comments at top of `theme.base.css`)
- Theme blocks skeleton for all 4 themes

**Definition of Done**
- Tokens cover all major UI surfaces (bg, text, border, shadow, accent, focus).

---

### Agent B — CSS Implementer (Components & Layout Adaptation)
**Mission**
Apply the token system to actual UI components without disturbing structure.

**Responsibilities**
- Implement component styles (hero, cards, pills, buttons, nav grid).
- Maintain responsiveness.
- Avoid over-specific selectors; prefer class-based styling and token usage.
- Ensure compatibility with existing CSS (load order, minimal collisions).

**Deliverables**
- Completed component styles in `css/theme.base.css`
- Theme-specific overrides where necessary

**Definition of Done**
- Switching `data-theme` yields distinct looks with stable layout.

---

### Agent C — p5 Sketch Engineer (4 Theme Sketches + Router)
**Mission**
Implement 4 small p5 sketches and a router that selects based on `data-theme`.

**Responsibilities**
- Implement `js/p5/theme-router.js`:
  - Single canvas, behind content, pointer-events none
  - Theme change detection (MutationObserver or polling)
  - `prefers-reduced-motion` => render once, no loop
  - Resize handling and pixel density control
- Implement four theme modules:
  - `poster.js`, `grid.js`, `collage.js`, `neon.js`
- Read palette from CSS variables where possible:
  - Use `getComputedStyle(document.documentElement)` for `--bg`, `--ink`, accents

**Deliverables**
- Working p5 backgrounds that match the aesthetic language of each theme

**Definition of Done**
- No console errors; canvas doesn’t intercept clicks; stable performance.

---

### Agent D — Integrator (HTML Wiring + Theme Switcher)
**Mission**
Hook the system into existing pages with minimal edits.

**Responsibilities**
- Update HTML to include new CSS files in correct order.
- Add/adjust `<html data-theme="...">` default.
- Add an optional theme switcher UI and persistence:
  - localStorage `theme`
  - early-apply script (avoid flash)
- Ensure background system plays nicely with any existing canvas (pixi, etc.):
  - Decide: replace or run alongside
  - Ensure z-index layering is correct

**Deliverables**
- Updated HTML entry points
- Optional theme switcher component
- Updated script includes for p5 router (only where needed)

**Definition of Done**
- Theme can be changed and persists; no FOUC; no layering bugs.

---

### Agent E — QA & Accessibility Reviewer
**Mission**
Prevent regressions and ensure accessibility + performance.

**Responsibilities**
- Verify keyboard navigation + focus rings in all themes.
- Check contrast (esp. neon theme).
- Validate reduced motion behavior.
- Smoke test on mobile sizes (320px+, portrait/landscape).
- Performance pass:
  - confirm background doesn’t stutter or consume excessive CPU
  - ensure resize doesn’t leak canvases or event handlers

**Deliverables**
- QA checklist results
- Issues filed with exact reproduction steps and screenshots if possible

**Definition of Done**
- Passes the checklist; no critical a11y regressions.

---

## Working Agreement (How Agents Collaborate)
1. **Start with tokens and base components** before theme-specific flourish.
2. **One agent owns a file at a time** (avoid merge conflicts):
   - Theme Architect: token blocks + naming
   - CSS Implementer: component rules
   - p5 Engineer: p5 files
   - Integrator: HTML wiring
3. **Every PR/change must include:**
   - Which theme(s) it affects
   - Before/after notes
   - How to verify manually (2–4 steps)
4. **Avoid “magic selectors”**:
   - Prefer `.nav-card` over `section a:nth-child(2)` etc.
5. **Reduced Motion rule**:
   - If reduced motion is enabled, animations must stop; backgrounds become static.

---

## Codex Prompts (Copy/Paste)

### Prompt for Theme Architect
You are Agent A (Theme Architect). Create a CSS token system for four Bauhaus themes using
`:root[data-theme="poster|grid|collage|neon"]`. Define shared tokens in `css/theme.base.css`
and theme overrides in `css/theme.bauhaus.css`. Keep selectors low-specificity and document tokens.

### Prompt for CSS Implementer
You are Agent B (CSS Implementer). Using the token system, style existing components:
hero, cards, nav grid, pills, buttons. Do not change HTML structure unless required.
Ensure responsiveness and visible focus in all themes.

### Prompt for p5 Sketch Engineer
You are Agent C (p5 Engineer). Implement `js/p5/theme-router.js` that attaches one p5 canvas
behind content and switches sketches based on `document.documentElement.dataset.theme`.
Implement four sketches (poster/grid/collage/neon) that are subtle, performant, and respect
`prefers-reduced-motion` (static frame only).

### Prompt for Integrator
You are Agent D (Integrator). Wire CSS and p5 into existing HTML pages with minimal edits:
add `data-theme`, add stylesheet links, add optional theme switcher with localStorage persistence,
and ensure the background canvas is behind content and doesn’t block interaction.

### Prompt for QA Reviewer
You are Agent E (QA). Verify all themes for accessibility (focus, contrast), responsiveness,
and reduced-motion. Report issues with clear reproduction steps and affected files/themes.

---

## Verification Checklist (Minimum)
- [ ] All pages still render and navigate correctly.
- [ ] Theme switching changes tokens and “feel” substantially.
- [ ] Focus visible in every theme.
- [ ] Reduced motion stops background animation.
- [ ] Canvas doesn’t intercept clicks (pointer-events: none).
- [ ] No console errors; resize doesn’t create multiple canvases.