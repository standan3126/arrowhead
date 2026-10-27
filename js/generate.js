// Makes a level: fills a shape with arrows so the board can always be cleared.
//
// How it stays solvable: arrows are placed one at a time, and each new arrow's head must look
// out past every arrow placed before it. Clearing them in the opposite order then always works
// (the last one placed is free at the start; once it's gone the one before it is free, and so
// on), so a solution exists before the player taps anything.
//
// Everything comes from a seeded random, so the same level number always gives the same board.

import { DIRS } from './engine.js'

// A small, fast seeded random (mulberry32). Returns numbers in [0, 1).
export function seeded(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// A number from a piece of text, for seeds like "simple:12".
export function hashText(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const shuffle = (list, rand) => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// mask: Uint8Array(w * h), 1 = part of the shape.
// minLen/maxLen: arrow length in cells. straight: chance a body keeps going straight.
// reach: how much heads prefer to point across the board (longer lines in front of them).
// tangle: how much heads prefer to point at arrows already placed (they will have to wait).
//
// Every arrow gets an "order": the board is cleared from the highest order to the lowest.
// An arrow's line must only cross arrows with a higher order (they leave first), and no arrow
// with a higher order may have its line cross this arrow. A new arrow fits wherever there's room
// for its order between those two limits, so arrows can slot in anywhere, not just at the end.
export function fillShape({ w, h, mask, rand, minLen = 2, maxLen = 6, straight = 0.6, reach = 1, tangle = 0 }) {
  const occ = new Int32Array(w * h).fill(-1)
  const inMask = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  const empty = (x, y) => inMask(x, y) && occ[y * w + x] === -1
  const bodies = [] // head first while building
  const order = []
  const rays = []
  const cover = Array.from({ length: w * h }, () => []) // orders of the lines crossing each cell
  const coverMax = (c) => cover[c].reduce((m, o) => Math.max(m, o), -Infinity)
  const GAP = 1e-9

  const rayOf = (x, y, dx, dy) => {
    const cells = []
    for (x += dx, y += dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) cells.push(y * w + x)
    return cells
  }

  // Cells that might become a head, in random order. A cell that can't be a head now may still
  // be one later (its limits change as arrows arrive), so it gets one more try at the end.
  const heads = []
  for (let i = 0; i < w * h; i++) if (mask[i]) heads.push(i)
  shuffle(heads, rand)

  const tryHead = (i) => {
    const hx = i % w
    const hy = (i - hx) / w
    const options = []
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d]
      if (!empty(hx - dx, hy - dy)) continue
      const ray = rayOf(hx, hy, dx, dy)
      let hits = Infinity // must stay below the lowest order this line crosses
      let open = 0
      let blocked = 0
      for (const c of ray) {
        if (occ[c] !== -1) {
          hits = Math.min(hits, order[occ[c]])
          blocked++
        } else if (mask[c]) open++
      }
      const lo = Math.max(coverMax(i), coverMax((hy - dy) * w + hx - dx))
      if (!(lo + GAP < hits)) continue
      options.push({ d, ray, hits, lo, weight: 1 + reach * open + tangle * blocked })
    }
    if (!options.length) return false
    let pick = rand() * options.reduce((n, o) => n + o.weight, 0)
    const choice = options.find((o) => (pick -= o.weight) < 0) ?? options[options.length - 1]
    const [dx, dy] = DIRS[choice.d]
    const onRay = new Set(choice.ray)
    const id = bodies.length
    let lo = choice.lo

    // Grow the body backwards from the head, only through cells that keep the limits apart.
    const target = minLen + Math.floor(rand() * (maxLen - minLen + 1))
    const body = [[hx, hy], [hx - dx, hy - dy]]
    occ[i] = id
    occ[(hy - dy) * w + hx - dx] = id
    let [wx, wy] = [-dx, -dy] // walking direction (away from the head)
    while (body.length < target) {
      const [cx, cy] = body[body.length - 1]
      const turns = rand() < 0.5 ? [[wy, -wx], [-wy, wx]] : [[-wy, wx], [wy, -wx]]
      const tries = rand() < straight ? [[wx, wy], ...turns] : [...turns, [wx, wy]]
      const step = tries.find(([sx, sy]) => {
        const c = (cy + sy) * w + cx + sx
        return empty(cx + sx, cy + sy) && !onRay.has(c) && Math.max(lo, coverMax(c)) + GAP < choice.hits
      })
      if (!step) break
      ;[wx, wy] = step
      const c = (cy + wy) * w + cx + wx
      lo = Math.max(lo, coverMax(c))
      body.push([cx + wx, cy + wy])
      occ[c] = id
    }
    const hi = choice.hits
    const o = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2
    bodies.push(body)
    order.push(o)
    rays.push(onRay)
    for (const c of choice.ray) cover[c].push(o)
    return true
  }

  const later = []
  for (const i of heads) if (occ[i] === -1 && !tryHead(i)) later.push(i)
  for (const i of later) if (occ[i] === -1) tryHead(i)

  // Leftover cells join the tail of a neighbor when every line crossing them belongs to an
  // arrow that leaves after that neighbor.
  for (let grew = true; grew; ) {
    grew = false
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || occ[i] !== -1) continue
      const x = i % w
      const y = (i - x) / w
      for (const [dx, dy] of DIRS) {
        if (!inMask(x + dx, y + dy)) continue
        const n = occ[(y + dy) * w + x + dx]
        if (n === -1) continue
        const body = bodies[n]
        const [tx, ty] = body[body.length - 1]
        if (tx !== x + dx || ty !== y + dy) continue
        if (body.length >= maxLen + 3 || rays[n].has(i) || !(coverMax(i) < order[n])) continue
        body.push([x, y])
        occ[i] = n
        grew = true
        break
      }
    }
  }

  // Tail first, head last; ids from the last to leave to the first (highest order last).
  return bodies
    .map((body, n) => ({ cells: body.slice().reverse(), o: order[n] }))
    .sort((a, b) => a.o - b.o)
    .map(({ cells }) => ({ cells }))
}
