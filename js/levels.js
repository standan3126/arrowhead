// The levels of each path. A level is made from its path and number alone, so level 12 is the
// same board on every phone, every time. **Never change what an existing level number makes**:
// half-played boards are saved by arrow id. To change the ramp, start it from a later level.
//
//   simple   Simple Arrows: plain arrows in big shapes, classic rules
//   native   Arrowhead: stone points in nature shapes; heavy arrows from HEAVY_FROM

import { fillShape, hashText, seeded } from './generate.js'
import { Board, solveRounds } from './engine.js'
import { NATIVE_SHAPES, SHAPES, blob, maskFor } from './shapes.js'

const SPECIALS = ['heart', 'diamond', 'star', 'blob', 'hexagon', 'ring', 'drop', 'plus']
const NATIVE_SPECIALS = ['owl', 'moon', 'fish', 'campfire', 'feather', 'bear', 'sun', 'turtle', 'wolf', 'pine', 'mountains', 'arrowhead', 'canoe']
export const HEAVY_FROM = 30 // the first level with heavy arrows (a small lesson)
const CANDIDATES = 4 // boards tried per level; the fullest one is kept

// How big and how tangled level n is.
export function recipe(n, path = 'simple') {
  const side = Math.round(4 + 36 * (1 - Math.exp(-(n - 1) / 70)))
  let shape = 'square'
  if (n > 3) shape = n % 2 ? 'rectangle' : 'circle'
  if (path === 'native') {
    if (side >= 12 && n % 3 === 0) shape = NATIVE_SPECIALS[(n / 3) % NATIVE_SPECIALS.length]
  } else if (side >= 10 && n % 4 === 0) shape = SPECIALS[(n / 4) % SPECIALS.length]
  return {
    side,
    shape,
    minLen: 2,
    maxLen: Math.min(16, 3 + Math.floor(n / 6)),
    straight: Math.max(0.4, 0.75 - n * 0.004),
    reach: Math.min(3, n * 0.04),
    tangle: Math.min(4, n * 0.05),
  }
}

// How many heavy arrows level n of the Arrowhead path has.
export function heavyCount(n, arrows) {
  if (n < HEAVY_FROM) return 0
  if (n === HEAVY_FROM) return 3
  return Math.round(arrows * Math.min(0.15, 0.03 + (n - HEAVY_FROM) * 0.002))
}

export function generateLevel(path, n) {
  const r = recipe(n, path)
  let best = null
  for (let k = 0; k < CANDIDATES; k++) {
    const rand = seeded(hashText(`${path}:${n}:${k}`))
    const shape = r.shape === 'blob' ? blob(rand) : SHAPES[r.shape] ?? NATIVE_SHAPES[r.shape]
    const { w, h, mask } = maskFor(shape, r.side)
    const arrows = fillShape({ w, h, mask, rand, minLen: r.minLen, maxLen: r.maxLen, straight: r.straight, reach: r.reach, tangle: r.tangle })
    let cells = 0
    let filled = 0
    for (const m of mask) cells += m
    for (const a of arrows) filled += a.cells.length
    const level = { path, n, shape: r.shape, w, h, mask, arrows, fill: filled / cells }
    if (!best || level.fill > best.fill + 1e-9) best = level
  }
  best.rounds = solveRounds(best)
  if (path === 'native') makeHeavy(best)
  return best
}

// Heavy arrows are picked among those that start blocked with room to slide, so they matter.
// The board stays solvable: in the order it was built, no arrow is ever blocked.
function makeHeavy(level) {
  const count = heavyCount(level.n, level.arrows.length)
  if (!count) return
  const rand = seeded(hashText(`${level.path}:${level.n}:heavy`))
  const board = new Board(level)
  const picks = level.arrows
    .map((a, id) => ({ id, look: board.look(id) }))
    .filter(({ look }) => !look.free && look.room > 0)
    .map(({ id }) => id)
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[picks[i], picks[j]] = [picks[j], picks[i]]
  }
  for (const id of picks.slice(0, count)) level.arrows[id].heavy = true
}
