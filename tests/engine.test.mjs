// The rules, checked in Node: node --test tests/engine.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Board, coinsFor, solveRounds } from '../js/engine.js'

// A 5×3 board:
//   row 0:  A A . . .    A points right: free
//   row 1:  B B . C C    B points right at C, C points left at B: neither can ever leave
//   row 2:  . . D D .    D points right: free
const level = () => ({
  w: 5,
  h: 3,
  arrows: [
    { cells: [[0, 0], [1, 0]] }, // 0: A, right
    { cells: [[0, 1], [1, 1]] }, // 1: B, right, blocked by C
    { cells: [[4, 1], [3, 1]] }, // 2: C, left, blocked by B
    { cells: [[2, 2], [3, 2]] }, // 3: D, right, free
  ],
})

test('a free arrow flies off and pays coins', () => {
  const b = new Board(level())
  const r = b.tap(0)
  assert.equal(r.kind, 'exit')
  assert.equal(r.coins, 1)
  assert.equal(b.arrows[0].gone, true)
  assert.equal(b.at(0, 0), -1)
  assert.equal(b.coins, 1)
})

test('a blocked arrow bumps and nothing changes', () => {
  const b = new Board(level())
  const r = b.tap(1)
  assert.equal(r.kind, 'bump')
  assert.equal(r.blocker, 2)
  assert.equal(r.room, 1)
  assert.equal(b.history.length, 0)
  assert.equal(b.at(1, 1), 1)
})

test('two arrows facing each other are stuck, and the solver says so', () => {
  assert.equal(solveRounds(level()), -1)
  const b = new Board(level())
  b.tap(0)
  b.tap(3)
  assert.equal(b.jammed, true)
  b.burn(2)
  assert.equal(b.isFree(1), true)
})

test('heavy arrows slide and stay; Calm mode bounces them back', () => {
  const lv = { w: 6, h: 1, arrows: [{ cells: [[0, 0], [1, 0]], heavy: true }, { cells: [[5, 0], [4, 0]] }] }
  // 0 points right with 2 empty cells before 1; 1 points left at 0.
  const calm = new Board(lv, { heavyRules: false })
  assert.equal(calm.tap(0).kind, 'bump')

  const b = new Board(lv)
  const r = b.tap(0)
  assert.equal(r.kind, 'move')
  assert.equal(r.room, 2)
  assert.deepEqual(b.arrows[0].cells, [[2, 0], [3, 0]])
  assert.equal(b.at(0, 0), -1)
  assert.equal(b.at(3, 0), 0)
  assert.equal(b.tap(0).kind, 'bump') // no room left
  assert.equal(b.jammed, true)
  b.undo()
  assert.deepEqual(b.arrows[0].cells, [[0, 0], [1, 0]])
  assert.equal(b.at(3, 0), -1)
})

test('undo goes back step by step; each arrow pays only once', () => {
  const b = new Board(level())
  b.tap(0)
  b.tap(3)
  assert.equal(b.coins, 2)
  b.undo()
  assert.equal(b.arrows[3].gone, false)
  assert.equal(b.coins, 2)
  assert.equal(b.tap(3).coins, 0)
  b.undo()
  b.undo()
  assert.equal(b.undo(), null)
  assert.equal(b.left, 4)
  assert.equal(b.tap(0).coins, 0)
})

test('undoing a burn says what it cost', () => {
  const b = new Board(level())
  b.burn(2, 30)
  assert.equal(b.undo().price, 30)
  assert.equal(b.arrows[2].gone, false)
})

test('a saved board restores exactly', () => {
  const lv = { w: 6, h: 2, arrows: [{ cells: [[0, 0], [1, 0]], heavy: true }, { cells: [[5, 0], [4, 0]] }, { cells: [[0, 1], [1, 1]] }] }
  const b = new Board(lv)
  b.tap(0)
  b.tap(2)
  const saved = JSON.parse(JSON.stringify(b.toJSON()))
  const c = new Board(lv)
  c.restore(saved)
  assert.deepEqual(c.arrows, b.arrows)
  assert.deepEqual([...c.occ], [...b.occ])
  assert.equal(c.coins, b.coins)
  c.undo()
  c.undo()
  assert.deepEqual(c.arrows[0].cells, [[0, 0], [1, 0]])
})

test('coins by length', () => {
  assert.deepEqual([2, 4, 5, 8, 9, 20].map(coinsFor), [1, 1, 2, 2, 3, 3])
})
