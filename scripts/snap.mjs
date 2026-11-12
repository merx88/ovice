// Takes a screenshot of the running dev/preview server.
//
//   node scripts/snap.mjs <url> <out.png> [width] [height] [deviceScaleFactor]
//
// Uses the Playwright that is already installed on the machine (it is not a
// project dependency), found through NODE_PATH.
import { createRequire } from 'node:module'

const [url, out, width = '1728', height = '1117', scale = '1'] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node scripts/snap.mjs <url> <out.png> [width] [height] [deviceScaleFactor]')
  process.exit(1)
}

const SETTLE_MS = 2500
// Software rendering can take many seconds per frame.
const TIMEOUT_MS = 180_000
// Software WebGL, so the scene renders on machines without a GPU.
const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ args: WEBGL_ARGS })
try {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
    deviceScaleFactor: Number(scale),
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`[${message.type()}] ${message.text()}`)
  })
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: out, timeout: TIMEOUT_MS })
  console.log(`saved ${out}`)
} finally {
  await browser.close()
}
