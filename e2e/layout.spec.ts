// The one check of the layout: on a phone held upright nothing is wider than
// the screen. (How the interface looks at every size is not an end-to-end
// matter; this only makes sure that the page cannot be pushed sideways.)
import type { Page } from '@playwright/test'
import { bubbles, characterAppeared, expect, openTasks, progressPill, promptField, send, test } from './fixtures'

test.use({ viewport: { width: 390, height: 844 } })

/**
 * Fails if the page could be scrolled sideways, or if anything drawn in the
 * interface or said by the character reaches past the screen's left or right
 * edge. The page itself never scrolls (it clips what sticks out), so the
 * second half is the one that would notice a part that is too wide.
 */
async function expectNothingWiderThanTheScreen(page: Page, when: string) {
  const { scrollWidth, clientWidth, sticksOut } = await page.evaluate(() => {
    const screen = document.documentElement.clientWidth
    const sticksOut: string[] = []
    for (const element of document.querySelectorAll('.ui *, .bubbles *')) {
      // Text for screen readers is positioned, but not drawn.
      if (element.closest('.sr-only')) continue
      const { left, right, width, height } = element.getBoundingClientRect()
      if (width === 0 || height === 0) continue
      if (left < -0.5 || right > screen + 0.5) {
        sticksOut.push(`<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> from ${left.toFixed(1)} to ${right.toFixed(1)}`)
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: screen, sticksOut }
  })
  expect(scrollWidth, `width of the page ${when}`).toBeLessThanOrEqual(clientWidth)
  expect(sticksOut, `what reaches past the sides of the screen ${when}`).toEqual([])
}

test('on a phone nothing is wider than the screen', async ({ page }) => {
  await page.goto('/')
  await expect(promptField(page)).toBeVisible()
  await expectNothingWiderThanTheScreen(page, 'at rest')

  // The tasks panel, which is a sheet from the bottom here.
  const panel = await openTasks(page)
  await expectNothingWiderThanTheScreen(page, 'with the tasks open')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  // The settings.
  await page.getByRole('button', { name: '설정' }).click()
  const settings = page.getByRole('dialog', { name: '설정' })
  await expect(settings).toBeVisible()
  await expectNothingWiderThanTheScreen(page, 'with the settings open')
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)

  // A task under way, with the longest line the character says beside its head.
  await characterAppeared(page)
  await send(page, 'Where do the cheapest flights to Jeju leave from in the first week of March?')
  await expect(progressPill(page)).toBeVisible()
  await expectNothingWiderThanTheScreen(page, 'with a task running')
  await expect(bubbles(page)).toHaveText(["I'm searching for information on the web..."], { timeout: 60_000 })
  await expectNothingWiderThanTheScreen(page, 'while the character speaks')

  await progressPill(page).getByRole('button', { name: '작업 취소' }).press('Enter')
  await expect(promptField(page)).toBeVisible()
})
