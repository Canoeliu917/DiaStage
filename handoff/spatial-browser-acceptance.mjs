import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'

const base = process.env.SPATIAL_QA_BASE ?? 'http://localhost:4329'
const fixtures = JSON.parse(readFileSync('.local/spatial-qa-fixtures.json', 'utf8'))
const cases = {
  enclosure: ['三块景片围一个空间', 2],
  opening: ['三块景片围一个空间，中间留一个入口', 2],
  path: ['门口留一条通道', 1],
  'path-model': ['门口留一条通道', 0],
  corner: ['两块景片拐90度', 2],
  blocked: ['两块景片拐90度', 1],
  impossible: ['三块景片围一个空间，中间留一个9米宽入口', 0],
  fold: ['三联景片折成U型', 1],
}
const errors = [], results = []
const baseline = await (await fetch(`${base}/api/scenes`)).json()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const get = async (id) => {
  const response = await fetch(`${base}/api/scenes/${id}`)
  assert.ok(response.ok, `scene read ${response.status}`)
  return response.json()
}
const poll = async (id, predicate) => {
  for (let attempt = 0; attempt < 35; attempt++) {
    const value = await get(id)
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('scene persistence timeout')
}
try {
  for (const { scenario, graph } of fixtures.filter((fixture) => !process.env.SPATIAL_QA_CASE || fixture.scenario === process.env.SPATIAL_QA_CASE)) {
    const id = `spatial-qa-${scenario}-${Date.now()}`
    const created = await fetch(`${base}/api/scenes`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: `Spatial QA ${scenario}`, graph }) })
    assert.ok(created.ok, await created.text())
    let page
    try {
      const initial = await get(id), writes = []
      page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
      page.on('pageerror', (error) => errors.push(`${scenario}: ${error.message}`))
      page.on('request', (request) => {
        if (request.url().includes(`/api/scenes/${id}`) && ['PUT', 'PATCH'].includes(request.method())) writes.push(request.url())
      })
      await page.goto(`${base}/scene/${id}?workspace=set&disable=postFx`)
      await page.locator('.dia-composer textarea').waitFor({ timeout: 120000 })
      await page.waitForTimeout(3000)
      const send = async () => {
        await page.locator('.dia-composer textarea').fill(cases[scenario][0])
        await page.locator('.dia-composer').getByRole('button', { name: '发送', exact: true }).click()
        await page.locator('[aria-label="空间候选方案"]').waitFor({ timeout: 60000 })
      }
      await send()
      const candidates = page.locator('[aria-label="空间候选方案"] button')
      const count = await candidates.count()
      console.log(scenario, count, await page.locator('[aria-label="空间候选方案"]').innerText())
      assert.ok(count >= cases[scenario][1], `${scenario}: expected at least ${cases[scenario][1]} candidates, got ${count}`)
      if (['blocked', 'impossible', 'corner', 'path-model'].includes(scenario)) assert.equal(count, cases[scenario][1])
      assert.deepEqual((await get(id)).graph, initial.graph)
      assert.equal(writes.length, 0)
      if (!count) {
        assert.equal(await page.getByRole('button', { name: '采用', exact: true }).count(), 0)
        await page.getByRole('button', { name: '取消', exact: true }).click()
        results.push({ scenario, candidates: count, writes: 0, notAdoptable: true })
        continue
      }
      await candidates.first().click()
      await page.getByRole('button', { name: '采用', exact: true }).waitFor({ timeout: 60000 })
      if (count > 1) {
        await candidates.nth(1).click()
        await page.getByRole('button', { name: '采用', exact: true }).waitFor({ timeout: 60000 })
        assert.equal(await candidates.nth(1).getAttribute('aria-pressed'), 'true')
      }
      await page.screenshot({ path: `.local/spatial-${scenario}-ghost.png` })
      assert.deepEqual((await get(id)).graph, initial.graph)
      assert.equal(writes.length, 0)
      await page.getByRole('button', { name: '取消', exact: true }).click()
      assert.deepEqual((await get(id)).graph, initial.graph)
      assert.equal(writes.length, 0)
      await send()
      await candidates.first().click()
      await page.getByRole('button', { name: '采用', exact: true }).waitFor({ timeout: 60000 })
      await page.getByRole('button', { name: '采用', exact: true }).click()
      const accepted = await poll(id, (value) => value.version !== initial.version)
      assert.equal(writes.length, 1, 'Accept exactly one write')
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('Control+z')
      await poll(id, (value) => isDeepStrictEqual(value.graph, initial.graph))
      await page.keyboard.press('Control+Shift+z')
      await poll(id, (value) => isDeepStrictEqual(value.graph, accepted.graph))
      results.push({ scenario, candidates: count, ghostWrites: 0, switchWrites: 0, cancelWrites: 0, acceptWrites: 1, undoRedo: true })
      console.log('passed', scenario)
    } finally {
      await page?.close()
      const removed = await fetch(`${base}/api/scenes/${id}`, { method: 'DELETE', headers: { Origin: base } })
      assert.ok(removed.ok, `QA cleanup ${id}`)
    }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(await (await fetch(`${base}/api/scenes`)).json(), baseline)
} finally {
  await browser.close()
  writeFileSync('.local/spatial-browser-results.json', JSON.stringify({ base, results, errors }, null, 2))
  console.log(JSON.stringify({ results, errors }))
}
