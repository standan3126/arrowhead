// The puzzle's rules, with no drawing, so they run the same in the browser and in Node.
//
// A board is a grid. Every arrow is a path of cells, tail first, head last, with right-angle
// bends; the head points along the path's last step. Tap an arrow and it slides forward like a
// snake (the head goes straight, the body follows its own trail). It flies off the board when
// every cell in a straight line in front of its head is empty.
//
// Blocked arrows:
//   normal   slide up to whatever is in the way and bounce back (a "bump"; nothing changes)
//   heavy    slide up to whatever is in the way and STAY there (only when heavy rules are on)
//
// Every change goes on the history, so undo can always go back to the start of the level.
// Each arrow pays its coins once per level: undoing it and sending it out again pays nothing,
// so undo never takes coins back (and the wallet never goes below zero).

export const DIRS = [
  [0, -1], // up
  [1, 0], // right
  [0, 1], // down
  [-1, 0], // left
]

// Coins an arrow pays when it flies out, by its length in cells.
export const SMALL_MAX = 4
export const MEDIUM_MAX = 8
export const coinsFor = (length) => (length <= SMALL_MAX ? 1 : length <= MEDIUM_MAX ? 2 : 3)

// The direction an arrow's head points: its last step.
export function headDir(cells) {
  const [hx, hy] = cells[cells.length - 1]
  const [px, py] = cells[cells.length - 2]
  return [hx - px, hy - py]
}

// The cells an arrow travels through on its way out: its own cells, then straight on past the
// board's edge until the tail is off the board too (plus `extra` cells of run-out).
export function trackOf(cells, w, h, extra = 2) {
  const [dx, dy] = headDir(cells)
  const track = cells.slice()
  let [x, y] = cells[cells.length - 1]
  let outside = 0
  while (outside < cells.length + extra) {
    x += dx
    y += dy
    track.push([x, y])
    if (x < 0 || y < 0 || x >= w || y >= h) outside++
  }
  return track
}

export class Board {
  // arrows: [{ id, cells: [[x, y], ...], heavy }]; ids are 0, 1, 2... in that order.
  // heavyRules: false = Calm mode, heavy arrows bounce back like any other.
  constructor({ w, h, arrows }, { heavyRules = true } = {}) {
    this.w = w
    this.h = h
    this.heavyRules = heavyRules
    this.start = arrows.map((a) => a.cells.map((c) => c.slice()))
    this.arrows = arrows.map((a, id) => ({ id, cells: a.cells.map((c) => c.slice()), heavy: !!a.heavy, gone: false }))
    this.occ = new Int32Array(w * h).fill(-1)
    for (const a of this.arrows) this.place(a)
    this.history = []
    this.coins = 0 // earned on this board so far
    this.paid = new Set() // arrows that have already paid
  }

  place(a) {
    for (const [x, y] of a.cells) this.occ[y * this.w + x] = a.id
  }

  lift(a) {
    for (const [x, y] of a.cells) this.occ[y * this.w + x] = -1
  }

  at(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.occ[y * this.w + x]
  }

  get left() {
    return this.arrows.reduce((n, a) => n + (a.gone ? 0 : 1), 0)
  }

  get done() {
    return this.left === 0
  }

  // What's in front of an arrow: { free, blocker, room } where room is how many empty cells
  // there are before the blocker.
  look(id) {
    const a = this.arrows[id]
    const [dx, dy] = headDir(a.cells)
    let [x, y] = a.cells[a.cells.length - 1]
    let room = 0
    for (;;) {
      x += dx
      y += dy
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return { free: true, blocker: -1, room }
      const o = this.occ[y * this.w + x]
      if (o !== -1 && o !== id) return { free: false, blocker: o, room }
      room++
    }
  }

  isFree(id) {
    return !this.arrows[id].gone && this.look(id).free
  }

  freeArrows() {
    return this.arrows.filter((a) => !a.gone && this.look(a.id).free).map((a) => a.id)
  }

