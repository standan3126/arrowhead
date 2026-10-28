// The shapes arrows are packed into, as masks on a grid (1 = part of the shape).
//
// Each shape is a test on a point (u, v), both from -1 to 1 across the grid, v going down, so
// the same shape works at any size. `aspect` is the grid's height / width.

const TAU = Math.PI * 2

// Points inside a polygon (even-odd rule). pts: [[u, v], ...]
function inPolygon(pts, u, v) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ui, vi] = pts[i]
    const [uj, vj] = pts[j]
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside
  }
  return inside
}

const star = (points, outer, inner) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer
    const a = (i / (points * 2)) * TAU - Math.PI / 2
    return [r * Math.cos(a), r * Math.sin(a) + 0.06]
  })

const polygon = (sides, r, turn = 0) =>
  Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * TAU + turn
    return [r * Math.cos(a), r * Math.sin(a)]
  })

const STAR = star(5, 1.02, 0.5)
const HEXAGON = polygon(6, 1, 0)

export const SHAPES = {
  rectangle: { aspect: 1.3, test: () => true },
  square: { aspect: 1, test: () => true },
  circle: { aspect: 1, test: (u, v) => u * u + v * v <= 1 },
  diamond: { aspect: 1.25, test: (u, v) => Math.abs(u) + Math.abs(v) <= 1.02 },
  heart: {
    aspect: 0.95,
    test: (u, v) => {
      // The classic heart curve, nudged to fill the grid.
      const x = u * 1.22
      const y = -(v * 1.25 - 0.18)
      const a = x * x + y * y - 1
      return a * a * a - x * x * y * y * y <= 0
    },
  },
  star: { aspect: 1, test: (u, v) => inPolygon(STAR, u, v) },
  hexagon: { aspect: 1.1, test: (u, v) => inPolygon(HEXAGON, u, v / 1.1) },
  ring: {
    aspect: 1,
    test: (u, v) => {
      const r = u * u + v * v
      return r <= 1 && r >= 0.16
    },
  },
  plus: { aspect: 1, test: (u, v) => Math.abs(u) <= 0.38 || Math.abs(v) <= 0.38 },
  drop: {
    aspect: 1.25,
    test: (u, v) => {
      // A round bottom with a point on top.
      const y = (v + 1) / 2 // 0 at the top, 1 at the bottom
      if (y > 0.55) return u * u + ((y - 0.55) / 0.45) ** 2 <= 1
      return Math.abs(u) <= Math.sin((y / 0.55) * (Math.PI / 2)) ** 1.4
    },
  },
}

// A soft random blob: a circle whose edge waves in and out. Same seed, same blob.
export function blob(rand) {
  const waves = Array.from({ length: 4 }, (_, i) => ({ k: i + 2, a: (0.16 / (i + 1)) * (0.5 + rand()), p: rand() * TAU }))
  return {
    aspect: 1,
    test: (u, v) => {
      const a = Math.atan2(v, u)
      let r = 0.8
      for (const w of waves) r += w.a * Math.sin(w.k * a + w.p)
      return Math.hypot(u, v) <= Math.min(1, r)
    },
  }
}

// --- Arrowhead path: nature and everyday things, drawn here as simple outlines -------------------

const disc = (u, v, cx, cy, r) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r
const oval = (u, v, cx, cy, rx, ry) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1
// A thin bar from (ax, ay) to (bx, by), w wide.
const bar = (u, v, ax, ay, bx, by, w) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(u - ax - t * dx, v - ay - t * dy) <= w / 2
}
// A teardrop pointing up, filling the box u in [-1, 1], v in [-1, 1].
const drop = SHAPES.drop.test

const WOLF = [
  [0.98, 0.02], [0.55, -0.1], [0.25, -0.3], [0.12, -1], [-0.12, -0.45], [-0.34, -0.95], [-0.48, -0.32],
  [-0.78, 0.05], [-0.9, 1], [0.12, 1], [0.2, 0.55], [0.55, 0.28], [0.98, 0.24],
]
const ARROWHEAD = [
  [0, -1], [0.62, 0.38], [0.36, 0.5], [0.62, 0.95], [0.12, 0.8], [0, 0.92], [-0.12, 0.8], [-0.62, 0.95], [-0.36, 0.5], [-0.62, 0.38],
]
const MOUNTAINS = [[-1, 0.85], [-0.35, -0.75], [-0.02, -0.2], [0.35, -0.55], [1, 0.85]]
const PINE = [
  [0, -1], [0.42, -0.45], [0.22, -0.45], [0.62, 0.05], [0.36, 0.05], [0.8, 0.55], [0.13, 0.55], [0.13, 0.95],
  [-0.13, 0.95], [-0.13, 0.55], [-0.8, 0.55], [-0.36, 0.05], [-0.62, 0.05], [-0.22, -0.45], [-0.42, -0.45],
]

