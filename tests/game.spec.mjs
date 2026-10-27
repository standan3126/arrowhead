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

test('Night mode and arrow colors are remembered', async ({ page }) => {
  await start(page)
  await page.locator('#home-settings').click()
  await page.locator('[data-colors="white"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'white')
  await page.locator('#night').check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
})

test('coins: start with 25, arrows pay once, Hint and Burn cost, undoing a Burn refunds it', async ({ page }) => {
  await start(page)
  await expect(page.locator('#home-coins')).toHaveText('25')
  await page.locator('#play-simple').click()
  await expect(page.locator('#coach')).toBeVisible() // the first lesson
  await page.locator('#coach-ok').click()
  const coins = () => page.evaluate(() => window.arrowhead.save.coins)
  const a = await freeArrow(page)
  const pays = await page.evaluate((a) => window.arrowhead.current.board.arrows[a].cells.length <= 4 ? 1 : 2, a)
  await tapArrow(page, a)
  expect(await coins()).toBe(25 + pays)
  await page.locator('#undo').click()
  await tapArrow(page, a)
  expect(await coins()).toBe(25 + pays) // paid once only

  await page.locator('#hint').click()
  expect(await coins()).toBe(15 + pays)
  const hinted = await page.evaluate(() => window.arrowhead.view.hint)
  expect(await page.evaluate((h) => window.arrowhead.current.board.isFree(h), hinted)).toBe(true)
  await page.locator('#hint').click() // same hint again: free
  expect(await coins()).toBe(15 + pays)

  await page.locator('#burn').click()
  await expect(page.locator('#toast')).toContainText('costs 30') // not enough coins yet
  await page.evaluate(() => (window.arrowhead.save.coins = 100))
  await page.locator('#burn').click()
  await expect(page.locator('#burn')).toHaveAttribute('aria-pressed', 'true')
  const stuck = await blockedArrow(page)
  await tapArrow(page, stuck)
  expect(await coins()).toBe(70)
  expect(await page.evaluate((s) => window.arrowhead.current.board.arrows[s].gone, stuck)).toBe(true)
  await page.locator('#undo').click()
  expect(await coins()).toBe(100)
  expect(await page.evaluate((s) => window.arrowhead.current.board.arrows[s].gone, stuck)).toBe(false)
})

test('transfer code carries levels and coins; hidden tools set progress', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    window.arrowhead.save.coins = 77
    window.arrowhead.save.paths.simple.level = 9
  })
  await page.locator('#home-settings').click()
  await page.locator('#make-code').click()
  const code = await page.locator('#code').inputValue()
  expect(code).toMatch(/^GH1\.arrowhead\./)

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.hub-start').click()
  await expect(page.locator('#home-coins')).toHaveText('25')
  await page.locator('#home-settings').click()
  await page.locator('#enter-code').click()
  await page.locator('#code').fill(code)
  await page.locator('#use-code').click()
  await expect(page.locator('#message')).toHaveText('Progress restored.')
  await expect(page.locator('#home-coins')).toHaveText('77')
  await expect(page.locator('#simple-level')).toHaveText('Level 9')

  await expect(page.locator('#manual-section')).toBeHidden()
  for (let i = 0; i < 5; i++) await page.locator('#settings-heading').click()
  await page.locator('.hub-secret input').fill(FAMILY_CODE)
  await page.locator('.hub-secret button').click()
  await expect(page.locator('#manual-section')).toBeVisible()
  await page.locator('#manual-simple').fill('40')
  await page.locator('#manual-coins').fill('500')
  await page.locator('#set-manual').click()
  await expect(page.locator('#home-coins')).toHaveText('500')
  await expect(page.locator('#simple-level')).toHaveText('Level 40')
})
