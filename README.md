# Arrowhead

A calm tap-away puzzle in GameHub: tap an arrow that has a clear way out and it slides off the
board. Clear every arrow to finish the picture. No ads, no lives, no timers.

Play: https://standan3126.github.io/arrowhead/

| File | What it holds |
|---|---|
| `index.html`, `css/game.css` | Screens and looks (Black on white, White on black, Night) |
| `js/engine.js` | The rules: free check, slide, bump, heavy arrows, undo, saves of a half-played board |
| `js/generate.js` | Fills a shape with arrows so the board can always be cleared |
| `js/shapes.js` | The shapes, as masks on a grid |
| `js/levels.js` | Level n of each path, always the same board |
| `js/draw-simple.js`, `js/board-view.js` | Drawing, zoom and pan, animations |
| `js/main.js` | Screens, settings, coins, Hint and Burn, lessons, saves and moving progress |
| `tools/check-levels.mjs` | Checks the first 300 levels can be cleared and never change |

```
npm install
npm run serve     # http://localhost:4200/arrowhead/ (needs the hub folder next to this one)
npm test          # rules, levels, then the game in phone-sized browsers
```

Uses the GameHub toolbox from `/shared/v1/` (Exit button, Tap to Start, saves, sounds, zoom and pan).
