// Arrowhead: screens, settings, saves and the GameHub pieces. The rules are in engine.js, the
// levels in levels.js, the drawing in board-view.js.

import { addExitButton, setupPage, tapToStart } from '/shared/v1/kit.js'
import { gameStore } from '/shared/v1/save.js'
import { Sound } from '/shared/v1/sound/index.js'
import { BoardView } from './board-view.js'
import { THEMES } from './draw-simple.js'
import { Board } from './engine.js'
import { generateLevel } from './levels.js'

const GAME_ID = 'arrowhead'
const store = gameStore(GAME_ID)
const PATHS = { simple: 'Simple Arrows' }

// Save format v1. Any later change must upgrade v1 saves, never drop them.
const NEW_SAVE = () => ({ v: 1, coins: 0, paths: { simple: { level: 1 }, native: { level: 1 } }, board: null })
const DEFAULT_SETTINGS = { colors: 'black', night: false, sound: true }

let save = { ...NEW_SAVE(), ...store.get('save', {}) }
const settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) }
const saveGame = () => store.set('save', save)
const saveSettings = () => store.set('settings', settings)

const sound = new Sound({ notes: 0.8, nature: 0.5, music: 0 })
sound.setMuted(!settings.sound)

const $ = (id) => document.getElementById(id)
setupPage()
addExitButton({ beforeExit: saveGame })

// --- Looks -------------------------------------------------------------------------------------

const view = new BoardView($('board'), { onTap: tapArrow })

function applyTheme() {
  const key = settings.night ? 'night' : settings.colors
  document.documentElement.dataset.theme = key
  document.querySelector('meta[name="theme-color"]').content = THEMES[key].bg
  view.setTheme(THEMES[key])
  for (const b of document.querySelectorAll('[data-colors]')) b.setAttribute('aria-checked', String(b.dataset.colors === settings.colors))
  $('night').checked = settings.night
  $('sound-on').checked = settings.sound
}
applyTheme()

// --- Screens -----------------------------------------------------------------------------------

function showHome() {
  $('play').hidden = true
  $('home').hidden = false
  $('simple-level').textContent = `Level ${save.paths.simple.level}`
}

let current = null // { path, n, level, board }

function startLevel(path, n) {
  const level = generateLevel(path, n)
  const board = new Board(level)
  if (save.board && save.board.path === path && save.board.n === n) board.restore(save.board)
  current = { path, n, level, board }
  $('home').hidden = true
  $('play').hidden = false
  $('done').hidden = true
  $('level-name').textContent = `Level ${n}`
  view.setBoard(board)
  showLeft()
  if (board.done) finishLevel()
}

function showLeft() {
  $('left').textContent = current.board.left
}

function saveBoard() {
  const { path, n, board } = current
  save.board = board.done ? null : { path, n, ...board.toJSON() }
  saveGame()
}

let toastTimer = 0
function toast(text) {
  const el = $('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

// --- Playing -----------------------------------------------------------------------------------

// Arrows leaving close together climb a little tune, then come back down, like Momahjong.
const chime = { step: 0, up: true, last: 0 }
function chimeNext() {
  const t = performance.now()
  if (t - chime.last > 2000) Object.assign(chime, { step: 0, up: true })
  else {
    chime.step += chime.up ? 1 : -1
    if (chime.step >= 5) chime.up = false
    if (chime.step <= 0) chime.up = true
  }
  chime.last = t
  sound.step(chime.step)
}

function tapArrow(id) {
  if (!current || current.board.done) return
  const result = current.board.tap(id)
  if (!result) return
  view.play(result)
  if (result.kind === 'exit') chimeNext()
  else sound.soft()
  showLeft()
  saveBoard()
  if (current.board.done) setTimeout(finishLevel, 650)
}

function finishLevel() {
  const { path, n } = current
  if (save.paths[path].level <= n) save.paths[path].level = n + 1
  save.board = null
  saveGame()
  sound.celebrate()
  $('done-title').textContent = `Level ${n} complete`
  $('done').hidden = false
}

$('next').addEventListener('click', () => startLevel(current.path, current.n + 1))
$('undo').addEventListener('click', () => {
  if (!current) return
  const result = current.board.undo()
  if (!result) return toast('Back at the start of the level')
  view.play(result)
  showLeft()
  saveBoard()
})
$('fit').addEventListener('click', () => view.fit())
$('go-home').addEventListener('click', () => {
  saveGame()
  showHome()
})
$('play-simple').addEventListener('click', () => startLevel('simple', save.paths.simple.level))

// --- Settings ----------------------------------------------------------------------------------

const dialog = $('settings')
$('home-settings').addEventListener('click', () => dialog.showModal())
$('play-settings').addEventListener('click', () => dialog.showModal())
for (const b of document.querySelectorAll('[data-colors]')) {
  b.addEventListener('click', () => {
    settings.colors = b.dataset.colors
    settings.night = false
    saveSettings()
    applyTheme()
  })
}
$('night').addEventListener('change', (e) => {
  settings.night = e.target.checked
  saveSettings()
  applyTheme()
})
$('sound-on').addEventListener('change', (e) => {
  settings.sound = e.target.checked
  sound.setMuted(!settings.sound)
  saveSettings()
})

// --- Start -------------------------------------------------------------------------------------

showHome()
// For the tests (and curious grown-ups in the browser console).
window.arrowhead = { view, startLevel, tapArrow, get current() { return current }, get save() { return save } }

tapToStart({ title: 'Arrowhead', subtitle: 'Send every arrow off the board.', onStart: () => sound.unlock() })
