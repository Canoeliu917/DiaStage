import assert, { deepEqual } from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'

const base = process.env.DIA_STAGE_QA_BASE ?? 'http://127.0.0.1:4329'
const id = `dia-stage-integration-qa-${Date.now()}`
const fixture = JSON.parse(readFileSync('.local/dia-stage-integration-fixture.json', 'utf8'))
const created = await fetch(`${base}/api/scenes`, {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, name: 'Dia Stage Integration QA', graph: fixture.graph }),
})
assert.ok(created.ok, await created.text())
const errors = []
const writes = []
const checks = []
let writesAtAccept = null
let browser
const saved = async () => {
  const response = await fetch(`${base}/api/scenes/${id}`)
  if (response.status === 429) return null
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
const waitForSaved = async (predicate, message) => {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const value = await saved()
    if (value && predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(message)
}

try {
  const initial = await (await fetch(`${base}/api/scenes/${id}`)).json()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes(`/api/scenes/${id}`) && ['PUT', 'PATCH'].includes(request.method()))
      writes.push({ method: request.method(), url: request.url() })
  })
  const send = async () => {
    await page.locator('.dia-composer textarea').fill('把两块景片拼成一面直墙。')
    await page.locator('.dia-composer').getByRole('button', { name: '发送', exact: true }).click()
    await page.locator('[aria-label="Knowledge Stage Proposal"]').waitFor({ timeout: 15_000 })
  }
  await page.goto(`${base}/scene/${id}?workspace=set&disable=postFx`)
  await page.locator('.dia-composer textarea').waitFor({ timeout: 120_000 })
  await send()
  const proposalText = await page.locator('[aria-label="Knowledge Stage Proposal"]').innerText()
  assert.match(proposalText, /拼接/)
  assert.match(proposalText, /connect_edge/)
  assert.match(proposalText, /align/)
  deepEqual((await saved()).graph, initial.graph)
  assert.equal(writes.length, 0)
  checks.push('proposal creation keeps Formal Scene unchanged')

  await page.getByRole('button', { name: '在舞台上试试', exact: true }).click()
  await page.getByText('半透明布景是搭台建议', { exact: false }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '采用', exact: true }).waitFor()
  await page.screenshot({ path: '.local/dia-stage-integration-ghost.png' })
  deepEqual((await saved()).graph, initial.graph)
  assert.equal(writes.length, 0)
  checks.push('Ghost Preview keeps Formal Scene unchanged')

  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByText(/正式舞台(?:没有|未)改变/u).last().waitFor({ timeout: 15_000 })
  deepEqual((await saved()).graph, initial.graph)
  assert.equal(writes.length, 0)
  checks.push('Cancel clears preview without a scene write')

  await send()
  await page.getByRole('button', { name: '在舞台上试试', exact: true }).click()
  await page.getByRole('button', { name: '采用', exact: true }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '采用', exact: true }).click()
  const accepted = await waitForSaved(
    (value) => value.version !== initial.version,
    'Accept did not persist the Stage Proposal',
  )
  assert.equal(writes.length, 1)
  writesAtAccept = writes.length
  assert.ok(
    fixture.ids.some(
      (nodeId) =>
        !isDeepStrictEqual(accepted.graph.nodes[nodeId], initial.graph.nodes[nodeId]),
    ),
  )
  checks.push('Accept performs one formal scene write')

  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+z')
  await waitForSaved(
    (value) => isDeepStrictEqual(value.graph, initial.graph),
    'Undo did not restore the pre-Accept scene',
  )
  checks.push('Undo restores pre-Accept Formal Scene')
  await page.keyboard.press('Control+Shift+z')
  await waitForSaved(
    (value) => isDeepStrictEqual(value.graph, accepted.graph),
    'Redo did not restore the accepted proposal',
  )
  checks.push('Redo restores accepted Stage Proposal')
  await page.screenshot({ path: '.local/dia-stage-integration-accepted.png' })
  deepEqual(errors, [])
  checks.push('pageerror = 0')
  console.log(JSON.stringify({ checks, writesAtAccept, totalWritesWithUndoRedo: writes.length, errors }))
} finally {
  writeFileSync(
    '.local/dia-stage-integration-browser.json',
    JSON.stringify({ id, checks, writesAtAccept, writes, errors }, null, 2),
  )
  await browser?.close()
  let removed
  for (let attempt = 0; attempt < 6; attempt++) {
    removed = await fetch(`${base}/api/scenes/${id}`, {
      method: 'DELETE',
      headers: { Origin: base },
    })
    if (removed.status !== 429) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert.ok(removed.ok, 'temporary QA scene cleanup')
}
