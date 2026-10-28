// Arrowhead: screens, coins, power-ups, saves and the GameHub pieces. The rules are in
// engine.js, the levels in levels.js, the drawing in board-view.js. Settings use the toolbox's
// shared panel (/shared/v1/settings.js), laid out like every other GameHub game.

import { addExitButton, setupPage, tapToStart, warmOffline } from '/shared/v1/kit.js'
import { gameStore } from '/shared/v1/save.js'
import { SettingsPanel, choice, toggle } from '/shared/v1/settings.js'
import { Sound } from '/shared/v1/sound/index.js'
import { BoardView } from './board-view.js'
import { NATIVE_THEMES } from './draw-native.js'
import { THEMES } from './draw-simple.js'
import { Board } from './engine.js'
import { HEAVY_FROM, generateLevel } from './levels.js'

const GAME_ID = 'arrowhead'
const store = gameStore(GAME_ID)

// Coins: every arrow pays 1, 2 or 3 by length (engine.js coinsFor). First guesses, to balance.
const PRICES = { hint: 10, burn: 30 }
const STARTER_COINS = 25

// Little lessons, each shown once, from the level given (or when it first happens), one per level
// started, newest first. path: only on that path. Keep them in order of `from`.
const TIPS = [
  { id: 'tap', from: 1, text: 'Tap an arrow that has a clear way out. It slides off the board. The glowing one is ready to go.' },
  { id: 'coins', from: 2, text: 'Every arrow pays coins as it leaves: 1, 2 or 3, longer arrows pay more.' },
  { id: 'undo', from: 3, text: 'Undo takes back your last move. It’s always free, as many times as you like.' },
  { id: 'zoom', from: 5, text: 'Pinch to zoom in, drag to move around. “See all” shows the whole board again.' },
  { id: 'hint', from: 7, text: `Can’t find a way out? Hint lights up an arrow that can leave (${PRICES.hint} coins).` },
  { id: 'burn', from: 9, text: `Burn takes away any one arrow, even a stuck one (${PRICES.burn} coins). Undo gives the coins back.` },
  {
    id: 'heavy',
    path: 'native',
    from: HEAVY_FROM,
    text: 'New: heavy arrows (dark point, bound shaft). If one is blocked it slides as far as it can and stays there, and may block others. Undo puts it back. Calm mode in Settings turns them off.',
  },
  { id: 'bump', from: Infinity, text: 'That arrow was blocked, so it bounced back. That’s all: no lives to lose here.' },
]

// Save format v1. Any later change must upgrade v1 saves, never drop them.
const NEW_SAVE = () => ({ v: 1, coins: 0, starter: false, paths: { simple: { level: 1 }, native: { level: 1 } }, board: null, tips: [] })

let save
function load() {
  const saved = store.get('save', {})
  save = { ...NEW_SAVE(), ...saved, paths: { ...NEW_SAVE().paths, ...saved.paths } }
  if (!save.starter) {
    save.coins += STARTER_COINS
    save.starter = true
  }
}
load()
const saveGame = () => store.set('save', save)
saveGame()

// Settings from before the shared panel ({ colors, night, sound }) move to its names.
const oldSettings = store.get('settings', {})
if ('night' in oldSettings || 'sound' in oldSettings) {
  const { night, sound: soundOn, ...rest } = oldSettings
  store.set('settings', { ...rest, light: night ? 'night' : 'day', muted: soundOn === false })
}

const sound = new Sound({ notes: 0.7, nature: 0.5, music: 0.35 })

const $ = (id) => document.getElementById(id)
setupPage()
addExitButton({ beforeExit: saveGame })

// --- Looks -------------------------------------------------------------------------------------

const view = new BoardView($('board'), { onTap: tapArrow })

