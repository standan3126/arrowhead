// Arrowhead: screens, coins, power-ups, saves and the GameHub pieces. The rules are in
// engine.js, the levels in levels.js, the drawing in board-view.js. Settings use the toolbox's
// shared panel (/shared/v1/settings.js), laid out like every other GameHub game.

import { gameFrame, setupPage, tapToStart, warmOffline } from '/shared/v1/kit.js'
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

// Coins: one for every 10 arrows cleared (leftover arrows carry on to the next level). Each
// arrow counts once per board, so undo can't farm them. Replaying an old level pays the same.
const ARROWS_PER_COIN = 10
const PRICES = { hint: 10, burn: 30 }
// A few free power-ups to start, used before coins (like Momahjong's starter pack), and a free
// Hint for every 10th level finished on either path.
const STARTER_FREE = { hint: 3, burn: 2 }
const GIFT_EVERY = 10

// Little lessons, each shown once, from the level given (or when it first happens), one per level
// started, newest first. path: only on that path. Keep them in order of `from`.
const TIPS = [
  { id: 'tap', from: 1, text: 'Tap an arrow that has a clear way out. It slides off the board. The glowing one is ready to go.' },
  { id: 'coins', from: 2, text: 'Every 10 arrows you clear earn a coin. Old levels can be played again for more.' },
  { id: 'undo', from: 3, text: 'Undo takes back your last move. It’s always free, as many times as you like.' },
  { id: 'zoom', from: 5, text: 'Pinch to zoom in, drag to move around. “See all” shows the whole board again.' },
  { id: 'hint', from: 7, text: `Can’t find a way out? Hint lights up an arrow that can leave. You have a few free; then they cost ${PRICES.hint} coins.` },
  { id: 'burn', from: 9, text: `Burn takes away any one arrow, even a stuck one. A few are free; then ${PRICES.burn} coins. Undo gives it back.` },
  {
    id: 'heavy',
    path: 'native',
    from: HEAVY_FROM,
    text: 'New: heavy arrows (dark point, bound shaft). If one is blocked it slides as far as it can and stays there, and may block others. Undo puts it back. Calm mode in Settings turns them off.',
  },
  { id: 'bump', from: Infinity, text: 'That arrow was blocked, so it bounced back. That’s all: no lives to lose here.' },
]

// Save format v2: coins, meter (arrows toward the next coin), free power-ups, the level reached on
// each path, the path picked on the home page (path), a half-played board (board) and a
// half-played replay of an older level (replay).
// v1 (coins paid per arrow) upgrades by starting the wallet fresh with the starter freebies;
// levels and tips are kept. The user chose this on 2026-10-27, when only they had played.
const NEW_SAVE = () => ({
  v: 2,
  coins: 0,
  meter: 0,
  free: { ...STARTER_FREE },
  paths: { simple: { level: 1 }, native: { level: 1 } },
  path: 'simple',
  board: null,
  replay: null,
  tips: [],
})

let save
function load() {
  const saved = store.get('save', {})
  if (saved.v === 1) {
    saved.v = 2
    saved.coins = 0
    delete saved.starter
  }
  // Saves from before the path choice: the path of the half-played board, if there is one.
  if (!saved.path && saved.board?.path) saved.path = saved.board.path
  save = { ...NEW_SAVE(), ...saved, paths: { ...NEW_SAVE().paths, ...saved.paths }, free: { ...STARTER_FREE, ...saved.free } }
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
// Hub (home page) or Home (playing) top left, the Settings gear top right: the toolbox frame.
const frame = gameFrame({
  onSettings: () => settingsPanel.open(),
  beforeExit: saveGame,
  onHome: () => {
    saveGame()
    showHome()
  },
})

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
      { id: 'hints', label: 'Free hints', get: () => save.free.hint },
      { id: 'burns', label: 'Free burns', get: () => save.free.burn },
    ],
    onSet: ({ simple, native, coins, hints, burns }) => {
      for (const [path, level] of Object.entries({ simple, native })) {
        if (level !== save.paths[path].level && save.board?.path === path) save.board = null
        save.paths[path].level = level
      }
      save.coins = coins
      save.free = { hint: hints, burn: burns }
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
  $('done').hidden = true
  $('play').hidden = true
  $('home').hidden = false
  frame.setPage('launch')
  for (const path of ['simple', 'native']) {
    $(`${path}-level`).textContent = `Level ${save.paths[path].level}`
    $(`pick-${path}`).setAttribute('aria-checked', String(save.path === path))
  }
  // Levels shows once the picked path has been started.
  $('levels').hidden = save.paths[save.path].level < 2
  showCoins()
  applyTheme()
}

function showCoins() {
  $('coins').textContent = save.coins
  $('home-coins').textContent = save.coins
  // The buttons show free ones left, else the price.
  $('hint-price').textContent = save.free.hint ? `${save.free.hint} free` : PRICES.hint
  $('burn-price').textContent = save.free.burn ? `${save.free.burn} free` : PRICES.burn
}

