// Plays Arrowhead in a phone-sized browser: npm test (starts its own server on 4200).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const FAMILY_CODE = process.env.HUB_CODE ?? readFileSync(new URL('../../hub/private/family-code.txt', import.meta.url), 'utf8').trim()

const start = async (page) => {
  await page.goto('./')
  await page.locator('.hub-start').click()
  await expect(page.locator('#home')).toBeVisible()
}

// Taps an arrow where it is on screen, like a finger would.
const tapArrow = async (page, id) => {
  const [x, y] = await page.evaluate((id) => window.arrowhead.view.screenPoint(id), id)
  await page.touchscreen.tap(x, y)
}

const freeArrow = (page) => page.evaluate(() => window.arrowhead.current.board.freeArrows()[0] ?? -1)
const blockedArrow = (page) =>
  page.evaluate(() => {
    const b = window.arrowhead.current.board
    return b.arrows.find((a) => !a.gone && !b.isFree(a.id))?.id ?? -1
  })

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
})

test('level 1 can be played to the end by tapping, then level 2 starts', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await start(page)
  await expect(page.locator('.hub-exit')).toBeVisible()
  await page.locator('#play-simple').click()
  await expect(page.locator('#level-name')).toHaveText('Level 1')
  for (let i = 0; i < 40; i++) {
    const id = await freeArrow(page)
    if (id === -1) break
    await tapArrow(page, id)
  }
  await expect(page.locator('#done')).toBeVisible()
  await expect(page.locator('#done-title')).toHaveText('Level 1 complete')
  await page.locator('#next').click()
  await expect(page.locator('#level-name')).toHaveText('Level 2')
  await page.locator('#go-home').click()
  await expect(page.locator('#simple-level')).toHaveText('Level 2')
  expect(errors).toEqual([])
})

test('a blocked arrow bumps back; undo takes back a move; a half-played board survives a reload', async ({ page }) => {
  await start(page)
  await page.evaluate(() => window.arrowhead.startLevel('simple', 12))
  const left = Number(await page.locator('#left').textContent())
  const blocked = await blockedArrow(page)
  await tapArrow(page, blocked)
  await expect(page.locator('#left')).toHaveText(String(left))

  const a = await freeArrow(page)
  await tapArrow(page, a)
  await expect(page.locator('#left')).toHaveText(String(left - 1))
  const b = await freeArrow(page)
  await tapArrow(page, b)
  await expect(page.locator('#left')).toHaveText(String(left - 2))
  await page.locator('#undo').click()
  await expect(page.locator('#left')).toHaveText(String(left - 1))

  await page.reload()
  await page.locator('.hub-start').click()
  await page.evaluate(() => window.arrowhead.startLevel('simple', 12))
  await expect(page.locator('#left')).toHaveText(String(left - 1))
  const gone = await page.evaluate((a) => window.arrowhead.current.board.arrows[a].gone, a)
  expect(gone).toBe(true)
  await page.locator('#undo').click()
  await expect(page.locator('#left')).toHaveText(String(left))
})

test('pinch and drag move the board; See all puts it back', async ({ page }) => {
  await start(page)
  await page.evaluate(() => window.arrowhead.startLevel('simple', 60))
  const view = () => page.evaluate(() => ({ s: window.arrowhead.view.pz.s, tx: window.arrowhead.view.pz.tx, fit: window.arrowhead.view.pz.fitScale }))
  const before = await view()
  await page.evaluate(() => window.arrowhead.view.pz.zoomBy(3))
  const zoomed = await view()
  expect(zoomed.s).toBeGreaterThan(before.s * 2)
  const box = await page.locator('#board').boundingBox()
  await page.mouse.move(box.x + 200, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 300, { steps: 5 })
  await page.mouse.up()
  const dragged = await view()
  expect(dragged.tx).toBeLessThan(zoomed.tx)
  expect(await page.evaluate(() => window.arrowhead.current.board.left)).toBe(await page.evaluate(() => window.arrowhead.current.board.arrows.length))
  await page.locator('#fit').click()
  expect((await view()).s).toBeCloseTo(before.fit, 5)
})