  // Nothing can leave and no heavy arrow can still move: only undo or burn helps.
  get jammed() {
    if (this.done) return false
    return this.arrows.every((a) => {
      if (a.gone) return true
      const { free, room } = this.look(a.id)
      return !free && !(a.heavy && this.heavyRules && room > 0)
    })
  }

  // Tap an arrow. Returns what happened, for the animation:
  //   { kind: 'exit', id, cells, coins }              flew off (cells = where it started)
  //   { kind: 'bump', id, cells, room, blocker }      bounced back, nothing changed
  //   { kind: 'move', id, cells, to, room, blocker }  a heavy arrow slid `room` cells and stayed
  tap(id) {
    const a = this.arrows[id]
    if (!a || a.gone) return null
    const { free, blocker, room } = this.look(id)
    const cells = a.cells.map((c) => c.slice())
    if (free) {
      const coins = this.paid.has(id) ? 0 : coinsFor(a.cells.length)
      this.paid.add(id)
      this.lift(a)
      a.gone = true
      this.coins += coins
      this.history.push({ k: 'exit', id, coins })
      return { kind: 'exit', id, cells, coins }
    }
    if (a.heavy && this.heavyRules && room > 0) {
      const track = trackOf(a.cells, this.w, this.h)
      const to = track.slice(room, room + a.cells.length)
      this.lift(a)
      a.cells = to
      this.place(a)
      this.history.push({ k: 'move', id, cells })
      return { kind: 'move', id, cells, to: to.map((c) => c.slice()), room, blocker }
    }
    return { kind: 'bump', id, cells, room, blocker }
  }

  // Remove any arrow, free or not (the Burn power-up). Pays no coins. What it cost (price, or a
  // free burn) is remembered so undoing the burn can give it back.
  burn(id, price = 0, free = false) {
    const a = this.arrows[id]
    if (!a || a.gone) return null
    this.lift(a)
    a.gone = true
    this.history.push(free ? { k: 'burn', id, price, free } : { k: 'burn', id, price })
    return { kind: 'burn', id, cells: a.cells.map((c) => c.slice()) }
  }

  // Takes back the last change. Returns it (with the arrow's cells now), or null at the start.
  undo() {
    const step = this.history.pop()
    if (!step) return null
    const a = this.arrows[step.id]
    if (step.k === 'move') {
      const from = a.cells
      this.lift(a)
      a.cells = step.cells
      this.place(a)
      return { ...step, from, cells: a.cells.map((c) => c.slice()) }
    }
    a.gone = false
    this.place(a)
    return { ...step, cells: a.cells.map((c) => c.slice()) }
  }

  // A small, saveable record of a half-played board. Arrows are found by id, so this works as
  // long as the level itself never changes (levels are made from a fixed seed).
  toJSON() {
    const moved = {}
    this.arrows.forEach((a, id) => {
      if (!a.gone && JSON.stringify(a.cells) !== JSON.stringify(this.start[id])) moved[id] = a.cells
    })
    return { history: this.history, moved, coins: this.coins, paid: [...this.paid] }
  }

  // Replays a saved record onto a fresh board of the same level.
  restore({ history = [], moved = {}, coins = 0, paid = [] }) {
    for (const step of history) {
      const a = this.arrows[step.id]
      if (!a) continue
      if (step.k === 'exit' || step.k === 'burn') {
        this.lift(a)
        a.gone = true
      }
    }
    for (const [id, cells] of Object.entries(moved)) {
      const a = this.arrows[id]
      if (!a || a.gone) continue
      this.lift(a)
      a.cells = cells
      this.place(a)
    }
    this.history = history.slice()
    this.coins = coins
    this.paid = new Set(paid)
  }
}

// Checks a board can be cleared. With only normal arrows any order of free taps works, so
// tapping whatever is free until nothing is left settles it. Returns the number of rounds
// (how many "waves" of arrows open up one after another), or -1 if it gets stuck.
export function solveRounds({ w, h, arrows }) {
  const b = new Board({ w, h, arrows }, { heavyRules: false })
  let rounds = 0
  while (!b.done) {
    const free = b.freeArrows()
    if (!free.length) return -1
    for (const id of free) b.tap(id)
    rounds++
  }
  return rounds
}
