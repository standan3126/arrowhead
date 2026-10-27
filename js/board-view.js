// Shows a board on a canvas: zoom and pan (toolbox PanZoom), taps on arrows, and the slide,
// bump and fly-away animations. The rules live in engine.js; this only draws them.

import { PanZoom } from '/shared/v1/panzoom.js'
import { headDir, trackOf } from './engine.js'
import { drawArrow } from './draw-simple.js'

const M = 0.8 // empty border around the board, in cells
const MAX_CELL = 72 // screen pixels per cell at the most zoom
const REACH = 22 // screen pixels: a tap this close to an arrow counts as on it
const SPEED = 13 // cells per second when an arrow starts to fly
const PUSH = 70 // ...and how fast it speeds up (cells per second²)
const BUMP_SPEED = 16
const FLASH = 0.7 // seconds a blocker stays lit after a bump

const now = () => performance.now() / 1000

// A point part-way along a track of cells (f in cells from the start), in board units.
function along(track, f) {
  const i = Math.max(0, Math.min(track.length - 2, Math.floor(f)))
  const t = f - i
  const [ax, ay] = track[i]
  const [bx, by] = track[i + 1]
  return [ax + (bx - ax) * t + 0.5 + M, ay + (by - ay) * t + 0.5 + M]
}

// The centre line of an arrow of length L whose tail is f cells along its track.
function snake(track, f, L) {
  const pts = [along(track, f)]
  for (let i = Math.floor(f) + 1; i < f + L - 1; i++) pts.push(along(track, i))
  pts.push(along(track, f + L - 1))
  const e = Math.min(track.length - 1, Math.max(1, Math.ceil(f + L - 1)))
  const [ax, ay] = track[e - 1]
  const [bx, by] = track[e]
  return { pts, dir: [bx - ax, by - ay] }
}

export class BoardView {
  constructor(canvas, { onTap }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onTapArrow = onTap
    this.theme = null
    this.board = null
    this.anims = new Map() // arrow id -> animation
    this.flashes = new Map() // arrow id -> time it stops being lit
    this.hint = -1
    this.pz = new PanZoom(canvas, {
      width: 10,
      height: 10,
      onTap: (x, y) => this.tapAt(x, y),
      onChange: () => this.draw(),
    })
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  setTheme(theme) {
    this.theme = theme
    this.draw()
  }

  setBoard(board) {
    this.board = board
    this.anims.clear()
    this.flashes.clear()
    this.hint = -1
    this.pz.maxScale = MAX_CELL
    this.pz.setContent(board.w + 2 * M, board.h + 2 * M)
    this.resize()
  }

  resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    this.dpr = Math.min(devicePixelRatio || 1, 3)
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.pz.resize(w, h)
    this.draw()
  }

  fit() {
    this.pz.fit()
  }

  // Centers an arrow's head on screen, zoomed in enough to see it clearly.
  showArrow(id) {
    const a = this.board.arrows[id]
    const [x, y] = a.cells[a.cells.length - 1]
    this.pz.show(x + 0.5 + M, y + 0.5 + M, 34)
  }

  // Board units → the arrow under (or within a finger's width of) that spot.
  arrowAt(x, y) {
    const b = this.board
    const cx = Math.floor(x - M)
    const cy = Math.floor(y - M)
    const direct = b.at(cx, cy)
    if (direct !== -1) return direct
    const reach = Math.max(0.6, REACH / this.pz.s)
    const r = Math.ceil(reach)
    let best = -1
    let bestD = reach
    for (let yy = cy - r; yy <= cy + r; yy++) {
      for (let xx = cx - r; xx <= cx + r; xx++) {
        const id = b.at(xx, yy)
        if (id === -1) continue
        const d = Math.hypot(xx + 0.5 + M - x, yy + 0.5 + M - y)
        if (d < bestD) {
          bestD = d
          best = id
        }
      }
    }
    return best
  }

  tapAt(x, y) {
    if (!this.board) return
    const id = this.arrowAt(x, y)
    if (id !== -1) this.onTapArrow(id)
  }

  // Where an arrow is on screen (client pixels), for the tests: the middle of its head cell.
  screenPoint(id) {
    const a = this.board.arrows[id]
    const [x, y] = a.cells[a.cells.length - 1]
    return this.pz.toScreen(x + 0.5 + M, y + 0.5 + M)
  }