test('shared Settings panel: light, colors, music, remembered after a reload', async ({ page }) => {
  await start(page)
  await page.locator('#home-settings').click()
  const panel = page.locator('dialog.hub-settings')
  await expect(panel).toBeVisible()
  // Same order as every GameHub game: a few open sections, the rest folded away.
  await expect(panel.locator('h3:visible')).toHaveText(['Light', 'Sound', 'Arrowhead path'])
  await expect(panel.locator('.hub-fold summary')).toHaveText(['Nature sounds', 'Move your progress', 'Credits'])
  await expect(panel.getByRole('slider', { name: 'Rain' })).toBeHidden()
  await panel.getByRole('radio', { name: 'White on black' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'white')
  await panel.getByRole('radio', { name: 'Night' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await expect(panel.getByLabel('Music style')).toHaveValue('quiet-words')
  await panel.getByLabel('Music style').selectOption({ label: 'Celtic Harp' })
  const style = await page.evaluate(() => window.arrowhead.settingsPanel.settings.music)
  expect(style).toBe('celtic')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  expect(await page.evaluate(() => window.arrowhead.settingsPanel.settings.music)).toBe('celtic')
})

test('old settings ({ night, sound }) move to the shared names', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('arrowhead:settings', JSON.stringify({ colors: 'white', night: true, sound: false })))
  await page.reload()
  const s = await page.evaluate(() => window.arrowhead.settingsPanel.settings)
  expect(s).toMatchObject({ colors: 'white', light: 'night', muted: true })
  expect(s.night).toBeUndefined()
})

test('Arrowhead path: stone look, heavy arrows slide and stay, undo, Calm mode', async ({ page }) => {
  await start(page)
  await page.locator('#play-native').click()
  await expect(page.locator('#level-name')).toHaveText('Level 1')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'native')
  expect(await page.evaluate(() => window.arrowhead.view.native)).toBe(true)

  await page.evaluate(() => window.arrowhead.startLevel('native', 30))
  await expect(page.locator('#coach-text')).toContainText('heavy arrows')
  const heavy = await page.evaluate(() => {
    const b = window.arrowhead.current.board
    return b.arrows.filter((a) => a.heavy && !b.isFree(a.id) && b.look(a.id).room > 0).map((a) => a.id)
  })
  expect(heavy.length).toBeGreaterThan(0)
  const before = await page.evaluate((id) => JSON.stringify(window.arrowhead.current.board.arrows[id].cells), heavy[0])
  await page.evaluate((id) => window.arrowhead.view.showArrow(id), heavy[0])
  await tapArrow(page, heavy[0])
  const after = await page.evaluate((id) => JSON.stringify(window.arrowhead.current.board.arrows[id].cells), heavy[0])
  expect(after).not.toBe(before)
  await page.locator('#undo').click()
  expect(await page.evaluate((id) => JSON.stringify(window.arrowhead.current.board.arrows[id].cells), heavy[0])).toBe(before)

  // Calm mode: from the next level started, heavy arrows bounce back.
  await page.locator('#play-settings').click()
  await page.locator('dialog.hub-settings').getByText('Calm mode').click()
  await page.locator('.hub-settings-close').click()
  await page.evaluate(() => window.arrowhead.startLevel('native', 31))
  expect(await page.evaluate(() => window.arrowhead.current.board.heavyRules)).toBe(false)
  await page.locator('#go-home').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'black')
})

test('coins: one per 10 arrows, once each; free Hints and Burns first, then coins; undo gives a Burn back', async ({ page }) => {
  await start(page)
  await expect(page.locator('#home-coins')).toHaveText('0')
  await page.locator('#play-simple').click()
  await expect(page.locator('#coach')).toBeVisible() // the first lesson
  await page.locator('#coach-ok').click()
  await expect(page.locator('#hint-price')).toHaveText('3 free')
  await expect(page.locator('#burn-price')).toHaveText('2 free')
  const save = () => page.evaluate(() => JSON.parse(JSON.stringify(window.arrowhead.save)))

  const a = await freeArrow(page)
  await tapArrow(page, a)
  expect((await save()).meter).toBe(1)
  await page.locator('#undo').click()
  await tapArrow(page, a)
  expect((await save()).meter).toBe(1) // counted once only
  await page.evaluate(() => (window.arrowhead.save.meter = 9))
  await tapArrow(page, await freeArrow(page))
  expect(await save()).toMatchObject({ meter: 0, coins: 1 })
  await expect(page.locator('#coins')).toHaveText('1')

  await page.locator('#hint').click()
  expect(await save()).toMatchObject({ coins: 1, free: { hint: 2, burn: 2 } })
  await expect(page.locator('#hint-price')).toHaveText('2 free')
  const hinted = await page.evaluate(() => window.arrowhead.view.hint)
  expect(await page.evaluate((h) => window.arrowhead.current.board.isFree(h), hinted)).toBe(true)
  await page.locator('#hint').click() // same hint again: no charge
  expect((await save()).free.hint).toBe(2)

  // A free Burn, given back by Undo.
  await page.locator('#burn').click()
  let stuck = await blockedArrow(page)
  await tapArrow(page, stuck)
  expect((await save()).free.burn).toBe(1)
  await page.locator('#undo').click()
  expect((await save()).free.burn).toBe(2)
  expect(await page.evaluate((s) => window.arrowhead.current.board.arrows[s].gone, stuck)).toBe(false)

  // No free ones left: Burn costs coins.
  await page.evaluate(() => (window.arrowhead.save.free.burn = 0))
  await page.locator('#burn').click()
  await expect(page.locator('#toast')).toContainText('costs 30') // not enough coins
  await page.evaluate(() => (window.arrowhead.save.coins = 100))
  await page.locator('#burn').click()
  await expect(page.locator('#burn')).toHaveAttribute('aria-pressed', 'true')
  stuck = await blockedArrow(page)
  await tapArrow(page, stuck)
  expect((await save()).coins).toBe(70)
  await page.locator('#undo').click()
  expect((await save()).coins).toBe(100)
})

