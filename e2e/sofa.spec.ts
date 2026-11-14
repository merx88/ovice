// The wait on the sofa: ten seconds without chat input send the character
// there, and the chat calls it back. The picture's description says where it
// is (see `SCENE` in `fixtures.ts`). The whole trip at the speed a visitor
// sees it, walk, hops and run, is the first half of the main flow in
// `flow.spec.ts`, so that the long walk is paid for once.
import {
  bubbles,
  DONE_LINES,
  expect,
  folder,
  HANDOVER_TIMEOUT,
  picture,
  progressPill,
  promptField,
  said,
  SCENE,
  scenes,
  send,
  test,
  viewer,
} from './fixtures'

/** How long the character may take to appear and sit at its desk (ms): its model has to arrive and be unpacked. */
const APPEAR_TIMEOUT = 120_000
/** How long it may take to be on the sofa where it goes there in one cut (ms): ten seconds, and the frames to notice. */
const CUT_TO_SOFA_TIMEOUT = 40_000

test.describe('with reduced motion, where the character changes place in one cut', () => {
  test.use({ reduceMotion: true })

  test('it waits at its desk, is on the sofa after ten seconds, comes back at a click into the chat field, and brings out what is asked of it then', async ({ page }) => {
    const prompt = 'Suggest three names for a reading club'
    await page.goto('/?fast=1')
    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk, { timeout: APPEAR_TIMEOUT })
    const seenAtDesk = Date.now()

    // Ten seconds without chat input, and it sits on the sofa. Not before: it was first seen at its desk
    // within a frame or two of appearing there.
    await expect(picture(page)).toHaveAccessibleName(SCENE.onSofa, { timeout: CUT_TO_SOFA_TIMEOUT })
    expect(Date.now() - seenAtDesk).toBeGreaterThan(7_000)

    // A click into the chat field brings it back.
    await promptField(page).click()
    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk)
    await expect(promptField(page)).toBeFocused()
    // One cut each way: it was never on its way.
    expect(await scenes(page)).toEqual([SCENE.empty, SCENE.atDesk, SCENE.onSofa, SCENE.atDesk])

    // And a prompt sent now runs to the hand-over as it always did.
    await send(page, prompt)
    await expect(bubbles(page)).toHaveText([DONE_LINES[1]], { timeout: HANDOVER_TIMEOUT })
    await expect(picture(page)).toHaveAccessibleName(SCENE.holding)
    await folder(page).press('Enter')
    await expect(viewer(page)).toHaveAccessibleName(prompt)
  })

  test('narrowing the window to a phone\'s width while it sits on the sofa brings it back, and there it stays', async ({ page }) => {
    await page.goto('/')
    await expect(picture(page)).toHaveAccessibleName(SCENE.onSofa, { timeout: APPEAR_TIMEOUT + CUT_TO_SOFA_TIMEOUT })

    // The narrow view frames the desk alone: the sofa is no place to sit any more.
    await page.setViewportSize({ width: 600, height: 520 })
    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk)
    const backAt = Date.now()
    // Ten seconds and more pass, and it has not gone back to the sofa...
    await expect.poll(() => Date.now() - backAt, { timeout: 30_000, intervals: [1_000] }).toBeGreaterThan(12_000)
    expect(await scenes(page)).toEqual([SCENE.empty, SCENE.atDesk, SCENE.onSofa, SCENE.atDesk])
    // ...until the window is wide again.
    await page.setViewportSize({ width: 800, height: 520 })
    await expect(picture(page)).toHaveAccessibleName(SCENE.onSofa, { timeout: CUT_TO_SOFA_TIMEOUT })
  })

  test('a reload while it sits on the sofa starts clean: it is at its desk again, nothing is running, and nothing was kept of where it sat', async ({ page }) => {
    await page.goto('/')
    await expect(picture(page)).toHaveAccessibleName(SCENE.onSofa, { timeout: APPEAR_TIMEOUT + CUT_TO_SOFA_TIMEOUT })

    await page.reload()

    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk, { timeout: APPEAR_TIMEOUT })
    // Since the reload it has been nowhere else.
    expect(await scenes(page)).toEqual([SCENE.empty, SCENE.atDesk])
    await expect(progressPill(page)).toHaveCount(0)
    await expect(promptField(page)).toBeVisible()
    await expect(promptField(page)).toHaveValue('')
    await expect(folder(page)).toHaveCount(0)
    expect(await said(page)).toEqual([])
    // The page stores its settings (which this test seeded) and its tasks; where the character sat is in neither.
    const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
    expect(Object.keys(stored)).toEqual(['ovice.settings.v1'])
    expect(Object.keys(JSON.parse(stored['ovice.settings.v1']) as object).sort()).toEqual(['mode', 'parallax', 'reduceMotion'])
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the character never leaves its desk: twelve seconds without chat input and it is still there', async ({ page }) => {
    await page.goto('/')
    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk, { timeout: APPEAR_TIMEOUT })
    const seenAtDesk = Date.now()
    await expect.poll(() => Date.now() - seenAtDesk, { timeout: 30_000, intervals: [1_000] }).toBeGreaterThan(12_000)
    await expect(picture(page)).toHaveAccessibleName(SCENE.atDesk)
    // Nor has it been anywhere else meanwhile.
    expect(await scenes(page)).toEqual([SCENE.empty, SCENE.atDesk])
  })
})
