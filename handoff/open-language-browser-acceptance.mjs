import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'

const base = 'http://localhost:4329', formal = 'http://127.0.0.1:4329'
const fixtures = JSON.parse(readFileSync('.local/spatial-qa-fixtures.json', 'utf8'))
const get = async (id) => {
  const r = await fetch(`${base}/api/scenes/${id}`); assert.ok(r.ok); return r.json()
}
const formalSnapshot = async () => {
  const list = await (await fetch(`${formal}/api/scenes`)).json()
  const ids = (Array.isArray(list) ? list : list.scenes).map((s) => s.id)
  return Promise.all(ids.map(async (id) => { const text = await (await fetch(`${formal}/api/scenes/${id}`)).text(); return { id, sha256: createHash('sha256').update(text).digest('hex') } }))
}
const poll = async (id, predicate) => {
  for (let i = 0; i < 40; i++) { const v = await get(id); if (predicate(v)) return v; await new Promise((r) => setTimeout(r, 500)) }
  throw new Error('scene persistence timeout')
}
const initialList = await (await fetch(`${base}/api/scenes`)).json(), formalBefore = await formalSnapshot()
const browser = await chromium.launch({ channel: 'chrome', headless: true }), errors = [], results = []
try {
  for (const scenario of ['enclosure', 'path', 'direction'].filter((s) => !process.env.OPEN_QA_CASE || s === process.env.OPEN_QA_CASE)) {
    const graph = structuredClone(fixtures.find((f) => f.scenario === (scenario === 'direction' ? 'corner' : scenario)).graph)
    if (scenario === 'direction') {
      const removed = Object.values(graph.nodes).find((n) => n.name === '景片乙')
      delete graph.nodes[removed.id]
      graph.nodes[removed.parentId].children = graph.nodes[removed.parentId].children.filter((id) => id !== removed.id)
    }
    const id = `open-language-qa-${scenario}-${Date.now()}`, headers = { Origin: base, 'Content-Type': 'application/json' }
    const created = await fetch(`${base}/api/scenes`, { method: 'POST', headers, body: JSON.stringify({ id, name: `Open Language QA ${scenario}`, graph }) })
    assert.ok(created.ok, await created.text())
    let page
    try {
      const initial = await get(id), writes = [], utterances = []
      page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
      page.on('pageerror', (e) => errors.push(`${scenario}: ${e.message}`))
      page.on('request', (r) => { if (r.url().includes(`/api/scenes/${id}`) && ['PUT', 'PATCH'].includes(r.method())) writes.push(r.method()) })
      await page.goto(`${base}/scene/${id}?workspace=set&disable=postFx`)
      const composer = page.locator('.dia-composer'), textarea = composer.locator('textarea')
      await textarea.waitFor({ timeout: 120000 }); await page.waitForTimeout(3000)
      const send = async (text) => {
        utterances.push(text); await textarea.fill(text)
        await composer.getByRole('button', { name: '发送', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('.dia-composer textarea')?.disabled, { timeout: 60000 })
        await page.waitForTimeout(600)
      }
      const candidates = page.locator('[aria-label="空间候选方案"] button')
      const ghost = async () => {
        if (scenario !== 'direction') { await candidates.first().waitFor({ timeout: 60000 }); await candidates.first().click() }
        else await page.getByRole('button', { name: '在舞台上试试', exact: true }).click()
        await page.getByRole('button', { name: '采用', exact: true }).waitFor({ timeout: 60000 })
      }
      const unchanged = async () => { assert.deepEqual((await get(id)).graph, initial.graph); assert.equal(writes.length, 0) }
      const phrase = scenario === 'enclosure' ? '拿三块景片给我围一下。' : scenario === 'path' ? '门口给我留条能走人的路。' : '景片甲放到台左'
      await send(phrase); await ghost(); await unchanged()
      if (scenario === 'enclosure') {
        await send('前面别封死，留个入口。'); await ghost(); await unchanged()
        await send('再宽一点。'); await ghost(); await unchanged()
        assert.match(await page.locator('[aria-label="空间候选方案"]').innerText(), /0\.9/)
        await send('换另一个方案。')
        assert.equal(await candidates.nth(1).getAttribute('aria-pressed'), 'true')
        await send('看第二个'); assert.equal(await candidates.nth(1).getAttribute('aria-pressed'), 'true')
      }
      if (scenario === 'direction') { await send('不是台左，我说的是观众左边。'); await ghost() }
      for (const text of ['把左边那块转个90度。', '开放一点。', '让景片飞起来']) {
        await send(text)
        assert.match(await page.locator('.dia-dialogue').innerText(), /需要澄清/)
        await page.getByRole('button', { name: '采用', exact: true }).waitFor()
        await unchanged()
      }
      await page.screenshot({ path: `.local/open-language-${scenario}.png` })
      await send('不要了。'); await unchanged()
      assert.equal(await page.getByRole('button', { name: '采用', exact: true }).count(), 0)
      await send(phrase); await ghost(); await unchanged()
      await page.getByRole('button', { name: '采用', exact: true }).click()
      const accepted = await poll(id, (v) => v.version !== initial.version)
      assert.equal(writes.length, 1)
      await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Control+z')
      await poll(id, (v) => isDeepStrictEqual(v.graph, initial.graph))
      await page.keyboard.press('Control+Shift+z'); await poll(id, (v) => isDeepStrictEqual(v.graph, accepted.graph))
      results.push({ scenario, utterances, beforeAcceptWrites: 0, acceptWrites: 1, undoRedo: true, provider: 'deterministic' })
      console.log('PASS', scenario)
    } catch (error) {
      if (page) {
        await page.screenshot({ path: `.local/open-language-${scenario}-failure.png` })
        writeFileSync(`.local/open-language-${scenario}-failure.txt`, await page.locator('.dia-panel').innerText())
      }
      throw error
    } finally {
      await page?.close()
      const deleted = await fetch(`${base}/api/scenes/${id}`, { method: 'DELETE', headers }); assert.ok(deleted.ok)
    }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(await (await fetch(`${base}/api/scenes`)).json(), initialList)
  assert.deepEqual(await formalSnapshot(), formalBefore)
} finally {
  await browser.close()
  writeFileSync('.local/open-language-browser-results.json', JSON.stringify({ base, results, errors, formalBefore, formalAfter: await formalSnapshot() }, null, 2))
  console.log(JSON.stringify({ results, errors }))
}