const settingsPanel = new SettingsPanel({
  gameId: GAME_ID,
  store,
  sound,
  notesLabel: 'Arrow chimes',
  defaults: { colors: 'black', calm: false },
  look: (el, panel) =>
    el.append(
      choice({
        label: 'Simple Arrows colors',
        value: panel.settings.colors,
        options: [
          { value: 'black', label: 'Black on white' },
          { value: 'white', label: 'White on black' },
        ],
        onPick: (colors) => panel.set({ colors }),
      }),
    ),
  sections: [
    {
      title: 'Arrowhead path',
      build: (el, panel) =>
        el.append(
          toggle({
            label: 'Calm mode',
            hint: 'Heavy arrows bounce back like the rest. Starts with your next level.',
            checked: panel.settings.calm,
            onToggle: (calm) => panel.set({ calm }),
          }),
        ),
    },
  ],
  manual: {
    fields: [
      { id: 'simple', label: 'Simple Arrows level', min: 1, get: () => save.paths.simple.level },
      { id: 'native', label: 'Arrowhead level', min: 1, get: () => save.paths.native.level },
      { id: 'coins', label: 'Coins', get: () => save.coins },
    ],
    onSet: ({ simple, native, coins }) => {
      for (const [path, level] of Object.entries({ simple, native })) {
        if (level !== save.paths[path].level && save.board?.path === path) save.board = null
        save.paths[path].level = level
      }
      save.coins = coins
      saveGame()
      showCoins()
      if (!$('home').hidden) showHome()
      return `Set: Simple Arrows ${simple}, Arrowhead ${native}, ${coins} coins.`
    },
  },
  credits: [
    'Arrowhead was made for GameHub: the puzzles, the shapes and the drawings were all made for this game.',
    'Every sound and all the music are made in code by the GameHub toolbox. Nothing is borrowed.',
  ],
  onChange: () => applyTheme(),
  beforeExport: saveGame,
  onRestore: () => {
    load()
    saveGame()
    current = null
    showHome()
  },
})
const settings = () => settingsPanel.settings

// The page and board colors: the path being played, and Night (or Auto at night).
function applyTheme() {
  const night = settingsPanel.night
  const native = current?.path === 'native' && !$('play').hidden
  let key
  let theme
  if (native) {
    key = night ? 'night' : 'native'
    theme = NATIVE_THEMES[night ? 'night' : 'day']
  } else {
    key = night ? 'night' : settings().colors
    theme = THEMES[key]
  }
  document.documentElement.dataset.theme = key
  document.querySelector('meta[name="theme-color"]').content = theme.bg
  view.setTheme(theme, native)
}

// --- Screens -----------------------------------------------------------------------------------

function showHome() {
  setBurning(false)
  $('play').hidden = true
  $('home').hidden = false
  $('simple-level').textContent = `Level ${save.paths.simple.level}`
  $('native-level').textContent = `Level ${save.paths.native.level}`
  showCoins()
  applyTheme()
}

function showCoins() {
  $('coins').textContent = save.coins
  $('home-coins').textContent = save.coins
  $('hint-price').textContent = PRICES.hint
  $('burn-price').textContent = PRICES.burn
}

let current = null // { path, n, level, board }

function startLevel(path, n) {
  const level = generateLevel(path, n)
  const resume = save.board && save.board.path === path && save.board.n === n ? save.board : null
  // Calm mode applies from the next level; a half-played board keeps the rules it began with.
  const heavyRules = resume ? resume.heavyRules !== false : !settings().calm
  const board = new Board(level, { heavyRules })
  if (resume) board.restore(resume)
  current = { path, n, level, board }
  setBurning(false)
  $('home').hidden = true
  $('play').hidden = false
  $('done').hidden = true
  $('level-name').textContent = `Level ${n}`
  applyTheme()
  view.setBoard(board)
  showLeft()
  showCoins()
  if (board.done) return finishLevel()
  // The newest lesson that applies comes first (someone who jumped ahead sees what's new here).
  const tip = TIPS.filter((t) => n >= t.from && (!t.path || t.path === path) && !save.tips.includes(t.id)).at(-1)
  if (tip) coach(tip.id)
  else hideCoach()
}

function showLeft() {
  $('left').textContent = current.board.left
}

function saveBoard() {
  const { path, n, board } = current
  save.board = board.done ? null : { path, n, heavyRules: board.heavyRules, ...board.toJSON() }
  saveGame()
}

let toastTimer = 0
function toast(text) {
  const el = $('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600)
}

function coach(id) {
  const tip = TIPS.find((t) => t.id === id)
  if (!tip || save.tips.includes(id)) return
  save.tips.push(id)
  saveGame()
  $('coach-text').textContent = tip.text
  $('coach').hidden = false
  // The first lesson shows a free arrow, so there's somewhere to start.
  if (id === 'tap') view.showHint(pickHint())
}

function hideCoach() {
  $('coach').hidden = true
}
$('coach-ok').addEventListener('click', hideCoach)

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
  if (burning) return burnArrow(id)
  hideCoach()
  const result = current.board.tap(id)
  if (!result) return
  view.play(result)
  if (result.kind === 'exit') {
    chimeNext()
    save.coins += result.coins
    showCoins()
  } else {
    sound.soft()
    if (result.kind === 'bump') coach('bump')
  }
  afterMove()
}