// A replay is a level below the one reached; it keeps its own half-played board.
const isReplay = (path, n) => n < save.paths[path].level
const slot = (path, n) => (isReplay(path, n) ? 'replay' : 'board')

let current = null // { path, n, level, board }

function startLevel(path, n) {
  const level = generateLevel(path, n)
  const kept = save[slot(path, n)]
  const resume = kept && kept.path === path && kept.n === n ? kept : null
  // Calm mode applies from the next level; a half-played board keeps the rules it began with.
  const heavyRules = resume ? resume.heavyRules !== false : !settings().calm
  const board = new Board(level, { heavyRules })
  if (resume) board.restore(resume)
  current = { path, n, level, board, earned: resume?.earned ?? 0 }
  setBurning(false)
  $('home').hidden = true
  $('play').hidden = false
  $('done').hidden = true
  frame.setPage('play')
  $('level-name').textContent = `Level ${n}`
  $('replay-tag').hidden = !isReplay(path, n)
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
  const { path, n, board, earned } = current
  save[slot(path, n)] = board.done ? null : { path, n, heavyRules: board.heavyRules, earned, ...board.toJSON() }
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
    // result.coins > 0 only the first time this arrow leaves on this board.
    if (result.coins > 0 && ++save.meter >= ARROWS_PER_COIN) {
      save.meter -= ARROWS_PER_COIN
      save.coins++
      current.earned++
      showCoins()
    }
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
  const { path, n, earned } = current
  const lines = []
  if (earned) lines.push(`+${earned} coin${earned > 1 ? 's' : ''}`)
  lines.push(`${save.meter} of ${ARROWS_PER_COIN} arrows toward the next coin`)
  if (!isReplay(path, n)) {
    save.paths[path].level = n + 1
    if (n % GIFT_EVERY === 0) {
      save.free.hint++
      lines.push(`A free Hint for reaching level ${n + 1}!`)
    }
  }
  save[slot(path, n)] = null
  saveGame()
  showCoins()
  sound.celebrate()
  $('done-title').textContent = `Level ${n} complete`
  $('done-coins').replaceChildren(...lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })))
  $('done').hidden = false
}

// --- Power-ups ---------------------------------------------------------------------------------

function canPay(what) {
  if (save.free[what] > 0 || save.coins >= PRICES[what]) return true
  toast(`${what === 'hint' ? 'Hint' : 'Burn'} costs ${PRICES[what]} coins. Every 10 arrows earn one; old levels can be played again.`)
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
  if (save.free.hint > 0) save.free.hint--
  else save.coins -= PRICES.hint
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
  toast(save.free.burn ? 'Tap the arrow to burn. Tap Burn again to keep it.' : 'Tap the arrow to burn. Tap Burn again to keep your coins.')
})

function burnArrow(id) {
  setBurning(false)
  const free = save.free.burn > 0
  const result = current.board.burn(id, free ? 0 : PRICES.burn, free)
  if (!result) return
  if (free) save.free.burn--
  else save.coins -= PRICES.burn
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
  if (result.k === 'burn') {
    if (result.free) save.free.burn++
    else save.coins += result.price
    showCoins()
  }
  view.play(result)
  showLeft()
  saveBoard()
})

$('next').addEventListener('click', () => startLevel(current.path, current.n + 1))
$('fit').addEventListener('click', () => view.fit())
$('done-home').addEventListener('click', () => {
  saveGame()
  showHome()
})

// Home page: pick a path, then Play (the level reached) or Levels (any level so far).
for (const path of ['simple', 'native'])
  $(`pick-${path}`).addEventListener('click', () => {
    save.path = path
    saveGame()
    showHome()
  })
$('play-path').addEventListener('click', () => startLevel(save.path, save.paths[save.path].level))
$('levels').addEventListener('click', () => showLevels(save.path))

// Levels: the level reached first, then every finished one, newest first. Old ones pay coins the
// same way.
function showLevels(path) {
  const list = $('replay-levels')
  const reached = save.paths[path].level
  list.replaceChildren(
    ...Array.from({ length: reached }, (_, i) => {
      const n = reached - i
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'replay-level', textContent: n })
      b.setAttribute('aria-label', n === reached ? `Level ${n}, where you are` : `Level ${n}`)
      if (n === reached) b.setAttribute('aria-current', 'true')
      b.addEventListener('click', () => {
        $('replay').close()
        startLevel(path, n)
      })
      return b
    }),
  )
  $('replay-title').textContent = path === 'simple' ? 'Simple Arrows levels' : 'Arrowhead levels'
  $('replay').showModal()
}
$('replay-close').addEventListener('click', () => $('replay').close())

// --- Start -------------------------------------------------------------------------------------

showHome()
// For the tests (and curious grown-ups in the browser console).
window.arrowhead = { view, startLevel, tapArrow, settingsPanel, get current() { return current }, get save() { return save } }

tapToStart({ title: 'Arrowhead', subtitle: 'Send every arrow off the board.', onStart: () => sound.unlock() })
warmOffline('offline-files.json')
