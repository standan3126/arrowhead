// The levels of each path. A level is made from its path and number alone, so level 12 is the
// same board on every phone, every time. **Never change what an existing level number makes**:
// half-played boards are saved by arrow id. To change the ramp, start it from a later level.
//
//   simple   Simple Arrows: plain arrows in big shapes, classic rules
//   native   Arrowhead (coming next)

import { fillShape, hashText, seeded } from './generate.js'
import { solveRounds } from './engine.js'
import { SHAPES, blob, maskFor } from './shapes.js'

const SPECIALS = ['heart', 'diamond', 'star', 'blob', 'hexagon', 'ring', 'drop', 'plus']
const CANDIDATES = 4 // boards tried per level; the fullest one is kept

// How big and how tangled level n is.
export function recipe(n) {
  const side = Math.round(4 + 36 * (1 - Math.exp(-(n - 1) / 70)))
  let shape = 'square'
  if (n > 3) shape = n % 2 ? 'rectangle' : 'circle'
  if (side >= 10 && n % 4 === 0) shape = SPECIALS[(n / 4) % SPECIALS.length]
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

export function generateLevel(path, n) {
  const r = recipe(n)
  let best = null
  for (let k = 0; k < CANDIDATES; k++) {
    const rand = seeded(hashText(`${path}:${n}:${k}`))
    const shape = r.shape === 'blob' ? blob(rand) : SHAPES[r.shape]
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
  return best
}