function afterMove() {
  showLeft()
  saveBoard()
  if (current.board.done) {
    hideCoach()
    setTimeout(finishLevel, 650)
  } else if (current.board.jammed) toast('The board is stuck. Undo or Burn will get it moving.')
}

function finishLevel() {
  const { path, n, board } = current
  if (save.paths[path].level <= n) save.paths[path].level = n + 1
  save.board = null
  saveGame()
  sound.celebrate()
  $('done-title').textContent = `Level ${n} complete`
  $('done-coins').textContent = board.coins ? `+${board.coins} coins` : ''
  $('done').hidden = false
}

// --- Power-ups ---------------------------------------------------------------------------------

function canPay(what) {
  if (save.coins >= PRICES[what]) return true
  toast(`${what === 'hint' ? 'Hint' : 'Burn'} costs ${PRICES[what]} coins. Every arrow you clear earns more.`)
  sound.soft()
  return false
}

// A free arrow, picking the one most tucked in among others (the hardest to spot).
function pickHint() {
  const b = current.board
  let best = -1
  let bestScore = -1
  for (const id of b.freeArrows()) {
    const cells = b.arrows[id].cells
    const [hx, hy] = cells[cells.length - 1]
    let score = 0
    for (let y = hy - 2; y <= hy + 2; y++) for (let x = hx - 2; x <= hx + 2; x++) if (b.at(x, y) !== -1) score++
    if (score > bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

$('hint').addEventListener('click', () => {
  if (!current || current.board.done) return
  setBurning(false)
  const b = current.board
  // Still showing one that can leave: show it again, no charge.
  if (view.hint !== -1 && b.isFree(view.hint)) return view.showArrow(view.hint)
  const id = pickHint()
  if (id === -1) return toast('No arrow can leave right now. Undo or Burn will get it moving.')
  if (!canPay('hint')) return
  save.coins -= PRICES.hint
  showCoins()
  saveGame()
  sound.ping()
  view.showHint(id)
  view.showArrow(id)
})

let burning = false
function setBurning(on) {
  burning = on
  $('burn').setAttribute('aria-pressed', String(on))
}

$('burn').addEventListener('click', () => {
  if (!current || current.board.done) return
  if (burning) return setBurning(false)
  if (!canPay('burn')) return
  setBurning(true)
  toast('Tap the arrow to burn. Tap Burn again to keep your coins.')
})

function burnArrow(id) {
  setBurning(false)
  const result = current.board.burn(id, PRICES.burn)
  if (!result) return
  save.coins -= PRICES.burn
  showCoins()
  view.play(result)
  sound.sparkle()
  afterMove()
}

$('undo').addEventListener('click', () => {
  if (!current || current.board.done) return
  setBurning(false)
  const result = current.board.undo()
  if (!result) return toast('Back at the start of the level')
  if (result.k === 'burn' && result.price) {
    save.coins += result.price
    showCoins()
  }
  view.play(result)
  showLeft()
  saveBoard()
})

$('next').addEventListener('click', () => startLevel(current.path, current.n + 1))
$('fit').addEventListener('click', () => view.fit())
$('go-home').addEventListener('click', () => {
  saveGame()
  showHome()
})
$('play-simple').addEventListener('click', () => startLevel('simple', save.paths.simple.level))
$('play-native').addEventListener('click', () => startLevel('native', save.paths.native.level))

// --- Settings ----------------------------------------------------------------------------------

$('home-settings').addEventListener('click', () => settingsPanel.open())
$('play-settings').addEventListener('click', () => settingsPanel.open())

// --- Start -------------------------------------------------------------------------------------

showHome()
// For the tests (and curious grown-ups in the browser console).
window.arrowhead = { view, startLevel, tapArrow, settingsPanel, get current() { return current }, get save() { return save } }

tapToStart({ title: 'Arrowhead', subtitle: 'Send every arrow off the board.', onStart: () => sound.unlock() })
warmOffline('offline-files.json')