  // --- Animations ------------------------------------------------------------------------------

  // result: what Board.tap / burn / undo returned.
  play(result) {
    const { kind, id, cells } = result
    const t0 = now()
    const L = cells.length
    if (this.hint === id) this.hint = -1
    if (kind === 'exit') {
      const track = trackOf(cells, this.board.w, this.board.h, 4 + L)
      const dist = track.length - L
      const dur = (-SPEED + Math.sqrt(SPEED * SPEED + 2 * PUSH * dist)) / PUSH
      this.anims.set(id, { kind, track, L, t0, dur, pos: (t) => SPEED * t + 0.5 * PUSH * t * t })
    } else if (kind === 'bump' || kind === 'move') {
      const track = trackOf(cells, this.board.w, this.board.h)
      const reach = kind === 'bump' ? result.room + 0.3 : result.room
      const out = Math.max(0.12, reach / BUMP_SPEED)
      const back = kind === 'bump' ? out * 1.3 : 0.12
      const ease = (p) => 1 - (1 - p) * (1 - p)
      const pos =
        kind === 'bump'
          ? (t) => (t < out ? reach * ease(t / out) : reach * (1 - ease(Math.min(1, (t - out) / back))))
          : (t) => (t < out ? reach * ease(t / out) : reach)
      this.anims.set(id, { kind, track, L, t0, dur: out + back, pos })
      if (result.blocker !== -1) this.flashes.set(result.blocker, t0 + out + FLASH)
      if (kind === 'bump') this.flashes.set(id, t0 + out + FLASH * 0.6)
    } else if (kind === 'burn') {
      this.anims.set(id, { kind, track: cells, L, t0, dur: 0.6, pos: () => 0 })
    } else {
      // Undo: the arrow simply fades back in where it was.
      this.anims.set(id, { kind: 'return', track: cells.concat([]), L, t0, dur: 0.25, pos: () => 0 })
    }
    this.draw()
  }

  showHint(id) {
    this.hint = id
    this.draw()
  }

  get busy() {
    return this.anims.size > 0
  }

  // --- Drawing ---------------------------------------------------------------------------------

  draw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  render() {
    const { ctx, board, theme, pz } = this
    if (!board || !theme) return
    const dpr = this.dpr || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(dpr * pz.s, 0, 0, dpr * pz.s, dpr * pz.tx, dpr * pz.ty)
    const px = 1 / pz.s
    const t = now()
    let more = false

    for (const a of board.arrows) {
      if (a.gone || this.anims.has(a.id)) continue
      let color = theme.ink
      const lit = this.flashes.get(a.id)
      if (lit && lit > t) {
        color = theme.flash
        more = true
      } else if (lit) this.flashes.delete(a.id)
      if (this.hint === a.id) {
        color = theme.flash
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 3))
        more = true
      }
      const pts = a.cells.map(([x, y]) => [x + 0.5 + M, y + 0.5 + M])
      drawArrow(ctx, pts, headDir(a.cells), color, px)
      ctx.globalAlpha = 1
    }

    for (const [id, an] of this.anims) {
      const e = t - an.t0
      if (e >= an.dur) {
        this.anims.delete(id)
        if (an.kind !== 'exit' && an.kind !== 'burn') more = true // draw it settled next frame
        continue
      }
      more = true
      const p = e / an.dur
      let color = theme.ink
      const lit = this.flashes.get(id)
      if (lit && lit > t) color = theme.flash
      if (an.kind === 'exit') ctx.globalAlpha = Math.max(0, 1 - p ** 4)
      if (an.kind === 'burn') ctx.globalAlpha = 1 - p
      if (an.kind === 'return') ctx.globalAlpha = p
      if (an.kind === 'burn' || an.kind === 'return') {
        const pts = an.track.map(([x, y]) => [x + 0.5 + M, y + 0.5 + M])
        drawArrow(ctx, pts, headDir(an.track), an.kind === 'burn' ? theme.flash : color, px)
      } else {
        const { pts, dir } = snake(an.track, an.pos(e), an.L)
        drawArrow(ctx, pts, dir, color, px)
      }
      ctx.globalAlpha = 1
    }
    if (more) this.draw()
  }
}
