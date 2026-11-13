// What every end-to-end test starts from: a page whose third-party font
// requests are answered locally, whose console is watched for trouble, and
// which keeps a record of what the character said. Import `test` and `expect`
// from here instead of from Playwright.
import { test as base, expect, type Locator, type Page } from '@playwright/test'

/** What a spec file or a single test can set with `test.use()`. */
export interface Options {
  /**
   * Turns the "reduce motion" setting on before the page loads, by the same
   * key the settings dialog saves it under. The character is then put where
   * it is going instead of walking there, which takes four times fewer frames.
   */
  reduceMotion: boolean
  /** False makes the browser refuse every WebGL context, as one without a working graphics stack does. */
  webgl: boolean
}

/**
 * Console messages that are let through, each with the reason it is not the
 * app's doing. Empty: so far the app's console has been clean in every flow.
 */
const KNOWN_NOISE: readonly { pattern: RegExp; reason: string }[] = []

/** The steps a task goes through, as the character announces them. */
export const STEP_LINES = [
  'Reading your request...',
  "I'm searching for information on the web...",
  'Comparing what I found...',
  'Writing up the report...',
]
/** What the character says while it brings a result, first one line, then both. */
export const DONE_LINES = ['The research is ready.', 'Let me hand you the file.']
export const CANCEL_LINE = 'Okay, stopping.'

/**
 * How long the character may take to bring a result to the front of its desk
 * (ms). It needs some fifty frames for that; a machine that draws the scene
 * in software manages about one a second.
 */
export const HANDOVER_TIMEOUT = 150_000

/**
 * How many frames `characterLoaded` lets the scene draw after the character's
 * model has arrived: half as many again as it took the character to appear
 * on the machine this was written on (6 to 10), where a frame takes a second.
 */
const FRAMES_UNTIL_CHARACTER = 15

/** The record the page keeps for the tests (see `recordWhatIsShown`). */
interface Shown {
  said: string[][]
  pill: string[]
  /**
   * How many frames the page has drawn since the character's model arrived,
   * counted up to `FRAMES_UNTIL_CHARACTER`, and when it arrived (ms); null until it has.
   */
  model: { frames: number; arrivedAt: number } | null
}

declare global {
  interface Window {
    __shown?: Shown
  }
}

/**
 * Runs in the page before any of its scripts: notes every state of the
 * character's speech bubbles and every text of the progress pill, in the
 * order they came up. With shortened timings a line can be gone again before
 * a test gets to look at the page; the record has it all the same. It also
 * counts the first `framesToCount` frames drawn after the character's model
 * has arrived, and then stops asking for frames: a page with nothing moving
 * on it would not draw any.
 */
function recordWhatIsShown(framesToCount: number) {
  const shown: Shown = { said: [], pill: [], model: null }
  window.__shown = shown

  const onFrame = (now: number) => {
    if (shown.model) shown.model.frames += 1
    else if (performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/models/ovice_guy.glb'))) {
      shown.model = { frames: 0, arrivedAt: now }
    }
    if (!shown.model || shown.model.frames < framesToCount) requestAnimationFrame(onFrame)
  }
  requestAnimationFrame(onFrame)

  let lastSaid = '[]'
  new MutationObserver(() => {
    const lines = Array.from(document.querySelectorAll('.bubbles__said p.bubble'), (line) => line.textContent ?? '')
    const key = JSON.stringify(lines)
    if (key !== lastSaid) {
      lastSaid = key
      shown.said.push(lines)
    }
    const pill = document.querySelector('.pill--progress .pill__text')?.textContent
    if (pill != null && shown.pill.at(-1) !== pill) shown.pill.push(pill)
  }).observe(document, { childList: true, subtree: true, characterData: true })
}

function seedReducedMotion() {
  localStorage.setItem('ovice.settings.v1', JSON.stringify({ mode: 'prototype', parallax: true, reduceMotion: true }))
}

function refuseWebGL() {
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (type.startsWith('webgl') || type === 'experimental-webgl') return null
    return Reflect.apply(getContext, this, [type, ...rest])
  } as typeof getContext
}

/**
 * The page links two font stylesheets on other hosts. The tests must not
 * depend on reaching them (a sandbox may not, and a request that fails is a
 * console error), so both are answered here with a stylesheet that declares
 * nothing, and the font host with an empty font nobody will ask for. This is
 * test set-up only. Everything else the page requests is loaded for real.
 */
