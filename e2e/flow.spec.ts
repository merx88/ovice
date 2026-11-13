// The product's main paths, on the built app in a real browser. Every test
// also fails on any error or warning in the console (see `fixtures.ts`).
import {
  bubbles,
  CANCEL_LINE,
  characterLoaded,
  DONE_LINES,
  expect,
  folder,
  HANDOVER_TIMEOUT,
  openTasks,
  pillTexts,
  progressPill,
  promptField,
  said,
  send,
  STEP_LINES,
  test,
  viewer,
} from './fixtures'

test('the first screen shows the office tab, the prompt field and the 3D office', async ({ page }) => {
  const modelLoaded = page.waitForResponse((response) => response.url().endsWith('/models/ovice_guy.glb'))
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Office', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(promptField(page)).toBeVisible()
  await expect(promptField(page)).toBeEditable()
  await expect(page.locator('canvas')).toBeVisible()

  // The character's model is there to be drawn, and drawing it upsets nothing.
  expect((await modelLoaded).status()).toBe(200)
  await characterLoaded(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a prompt is worked on, and its result is brought out, opened and listed as done', async ({ page }) => {
  const prompt = 'Compare three note-taking apps for a small team'
  await page.goto('/?fast=1')

  // While the task runs, the pill in place of the field shows what was asked.
  await send(page, prompt)
  await expect.poll(() => pillTexts(page)).toEqual([prompt])

  // The character stands up, walks round its desk and holds the result out.
  await expect(bubbles(page)).toHaveText(DONE_LINES, { timeout: HANDOVER_TIMEOUT })
  await expect(promptField(page)).toBeVisible()
  // On the way it said nothing but its lines, and never said it was stopping.
  for (const lines of await said(page)) {
    for (const line of lines) expect([...STEP_LINES, ...DONE_LINES]).toContain(line)
  }

  // The folder in its hands opens the result.
  await folder(page).click()
  await expect(viewer(page).locator('.badge')).toHaveText('예시 결과물')
  await expect(viewer(page)).toHaveAccessibleName(prompt)
  await expect(viewer(page).getByRole('heading', { level: 1 })).toHaveText(prompt)

  // Closed again, the character has said its piece and the task is in the list, done.
  await viewer(page).getByRole('button', { name: '닫기' }).click()
  await expect(viewer(page)).toHaveCount(0)
  await expect(bubbles(page)).toHaveCount(0)
  await expect(folder(page)).toHaveCount(0)
  const panel = await openTasks(page)
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(panel.getByRole('listitem')).toContainText(prompt)
  await expect(panel.locator('.task__status')).toHaveText(['완료'])
})

test('a task that is stopped half-way has the character say so and gives the field back', async ({ page }) => {
  const prompt = 'Find the best season to visit Jeju'
  // At the speed a visitor sees: the task has to last until the character is there.
  await page.goto('/')
  await characterLoaded(page)

  await send(page, prompt)
  await expect(progressPill(page)).toContainText(prompt)
  await expect(progressPill(page).getByRole('progressbar')).toBeVisible()

  // `Okay, stopping.` is only said by a character that saw the task running: wait until it talks about it.
  await expect(bubbles(page)).toHaveCount(1, { timeout: 60_000 })
  expect(STEP_LINES).toContain((await said(page))[0][0])

  // From the keyboard, which does not have to wait for the page to hold still: the task will not wait either.
  await progressPill(page).getByRole('button', { name: '작업 취소' }).press('Enter')

  await expect(promptField(page)).toBeVisible()
  await expect(promptField(page)).toHaveValue('')
  await expect(progressPill(page)).toHaveCount(0)
  await expect.poll(() => said(page)).toContainEqual([CANCEL_LINE])
  // The line goes away by itself, and nothing is brought out.
  await expect(bubbles(page)).toHaveCount(0)
  expect((await said(page)).flat()).not.toContain(DONE_LINES[0])

  const panel = await openTasks(page)
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(panel.locator('.task__status')).toHaveText(['취소됨'])
})

test.describe('after a reload', () => {
  // The walk is not what this is about.
  test.use({ reduceMotion: true })

  test('the finished task is still listed, its result is not brought out again, and a new one is', async ({ page }) => {
    const first = 'List five ideas for a team workshop'
    const second = 'Summarise what changed in the plan'
    await page.goto('/?fast=1')
    await send(page, first)
    await expect(progressPill(page)).toHaveCount(0)
    await expect(promptField(page)).toBeVisible()

    await page.reload()

    // The task and its result came back from storage.
    const panel = await openTasks(page)
    await expect(panel.getByRole('listitem')).toHaveCount(1)
    await expect(panel.getByRole('listitem')).toContainText(first)
    await expect(panel.locator('.task__status')).toHaveText(['완료'])
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)

    // What the character goes by: the task is older than this page.
    const age = await page.evaluate(() => {
      const [task] = JSON.parse(localStorage.getItem('ovice.tasks.v1') ?? '[]') as { createdAt: number }[]
      return { createdAt: task.createdAt, pageLoadedAt: performance.timeOrigin }
    })
    expect(age.createdAt).toBeLessThan(age.pageLoadedAt)

    // So when the character appears it leaves that result alone. (As far as a
    // test can tell: see `characterLoaded` for how sure it is that it has appeared.)
    await characterLoaded(page)
    expect(await said(page)).toEqual([])
    await expect(folder(page)).toHaveCount(0)

    // It is there, though, and brings out what is asked of it now.
    await send(page, second)
    await expect(bubbles(page)).toHaveText(DONE_LINES, { timeout: HANDOVER_TIMEOUT })
    const broughtOut = (await said(page)).filter((lines) => lines.length === 1 && lines[0] === DONE_LINES[0])
    expect(broughtOut).toHaveLength(1)
    // The folder is a button, so the keyboard opens it too.
    await folder(page).press('Enter')
    await expect(viewer(page)).toHaveAccessibleName(second)
  })
})
