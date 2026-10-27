// The Simple Arrows look: a thick line with a big solid point, one color on a plain background.
// Sizes are in cells (the view scales the canvas so one cell = one unit).

export const THEMES = {
  black: { bg: '#faf8f3', ink: '#1c1c1c', flash: '#d0412f', panel: 'rgba(255,255,255,0.92)', soft: '#77736a', line: 'rgba(0,0,0,0.14)' },
  white: { bg: '#141414', ink: '#f4f4f4', flash: '#ff7b68', panel: 'rgba(40,40,40,0.94)', soft: '#a9a9a9', line: 'rgba(255,255,255,0.16)' },
  // Night: warm only (no blue light): light orange on very dark brown.
  night: { bg: '#1a0e06', ink: '#ffb46a', flash: '#ff5a1f', panel: 'rgba(48,28,14,0.95)', soft: '#c98a52', line: 'rgba(255,180,106,0.2)' },
}

const LINE = 0.24 // line width
const HEAD_LEN = 0.62 // from the point back to the base of the head
const HEAD_HALF = 0.34 // half the head's width (head is ~2.8× the line)

// pts: the arrow's centre line, tail first, in board units. dir: [dx, dy] the head points.
// minPx: one screen pixel in board units, so lines never get thinner than ~1.6 px.
export function drawArrow(ctx, pts, dir, color, minPx) {
  const [dx, dy] = dir
  const [hx, hy] = pts[pts.length - 1]
  const tipX = hx + dx * 0.42
  const tipY = hy + dy * 0.42
  const baseX = tipX - dx * HEAD_LEN
  const baseY = tipY - dy * HEAD_LEN
  const scale = Math.max(1, (1.6 * minPx) / LINE)

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = LINE * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.lineTo(baseX + dx * 0.05, baseY + dy * 0.05)
  ctx.stroke()

  const half = HEAD_HALF * Math.min(scale, 1.4)
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(baseX - dy * half, baseY + dx * half)
  ctx.lineTo(baseX + dy * half, baseY - dx * half)
  ctx.closePath()
  ctx.fill()
}
