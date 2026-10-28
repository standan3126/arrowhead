// The Arrowhead look: a knapped stone point, a wooden shaft, two feathers at the tail, on plain
// warm sand (or, at night, warm amber on dark brown). Heavy arrows have a darker, bigger point and
// a dark binding on the shaft. Zoomed far out the details can't be seen, so it falls back to the
// plain arrow shape in the same colors, which keeps every point easy to read.
// Sizes are in cells (the view scales the canvas so one cell = one unit).

import { drawArrow } from './draw-simple.js'

export const NATIVE_THEMES = {
  day: {
    bg: '#efe4cd',
    ink: '#5b3f26', // shaft
    stone: '#77706a',
    stoneLight: '#aaa196',
    stoneEdge: '#423c37',
    heavyStone: '#2f2a26',
    band: '#1d1915',
    feather: '#a9502c',
    featherDark: '#3a2a20',
    flash: '#c23b22',
  },
  night: {
    bg: '#1a0e06',
    ink: '#c98742',
    stone: '#ffb46a',
    stoneLight: '#ffd7a6',
    stoneEdge: '#8a4d1c',
    heavyStone: '#b35a1a',
    band: '#3d1c06',
    feather: '#e0883a',
    featherDark: '#7a3f12',
    flash: '#ff5a1f',
  },
}

const DETAIL_PX = 15 // below this many screen pixels per cell, draw the plain shape

// opts: { color } to light the arrow up (a bump, a hint), { heavy }.
export function drawNativeArrow(ctx, pts, dir, t, px, { color = null, heavy = false } = {}) {
  if (px > 1 / DETAIL_PX) {
    drawArrow(ctx, pts, dir, color ?? (heavy ? t.heavyStone : t.ink), px)
    return
  }
  const [dx, dy] = dir
  const [nx, ny] = [-dy, dx]
  const [hx, hy] = pts[pts.length - 1]
  const at = (along, side) => [hx + dx * along + nx * side, hy + dy * along + ny * side]

  // Feathers: two vanes along the last bit of the tail, swept back.
  const [tx, ty] = pts[0]
  let [fx, fy] = [pts[1][0] - tx, pts[1][1] - ty]
  const fl = Math.hypot(fx, fy) || 1
  fx /= fl
  fy /= fl
  const [gx, gy] = [-fy, fx]
  const tail = (along, side) => [tx + fx * along + gx * side, ty + fy * along + gy * side]
  for (const s of [1, -1]) {
    const vane = [tail(0.6, 0), tail(0.32, 0.27 * s), tail(0.02, 0.27 * s), tail(0.1, 0)]
    ctx.fillStyle = t.feather
    ctx.beginPath()
    ctx.moveTo(...vane[0])
    for (const p of vane.slice(1)) ctx.lineTo(...p)
    ctx.closePath()
    ctx.fill()
    // A dark stripe across each vane.
    ctx.strokeStyle = t.featherDark
    ctx.lineWidth = 0.06
    ctx.beginPath()
    ctx.moveTo(...tail(0.4, 0.02 * s))
    ctx.lineTo(...tail(0.2, 0.25 * s))
    ctx.stroke()
  }

  // The shaft.
  const scale = heavy ? 1.2 : 1
  ctx.strokeStyle = color ?? t.ink
  ctx.lineWidth = Math.max(0.13, 1.4 * px)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  for (let i = 1; i < pts.length - 1; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.lineTo(...at(-0.12, 0))
  ctx.stroke()

  if (heavy) {
    // A wrapped binding behind the point.
    ctx.strokeStyle = t.band
    ctx.lineWidth = 0.3
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(...at(-0.28, 0))
    ctx.lineTo(...at(-0.62, 0))
    ctx.stroke()
    ctx.lineCap = 'round'
  }

  // The stone point: a side-notched triangle.
  const k = scale
  const point = [
    at(0.48 * k, 0),
    at(-0.06 * k, 0.31 * k),
    at(-0.12 * k, 0.15 * k),
    at(-0.24 * k, 0.24 * k),
    at(-0.2 * k, 0),
    at(-0.24 * k, -0.24 * k),
    at(-0.12 * k, -0.15 * k),
    at(-0.06 * k, -0.31 * k),
  ]
  ctx.fillStyle = color ?? (heavy ? t.heavyStone : t.stone)
  ctx.strokeStyle = t.stoneEdge
  ctx.lineWidth = 0.035
  ctx.beginPath()
  ctx.moveTo(...point[0])
  for (const p of point.slice(1)) ctx.lineTo(...p)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Flake marks from knapping.
  ctx.strokeStyle = t.stoneLight
  ctx.lineWidth = 0.025
  ctx.beginPath()
  ctx.moveTo(...at(0.4 * k, 0))
  ctx.lineTo(...at(-0.14 * k, 0))
  for (const [a, b] of [
    [0.2, 0.12],
    [0.02, 0.2],
  ]) {
    ctx.moveTo(...at(a * k, b * k))
    ctx.lineTo(...at((a - 0.1) * k, 0.03 * k))
    ctx.moveTo(...at(a * k, -b * k))
    ctx.lineTo(...at((a - 0.1) * k, -0.03 * k))
  }
  ctx.stroke()
}
