// Builds the first levels of every path and checks each one:
//   - it can be cleared (every arrow eventually gets a clear way out)
//   - it comes out exactly the same when built twice (saves rely on that)
//   - arrows are at least 2 cells, inside the shape, and don't overlap
// Usage: node tools/check-levels.mjs [how many per path, default 300]
import { generateLevel } from '../js/levels.js'
import { solveRounds } from '../js/engine.js'

const COUNT = Number(process.argv[2] || 300)
const PATHS = ['simple']
let problems = 0
const fail = (msg) => {
  problems++
  console.error('  ✗ ' + msg)
}

for (const path of PATHS) {
  const bands = []
  for (let n = 1; n <= COUNT; n++) {
    const a = generateLevel(path, n)
    const b = generateLevel(path, n)
    const id = `${path} ${n}`
    if (JSON.stringify(a.arrows) !== JSON.stringify(b.arrows)) fail(`${id}: not the same twice`)
    if (solveRounds(a) < 1) fail(`${id}: can't be cleared`)
    const seen = new Set()
    for (const [k, arrow] of a.arrows.entries()) {
      if (arrow.cells.length < 2) fail(`${id}: arrow ${k} is too short`)
      for (const [x, y] of arrow.cells) {
        const i = y * a.w + x
        if (x < 0 || y < 0 || x >= a.w || y >= a.h || !a.mask[i]) fail(`${id}: arrow ${k} leaves the shape`)
        if (seen.has(i)) fail(`${id}: arrows overlap at ${x},${y}`)
        seen.add(i)
      }
    }
    if (a.fill < 0.85) fail(`${id}: only ${(a.fill * 100).toFixed(0)}% filled`)
    const band = Math.floor((n - 1) / 25)
    bands[band] ??= { from: n, to: n, arrows: 0, rounds: 0, fill: 0, count: 0, side: a.w }
    Object.assign(bands[band], { to: n, side: a.w })
    bands[band].arrows += a.arrows.length
    bands[band].rounds += a.rounds
    bands[band].fill += a.fill
    bands[band].count++
  }
  console.log(`${path}: levels 1–${COUNT}`)
  for (const b of bands) {
    console.log(`  ${String(b.from).padStart(4)}–${String(b.to).padEnd(4)} up to ${b.side} wide, ~${Math.round(b.arrows / b.count)} arrows, ~${Math.round(b.rounds / b.count)} waves, ${((b.fill / b.count) * 100).toFixed(0)}% filled`)
  }
}

if (problems) {
  console.error(`${problems} problem(s)`)
  process.exit(1)
}
console.log('All levels OK')