export const NATIVE_SHAPES = {
  owl: {
    aspect: 1.15,
    test: (u, v) => {
      const body = oval(u, v, 0, 0.12, 0.74, 0.86) || inPolygon([[-0.72, -0.35], [-0.68, -1], [-0.2, -0.62]], u, v) || inPolygon([[0.72, -0.35], [0.68, -1], [0.2, -0.62]], u, v)
      const eyes = disc(u, v, -0.3, -0.25, 0.2) || disc(u, v, 0.3, -0.25, 0.2)
      return body && !eyes
    },
  },
  wolf: { aspect: 1, test: (u, v) => inPolygon(WOLF, u, v) },
  fish: {
    aspect: 0.62,
    test: (u, v) =>
      (oval(u, v, -0.18, 0, 0.72, 0.62) || inPolygon([[0.42, 0], [1, -0.75], [0.84, 0], [1, 0.75]], u, v) || inPolygon([[-0.4, -0.5], [-0.05, -1], [0.15, -0.45]], u, v)) &&
      !disc(u, v, -0.58, -0.12, 0.11),
  },
  bear: {
    aspect: 0.95,
    test: (u, v) => (disc(u, v, 0, 0.12, 0.8) || disc(u, v, -0.62, -0.62, 0.3) || disc(u, v, 0.62, -0.62, 0.3)) && !disc(u, v, -0.3, -0.05, 0.11) && !disc(u, v, 0.3, -0.05, 0.11),
  },
  campfire: {
    aspect: 1.1,
    test: (u, v) => {
      if (v < 0.42) return drop(u / 0.62, ((v + 1) / 1.42) * 2 - 1)
      return bar(u, v, -0.92, 0.55, 0.92, 0.92, 0.24) || bar(u, v, -0.92, 0.92, 0.92, 0.55, 0.24)
    },
  },
  feather: {
    aspect: 1.15,
    test: (u, v) => {
      // Along a slanted spine from the bottom left to the top right.
      const a = 0.95
      const x = -(u * Math.cos(a) - v * Math.sin(a))
      const y = u * Math.sin(a) + v * Math.cos(a)
      const t = (x + 0.95) / 1.95 // 0 at the quill end, 1 at the tip
      if (t < 0 || t > 1) return false
      if (t < 0.12) return Math.abs(y) <= 0.08
      const half = 0.36 * Math.sin(((t - 0.12) / 0.88) * Math.PI) ** 0.7
      const notch = t > 0.42 && t < 0.5 && y > 0.1 // a little split in the vane
      return Math.abs(y) <= half && !notch
    },
  },
  moon: { aspect: 1, test: (u, v) => disc(u, v, 0, 0, 1) && !disc(u, v, 0.45, -0.22, 0.82) },
  sun: {
    aspect: 1,
    test: (u, v) => {
      const r = Math.hypot(u, v)
      if (r <= 0.52) return true
      if (r < 0.64 || r > 1.02) return false
      const step = Math.PI / 4
      const a = Math.atan2(v, u)
      const off = Math.abs(a - Math.round(a / step) * step)
      return off * r <= 0.3 * (1 - (r - 0.64) / 0.45)
    },
  },
  turtle: {
    aspect: 0.9,
    test: (u, v) =>
      oval(u, v, -0.05, 0, 0.66, 0.56) || disc(u, v, 0.8, 0, 0.2) || [[-0.52, -0.56], [0.38, -0.56], [-0.52, 0.56], [0.38, 0.56]].some(([x, y]) => disc(u, v, x, y, 0.25)) || bar(u, v, -0.7, 0, -0.98, 0, 0.12),
  },
  pine: { aspect: 1.3, test: (u, v) => inPolygon(PINE, u, v) },
  mountains: { aspect: 0.7, test: (u, v) => inPolygon(MOUNTAINS, u, v) },
  canoe: {
    aspect: 0.4,
    test: (u, v) => v >= -0.55 - 0.45 * u ** 6 && v <= 0.95 - 1.5 * u * u && Math.abs(u) <= 1,
  },
  arrowhead: { aspect: 1.25, test: (u, v) => inPolygon(ARROWHEAD, u, v) },
}

// The grid for a shape: w cells wide, height from the shape's aspect.
export function maskFor(shape, w) {
  const h = Math.max(2, Math.round(w * shape.aspect))
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1
      const v = ((y + 0.5) / h) * 2 - 1
      if (shape.test(u, v)) mask[y * w + x] = 1
    }
  }
  return { w, h, mask }
}