const clearBoard = async (page) => {
  for (let i = 0; i < 400; i++) {
    const id = await freeArrow(page)
    if (id === -1) break
    await page.evaluate((id) => window.arrowhead.tapArrow(id), id)
  }
  await expect(page.locator('#done')).toBeVisible()
}

test('old saves start the wallet fresh; level 10 gives a free Hint; old levels can be replayed', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('arrowhead:save', JSON.stringify({ v: 1, coins: 480, starter: true, paths: { simple: { level: 10 }, native: { level: 1 } }, board: null, tips: ['tap', 'coins', 'undo', 'zoom', 'hint', 'burn'] })),
  )
  await start(page)
  const save = () => page.evaluate(() => JSON.parse(JSON.stringify(window.arrowhead.save)))
  expect(await save()).toMatchObject({ v: 2, coins: 0, meter: 0, free: { hint: 3, burn: 2 }, paths: { simple: { level: 10 } } })
  await expect(page.locator('#native-replay')).toBeHidden()

  await page.locator('#play-simple').click()
  await clearBoard(page)
  await expect(page.locator('#done-coins')).toContainText('A free Hint')
  expect(await save()).toMatchObject({ free: { hint: 4 }, paths: { simple: { level: 11 } } })
  const arrows = await page.evaluate(() => window.arrowhead.current.board.arrows.length)
  expect((await save()).coins * 10 + (await save()).meter).toBe(arrows)

  await page.locator('#done-home').click()
  await page.locator('#simple-replay').click()
  await expect(page.locator('.replay-level')).toHaveCount(10)
  await page.getByRole('button', { name: 'Level 3', exact: true }).click()
  await expect(page.locator('#level-name')).toHaveText('Level 3 (replay)')
  const before = (await save()).coins * 10 + (await save()).meter
  await clearBoard(page)
  const level3 = await page.evaluate(() => window.arrowhead.current.board.arrows.length)
  expect((await save()).coins * 10 + (await save()).meter).toBe(before + level3) // pays the same
  expect((await save()).paths.simple.level).toBe(11)
  expect((await save()).free.hint).toBe(4) // no gift for a replay
})

test('transfer code carries levels and coins; hidden tools set progress', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    window.arrowhead.save.coins = 77
    window.arrowhead.save.paths.simple.level = 9
  })
  await page.locator('#home-settings').click()
  const panel = page.locator('dialog.hub-settings')
  await panel.getByText('Move your progress').click()
  await panel.getByRole('button', { name: 'Get transfer code' }).click()
  const code = await panel.locator('.hub-code').inputValue()
  expect(code).toMatch(/^GH1\.arrowhead\./)

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.hub-start').click()
  await expect(page.locator('#home-coins')).toHaveText('0')
  await page.locator('#home-settings').click()
  await panel.getByText('Move your progress').click()
  await panel.getByRole('button', { name: 'Enter a code' }).click()
  await panel.locator('.hub-code').fill(code)
  await panel.getByRole('button', { name: 'Use this code' }).click()
  await expect(panel.locator('.hub-message')).toHaveText('Progress restored.')
  await expect(page.locator('#home-coins')).toHaveText('77')
  await expect(page.locator('#simple-level')).toHaveText('Level 9')

  const manual = panel.locator('section', { hasText: 'Set progress by hand' })
  await expect(manual).toBeHidden()
  for (let i = 0; i < 5; i++) await panel.locator('h2').click()
  await panel.locator('.hub-secret input').fill(FAMILY_CODE)
  await panel.locator('.hub-secret button').click()
  await expect(manual).toBeVisible()
  await manual.getByLabel('Simple Arrows level').fill('40')
  await manual.getByLabel('Arrowhead level').fill('12')
  await manual.getByLabel('Coins').fill('500')
  await manual.getByRole('button', { name: 'Set' }).click()
  await panel.locator('.hub-settings-close').click()
  await expect(page.locator('#home-coins')).toHaveText('500')
  await expect(page.locator('#simple-level')).toHaveText('Level 40')
  await expect(page.locator('#native-level')).toHaveText('Level 12')
})
