// What must not go wrong: a reload in the middle of a task, a prompt that is
// HTML, an impatient Enter, a browser without WebGL.
import { expect, openTasks, pillTexts, progressPill, promptField, send, test, viewer } from './fixtures'

test('a reload in the middle of a task leaves it cancelled, and the pill does not come back', async ({ page }) => {
  const prompt = 'Plan a three-day trip to Busan'
  // At the speed a visitor sees, so that the task is still running when the page goes.
  await page.goto('/')
  await send(page, prompt)
  await expect(progressPill(page)).toContainText(prompt)

  await page.reload()

  await expect(promptField(page)).toBeVisible()
  await expect(promptField(page)).toHaveValue('')
  await expect(progressPill(page)).toHaveCount(0)
  const panel = await openTasks(page)
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(panel.getByRole('listitem')).toContainText(prompt)
  await expect(panel.locator('.task__status')).toHaveText(['취소됨'])
  // Still so after all that: nothing has taken the task up again.
  await expect(progressPill(page)).toHaveCount(0)
  await expect(promptField(page)).toBeVisible()
})

test('a prompt that is HTML is shown as text everywhere and runs nothing', async ({ page }) => {
  const hostile = '<img src=x onerror=alert(1)>'
  const dialogs: string[] = []
  page.on('dialog', (dialog) => dialogs.push(dialog.message()))
  await page.goto('/?fast=1')

  // In the pill while the task runs...
  await send(page, hostile)
  await expect.poll(() => pillTexts(page)).toEqual([hostile])
  await expect(progressPill(page)).toHaveCount(0)

  // ...in the list of tasks...
  const panel = await openTasks(page)
  const row = panel.getByRole('listitem')
  await expect(row).toHaveCount(1)
  await expect(row.locator('.task__prompt')).toHaveText(hostile)

  // ...and in the result: its title, and the report that quotes it.
  await row.getByRole('button').click()
  await expect(viewer(page)).toHaveAccessibleName(hostile)
  await expect(viewer(page).getByRole('heading', { level: 1 })).toHaveText(hostile)
  await expect(viewer(page).getByRole('region', { name: '문서 내용' })).toContainText(`“${hostile}” 요청에 대한 예시 리포트입니다.`)

  // No element was made of it, and its script never ran.
  await expect(page.locator('img')).toHaveCount(0)
  expect(dialogs).toEqual([])
})

test('Enter pressed twice in a row starts one task and does not stop it', async ({ page }) => {
  const prompt = 'Which houseplants survive a dark office?'
  await page.goto('/?fast=1')
  await promptField(page).fill(prompt)

  // Both key presses are on their way before the page has answered the first.
  await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Enter')])

  await expect.poll(() => pillTexts(page)).toEqual([prompt])
  await expect(progressPill(page)).toHaveCount(0)
  await expect(promptField(page)).toHaveValue('')
  const panel = await openTasks(page)
  await expect(panel.getByRole('listitem')).toHaveCount(1)
  await expect(panel.locator('.task__status')).toHaveText(['완료'])
})

test.describe('in a browser without WebGL', () => {
  test.use({ webgl: false })

  test('a notice stands where the office would be, and everything else works', async ({ page }) => {
    const prompt = 'Compare two ways to brew coffee at home'
    await page.goto('/?fast=1')

    await expect(page.getByRole('alert')).toHaveText('3D 화면을 불러오지 못했어요')
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Office', exact: true })).toHaveAttribute('aria-current', 'page')

    // A task runs to its end and its result can be read.
    await send(page, prompt)
    await expect.poll(() => pillTexts(page)).toEqual([prompt])
    await expect(progressPill(page)).toHaveCount(0)
    const panel = await openTasks(page)
    await expect(panel.locator('.task__status')).toHaveText(['완료'])
    await panel.getByRole('listitem').getByRole('button').click()
    await expect(viewer(page).locator('.badge')).toHaveText('예시 결과물')
    await expect(viewer(page)).toHaveAccessibleName(prompt)
    await viewer(page).getByRole('button', { name: '닫기' }).click()
    await expect(viewer(page)).toHaveCount(0)

    // The settings open, and say that the real agent is not there yet.
    await page.getByRole('button', { name: '설정' }).click()
    const settings = page.getByRole('dialog', { name: '설정' })
    await settings.getByRole('radio', { name: '실제 (준비 중)' }).click()
    await expect(settings.getByRole('status')).toHaveText('실제 모드는 준비 중이에요. 프로토타입 모드로 계속할게요.')
    await expect(settings.getByRole('radio', { name: '프로토타입' })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(settings).toHaveCount(0)
  })
})
