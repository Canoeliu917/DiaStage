import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'

const base = 'http://127.0.0.1:4329'
const id = `placement-language-qa-${Date.now()}`
const source = await (await fetch(`${base}/api/scenes/fcc2fff436ea`)).json()
const created = await fetch(`${base}/api/scenes`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: 'Placement Language QA', graph: source.graph }) })
assert.ok(created.ok)
const initial = await (await fetch(`${base}/api/scenes/${id}`)).json()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
const errors = [], writes = [], results = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().includes(`/api/scenes/${id}`) && ['PUT', 'PATCH'].includes(request.method())) writes.push(request.url()) })
try {
  await page.goto(`${base}/scene/${id}?workspace=set`)
  await page.locator('.dia-composer textarea').waitFor({ timeout: 120000 })
  for (const [input, expected] of [
    ['把三屉桌放到台左', '尚未计算落点'],
    ['把三屉桌放到观众左', '尚未计算落点'],
    ['三屉桌往左一点', '请在完整口令前加'],
    ['一号台块往左一点', '请在完整口令前加'],
    ['按观众方向把三屉桌往左移30厘米', '尚未计算落点'],
    ['把三屉桌叠在一号台块上', '尚未计算落点'],
    ['中间留空', '尚未计算落点'],
    ['放在上面', '接触支撑面'],
    ['对齐', '沿横向还是纵向'],
  ]) {
    const before = await page.locator('.dia-panel').getByText(expected, { exact: false }).count()
    await page.locator('.dia-composer textarea').fill(input)
    await page.locator('.dia-composer').getByRole('button', { name: '发送', exact: true }).click()
    await page.waitForFunction(({ expected, before }) => [...document.querySelectorAll('.dia-panel p')].filter(p => p.textContent.includes(expected)).length > before, { expected, before }, { timeout: 10000 })
    results.push({ input, expected, pass: true })
  }
  await page.screenshot({ path: 'work/DiaStage-current/.local/stage-placement-browser.png' })
  const final = await (await fetch(`${base}/api/scenes/${id}`)).json()
  assert.deepEqual(final.graph, initial.graph)
  assert.equal(final.version, initial.version)
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  console.log(JSON.stringify({ commands: results.length, sceneUnchanged: true, writes, errors }))
} finally {
  writeFileSync('work/DiaStage-current/.local/stage-placement-browser.json', JSON.stringify({ id, results, errors, writes }, null, 2))
  await browser.close()
  const removed = await fetch(`${base}/api/scenes/${id}`, { method: 'DELETE', headers: { Origin: base } })
  assert.ok(removed.ok)
}
