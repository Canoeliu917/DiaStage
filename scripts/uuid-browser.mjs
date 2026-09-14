import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UUID_QA_URL
assert.equal(base, 'http://127.0.0.1:4331', 'Use the dedicated, empty UUID QA database on 4331')
const formal = 'http://127.0.0.1:4329'
const result = { physicalIpad: 'NOT_RUN', checks: [], pageerrors: [], createdIds: [], deletedIds: [] }
async function json(url) {
  const response = await fetch(url)
  assert.ok(response.ok, `Read failed: ${response.status} ${url}`)
  return response.json()
}
async function formalSnapshot() {
  const { scenes } = await json(`${formal}/api/scenes`)
  assert.equal(scenes.length, 3)
  return Promise.all(scenes.map(async (scene) => ({
    id: scene.id,
    version: scene.version,
    hash: createHash('sha256')
      .update(JSON.stringify(await json(`${formal}/api/scenes/${scene.id}`)))
      .digest('hex'),
  })))
}
assert.deepEqual((await json(`${base}/api/scenes`)).scenes, [], 'Do not test against existing data')
result.formalBefore = await formalSnapshot()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const mode of ['native', 'missing-randomUUID']) {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
    if (mode === 'missing-randomUUID')
      await context.addInitScript(() => {
        Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined })
      })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    page.on('pageerror', (error) => result.pageerrors.push({ mode, message: error.message }))
    try {
      await page.goto(`${base}/?entry=manual`)
      const nativeAvailable = await page.evaluate(() => typeof crypto.randomUUID === 'function')
      assert.equal(nativeAvailable, mode === 'native')
      const created = page.waitForResponse((response) =>
        response.url() === `${base}/api/scenes` && response.request().method() === 'POST')
      await page.getByRole('button', { name: '建立舞台', exact: true }).click()
      const response = await created
      assert.ok(response.ok(), `Create failed: ${response.status()} ${await response.text()}`)
      const { id } = await response.json()
      result.createdIds.push(id)
      await page.waitForURL(`**/scene/${id}**`)
      await page.locator('.diastage-viewer-column canvas').first().waitFor()
      result.checks.push({ mode, test: 'manual create and open QA stage', status: 'PASS', id })

      const list = await page.goto(`${base}/scenes`)
      assert.equal(list.status(), 200)
      await page.getByRole('heading', { name: '我的剧目', exact: true }).waitFor()
      await page.locator(`a[href="/scene/${id}"]`).click()
      await page.waitForURL(`**/scene/${id}`)
      await page.locator('.diastage-viewer-column canvas').first().waitFor()
      result.checks.push({ mode, test: 'list and reopen QA stage', status: 'PASS' })

      await page.goto(`${base}/scenes`)
      const newProduction = page.waitForResponse((response) =>
        response.url() === `${base}/api/scenes` && response.request().method() === 'POST')
      await page.getByRole('button', { name: '新建剧目', exact: true }).click()
      const production = await newProduction
      assert.ok(production.ok(), `New production failed: ${production.status()}`)
      const next = await production.json()
      result.createdIds.push(next.id)
      await page.waitForURL(`**/scene/${next.id}`)
      await page.locator('.diastage-viewer-column canvas').first().waitFor()
      result.checks.push({ mode, test: 'new production client UUID chain', status: 'PASS', id: next.id })
    } finally {
      await context.close()
    }
  }
  assert.deepEqual(result.pageerrors, [])
} catch (error) {
  result.error = error.message
  process.exitCode = 1
} finally {
  await browser.close()
  for (const id of result.createdIds) {
    const response = await fetch(`${base}/api/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' })
    assert.ok(response.ok, `Failed to remove this run's exact QA scene: ${id}`)
    result.deletedIds.push(id)
  }
  result.qaRemaining = (await json(`${base}/api/scenes`)).scenes.length
  result.formalAfter = await formalSnapshot()
  result.formalUnchanged = JSON.stringify(result.formalBefore) === JSON.stringify(result.formalAfter)
  await mkdir('.local', { recursive: true })
  await writeFile('.local/uuid-browser-results.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  assert.equal(result.qaRemaining, 0)
  assert.equal(result.formalUnchanged, true)
}
