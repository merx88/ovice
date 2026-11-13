import { defineConfig } from '@playwright/test'

/** Where `vite preview` serves the built app for the tests. */
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

/**
 * Software WebGL, so that the 3D scene is drawn on a machine without a
 * graphics card (the same flags as `scripts/snap.mjs`).
 */
const SOFTWARE_WEBGL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

/**
 * A Chromium to use instead of the one Playwright installs for itself
 * (`npx playwright install chromium`), for machines that come with a browser.
 */
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: 'e2e',
  // One page at a time. Software rendering takes every core for a single
  // page; a second one would halve the frame rate of both and gain nothing.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // A test that only passes the second time is a failing test.
  retries: 0,
  reporter: 'list',
  // Drawn in software the scene manages about a frame a second, and the
  // character needs some fifty frames to bring a result round its desk.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    // Small, because the frame rate depends on the size of the canvas. Wide
    // enough for the desktop layout; `e2e/layout.spec.ts` has the phone.
    viewport: { width: 800, height: 520 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: SOFTWARE_WEBGL,
      executablePath: CHROMIUM || undefined,
    },
    // No single click or key press takes longer, even at a frame a second: a
    // control that cannot be reached fails here instead of running out the test's time.
    actionTimeout: 45_000,
    navigationTimeout: 45_000,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // The built app, as it is deployed, not the dev server.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Always a fresh build: a server that happens to be running may be serving an old one.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
