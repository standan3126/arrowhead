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
