// What every end-to-end test starts from: a page whose third-party font
// requests are answered locally, whose console is watched for trouble, and
// which keeps a record of what the character said and did. Import `test` and
// `expect` from here instead of from Playwright.
import { test as base, expect, type Locator, type Page } from '@playwright/test'

/** What a spec file or a single test can set with `test.use()`. */
export interface Options {
  /**
   * Turns the "reduce motion" setting on before the page loads, by the same
   * key the settings dialog saves it under. The character is then put where
   * it is going instead of walking or running there: a hand-over takes four
   * times fewer frames, and the way to the sofa or back none at all.
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
/** What the character says while it brings a result: the first line on its way, the second in its place once it is there. */
export const DONE_LINES = ['The research is ready.', 'Let me hand you the file.']
export const CANCEL_LINE = 'Okay, stopping.'

/**
 * How the picture of the office is described, which is how a test knows
 * where the character is and what it is doing (the sentences of
 * `src/character/sceneLabel.ts`).
 */
export const SCENE = {
  /** The character's model has not arrived yet. */
  empty: '3D 사무실에 캐릭터가 아직 나타나지 않았어요.',
  atDesk: '3D 사무실의 캐릭터가 책상에 앉아 기다리고 있어요.',
  toSofa: '3D 사무실의 캐릭터가 소파로 걸어가고 있어요.',
  onSofa: '3D 사무실의 캐릭터가 소파에 앉아 쉬고 있어요.',
  toDesk: '3D 사무실의 캐릭터가 책상으로 뛰어가고 있어요.',
  working: '3D 사무실의 캐릭터가 책상에서 일하고 있어요.',
  bringing: '3D 사무실의 캐릭터가 결과를 전하러 책상 앞으로 나오고 있어요.',
  holding: '3D 사무실의 캐릭터가 책상 앞에서 결과 파일을 내밀고 있어요.',
  returning: '3D 사무실의 캐릭터가 책상으로 돌아가고 있어요.',
  failed: '3D 사무실의 캐릭터가 일이 잘 풀리지 않아 머리를 긁적이고 있어요.',
} as const

/** Any of the descriptions that say what the character is doing: all of them but the office without it. */
const WITH_CHARACTER = new RegExp(
  `^(${Object.values(SCENE)
    .filter((sentence) => sentence !== SCENE.empty)
    .map((sentence) => sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
)

/**
 * How long the character may take to bring a result to the front of its desk
 * (ms). It needs some fifty frames for that; a machine that draws the scene
 * in software manages about one a second. A sip of coffee it has just begun
 * is finished first, which is another forty-six.
 */
export const HANDOVER_TIMEOUT = 150_000

/**
 * How long the character may take to walk to the sofa and sit down on it
 * (ms), from the moment it leaves its desk: some seventy frames.
 */
export const TO_SOFA_TIMEOUT = 150_000

/** How long it may take to run back and sit down at its desk (ms): some forty frames. */
export const TO_DESK_TIMEOUT = 100_000

/** The record the page keeps for the tests (see `recordWhatIsShown`). */
interface Shown {
  said: string[][]
  pill: string[]
  scene: string[]
}

declare global {
  interface Window {
    __shown?: Shown
  }
}

/**
 * Runs in the page before any of its scripts: notes every state of the
 * character's speech bubbles, every text of the progress pill and every
 * description the picture of the office has had, in the order they came up.
 * With shortened timings a line can be gone again before a test gets to look
 * at the page; the record has it all the same.
 */
function recordWhatIsShown() {
  const shown: Shown = { said: [], pill: [], scene: [] }
  window.__shown = shown

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
    const scene = document.querySelector('canvas')?.getAttribute('aria-label')
    if (scene != null && shown.scene.at(-1) !== scene) shown.scene.push(scene)
  }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  })
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
    await page.addInitScript(recordWhatIsShown)
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

/** The character's speech bubble; it says one line at a time, so there is one at the most. */
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
 * Everything the character's bubble has shown since the page was loaded,
 * oldest first: each entry is the lines that showed together (never more
 * than one), and an empty entry is the character falling silent.
 */
export function said(page: Page): Promise<string[][]> {
  return page.evaluate(() => window.__shown?.said ?? [])
}

/** Every text the progress pill has shown since the page was loaded. */
export function pillTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__shown?.pill ?? [])
}

/**
 * The picture of the office: the canvas, whose name says where the character
 * is and what it is doing (one of `SCENE`).
 */
export function picture(page: Page): Locator {
  return page.getByRole('img')
}

/**
 * Every description the picture has had since the page was loaded, oldest
 * first: the places the character has been and the things it has done, each
 * once per stretch.
 */
export function scenes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__shown?.scene ?? [])
}

/**
 * Waits until the character has appeared: its model is downloaded and
 * unpacked after the page has loaded, and until then the picture is described
 * as an office without it. Where the character is by the time this returns
 * depends on how long the test took to get here: ten seconds after it
 * appears, with the chat left alone, it is off to the sofa.
 */
export async function characterAppeared(page: Page) {
  await expect(picture(page)).toHaveAccessibleName(WITH_CHARACTER, { timeout: 120_000 })
}