async function answerFontHosts(page: Page) {
  const context = page.context()
  await context.route(/^https:\/\/(fonts\.googleapis\.com|cdn\.jsdelivr\.net)\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' }),
  )
  await context.route(/^https:\/\/fonts\.gstatic\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }),
  )
}

/**
 * Collects what must not happen in any flow: an error or a warning in the
 * console, an uncaught error, a dialog opened by the page.
 */
function watchForTrouble(page: Page): string[] {
  const trouble: string[] = []
  page.on('console', (message) => {
    const type = message.type()
    if (type !== 'error' && type !== 'warning' && type !== 'assert') return
    const text = message.text()
    if (KNOWN_NOISE.some(({ pattern }) => pattern.test(text))) return
    trouble.push(`console ${type}: ${text} (${message.location().url})`)
  })
  page.on('pageerror', (error) => {
    trouble.push(`uncaught error: ${error.message}`)
  })
  page.on('dialog', (dialog) => {
    trouble.push(`${dialog.type()} dialog: ${dialog.message()}`)
    void dialog.dismiss()
  })
  return trouble
}

export const test = base.extend<Options>({
  reduceMotion: [false, { option: true }],
  webgl: [true, { option: true }],

  page: async ({ page, reduceMotion, webgl }, use) => {
    await answerFontHosts(page)
    const trouble = watchForTrouble(page)
    await page.addInitScript(recordWhatIsShown, FRAMES_UNTIL_CHARACTER)
    if (reduceMotion) await page.addInitScript(seedReducedMotion)
    if (!webgl) await page.addInitScript(refuseWebGL)

    await use(page)

    expect(trouble, 'console errors and warnings, uncaught errors and dialogs during the test').toEqual([])
  },
})

export { expect }

/** The field a prompt is typed into. */
export function promptField(page: Page): Locator {
  return page.getByRole('textbox', { name: '에이전트에게 맡길 일' })
}

/** The orange pill that stands in for the prompt field while a task is running. */
export function progressPill(page: Page): Locator {
  return page.getByRole('group', { name: '진행 중인 작업' })
}

/** The character's speech bubbles, one per line it is saying now. */
export function bubbles(page: Page): Locator {
  return page.locator('.bubbles__said p.bubble')
}

/** The button laid over the folder the character holds out. */
export function folder(page: Page): Locator {
  return page.getByTestId('folder-hit')
}

/** The result viewer. */
export function viewer(page: Page): Locator {
  return page.getByRole('dialog')
}

/** Types `prompt` into the field and sends it with Enter. */
export async function send(page: Page, prompt: string) {
  const field = promptField(page)
  await field.fill(prompt)
  await field.press('Enter')
}

/** Opens the tasks panel from the dock and returns it. */
export async function openTasks(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '작업 목록' }).click()
  const panel = page.getByRole('region', { name: '작업 목록' })
  await expect(panel).toBeVisible()
  return panel
}

/**
 * Holds the character's model back, as a slow connection does, until the
 * function this returns is called. Call it before the page is opened.
 */
export async function holdModel(page: Page): Promise<() => void> {
  let letThrough = () => {}
  const held = new Promise<void>((resolve) => {
    letThrough = resolve
  })
  await page.route('**/models/ovice_guy.glb', async (route) => {
    await held
    await route.continue()
  })
  return letThrough
}

/**
 * Every state the character's bubbles have been in since the page was
 * loaded, oldest first: each entry is the lines that showed together, and an
 * empty entry is the character falling silent.
 */
export function said(page: Page): Promise<string[][]> {
  return page.evaluate(() => window.__shown?.said ?? [])
}

/** Every text the progress pill has shown since the page was loaded. */
export function pillTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__shown?.pill ?? [])
}

/**
 * Waits until the character has most likely appeared. Nothing in the page's
 * DOM says when it has: its model is downloaded and unpacked after the page
 * has loaded, and the character then simply sits there. This waits until the
 * scene has been drawn `FRAMES_UNTIL_CHARACTER` times since the model
 * arrived. On a fast machine those frames are over at once and the seconds
 * decide.
 *
 * It is a head start, not a proof. A test that needs to know the character
 * is there goes on to something only a character that is there does: saying
 * a line.
 */
export async function characterLoaded(page: Page) {
  await page.waitForFunction(
    ({ frames, ms }) => {
      const model = window.__shown?.model
      return model != null && model.frames >= frames && performance.now() - model.arrivedAt >= ms
    },
    { frames: FRAMES_UNTIL_CHARACTER, ms: 3000 },
    { polling: 250, timeout: 120_000 },
  )
}
