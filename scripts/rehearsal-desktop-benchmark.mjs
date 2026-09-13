import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
execFileSync(process.env.BUN_EXECUTABLE || 'bun', [
  'build', 'apps/editor/lib/rehearsal-intelligence/desktop-benchmark.ts',
  '--target=browser', '--format=iife', '--outfile=.tmp-v01-desktop-benchmark.js',
  '--define', 'process.env.NODE_ENV="production"',
], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  windowsHide: true,
  stdio: 'pipe',
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const timeout = setTimeout(() => { void browser.close() }, 60_000)
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = `http://127.0.0.1:4324/__diastage_synthetic_benchmark__/${crypto.randomUUID()}`
  await page.route('**/*', (route) =>
    route.request().url() === url
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic desktop benchmark</title>' })
      : route.abort(),
  )
  await page.goto(url)
  await page.addScriptTag({
    type: 'module',
    content: await readFile(new URL('../.tmp-v01-desktop-benchmark.js', import.meta.url), 'utf8'),
  })
  if (errors.length) throw new Error(`Benchmark harness failed: ${errors.join('; ')}`)
  const result = await page.evaluate(() => globalThis.runDiaStageDesktopBenchmark())
  const report = {
    date: new Date().toISOString(),
    environment: {
      browser: `Chrome ${browser.version()}`,
      platform: process.platform,
      headless: true,
      emptyLoopbackPage: true,
      applicationAndExternalRequestsBlocked: true,
    },
    ...result,
    reproduction: 'node scripts/rehearsal-desktop-benchmark.mjs; Bun must be on PATH (or BUN_EXECUTABLE); PLAYWRIGHT_MODULE may name an existing installed Playwright module',
  }
  await writeFile(
    new URL('../.impeccable/review/v01/desktop-hardening-performance.json', import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify({
    provenance: report.provenance,
    iterations: report.iterations,
    verification: report.verification,
    mediansMs: Object.fromEntries(Object.entries(report.measurements).map(([name, value]) => [name, value.median])),
  }, null, 2))
} finally {
  clearTimeout(timeout)
  await browser.close()
}
