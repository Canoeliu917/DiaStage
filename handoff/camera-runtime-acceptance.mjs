import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'

const base = 'http://127.0.0.1:4329'
const id = `camera-runtime-qa-${Date.now()}`
const original = await (await fetch(`${base}/api/scenes/fcc2fff436ea`)).json()
const response = await fetch(`${base}/api/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ id, name: 'Camera Runtime QA', graph: original.graph }) })
assert.ok(response.ok, await response.text())
const initial = await (await fetch(`${base}/api/scenes/${id}`)).json()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
const checks = [], errors = []
page.on('pageerror', e => errors.push(e.message))
const pose = () => page.evaluate(() => {
  const camera = window.__sceneProbe.getState().camera
  return { position: camera.position.toArray(), direction: camera.getWorldDirection(camera.position.clone()).toArray(), projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective' }
})
const close = (a, b, tolerance = 0.002) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < tolerance, `${v} vs ${b[i]}`))
const say = async text => {
  const before = await pose()
  await page.locator('.dia-composer textarea').fill(text)
  await page.locator('.dia-composer').getByRole('button', { name: '发送', exact: true }).click()
  await page.waitForTimeout(2300)
  const after = await pose()
  checks.push({ text, before, after })
  console.log(JSON.stringify(checks.at(-1)))
  return { before, after }
}
try {
  await page.goto(`${base}/scene/${id}?workspace=set`)
  await page.locator('.dia-composer textarea').waitFor({ timeout: 120000 })
  await page.waitForTimeout(2500)
  await page.locator('canvas').first().evaluate(c => {
    let f = c[Object.keys(c).find(k => k.startsWith('__reactFiber'))]
    for (let i = 0; f && i < 8; i++, f = f.return) for (let h = f.memoizedState; h; h = h.next) {
      const v = h.memoizedState?.current
      if (v?.configure && v?.render) { const render = v.render; v.render = function (...a) { const s = render.apply(this, a); window.__sceneProbe = s; return s }; return }
    }
    throw Error('R3F root missing')
  })
  await page.setViewportSize({ width: 1820, height: 1100 })
  await page.waitForFunction(() => window.__sceneProbe)
  let result = await say('从俯视图角度看一下')
  assert.equal(result.after.projection, 'orthographic')
  assert.ok(result.after.direction[1] < -0.999)
  result = await say('从上面看一下')
  assert.equal(result.after.projection, 'perspective')
  assert.ok(Math.abs(result.after.direction[1] + Math.SQRT1_2) < 0.002)
  result = await say('镜头升高一点')
  assert.ok(result.after.position[1] > result.before.position[1] + 0.01)
  close(result.after.direction, result.before.direction)
  close([result.after.position[0], result.after.position[2]], [result.before.position[0], result.before.position[2]])
  result = await say('往下看一点')
  close(result.after.position, result.before.position)
  assert.ok(result.after.direction[1] < result.before.direction[1] - 0.01)
  result = await say('镜头高一点，再往下看一点')
  assert.ok(result.after.position[1] > result.before.position[1] + 0.01)
  assert.ok(result.after.direction[1] < result.before.direction[1] - 0.01)
  for (const text of ['俯视一下', '先从观众席看，再把镜头抬高一点']) {
    result = await say(text)
    close(result.after.position, result.before.position)
    close(result.after.direction, result.before.direction)
  }
  result = await say('从正上方看整个舞台')
  assert.equal(result.after.projection, 'orthographic')
  assert.ok(result.after.direction[1] < -0.999)
  result = await say('从上面看看整个舞台，但不要切平面图')
  assert.equal(result.after.projection, 'perspective')
  assert.ok(Math.abs(result.after.direction[1] + Math.SQRT1_2) < 0.002)
  await page.screenshot({ path: 'work/DiaStage-current/.local/camera-runtime-acceptance.png' })
  await page.getByRole('button', { name: '分屏', exact: true }).click()
  await page.waitForTimeout(1200)
  result = await say('从正上方看整个舞台')
  assert.equal(result.after.projection, 'orthographic')
  assert.ok(result.after.direction[1] < -0.999)
  await page.getByRole('button', { name: '平面', exact: true }).click()
  await page.waitForTimeout(1200)
  result = await say('从上面看一下')
  assert.equal(result.after.projection, 'perspective')
  assert.ok(Math.abs(result.after.direction[1] + Math.SQRT1_2) < 0.002)
  assert.ok(await page.locator('canvas').first().isVisible(), '2D command returns to visible 3D')
  result = await say('从正上方看看这张桌子')
  assert.equal(result.after.projection, 'orthographic')
  assert.ok(result.after.direction[1] < -0.999)
  assert.notDeepEqual(result.after.position, result.before.position)
  result = await say('从上面看看这张桌子')
  assert.equal(result.after.projection, 'perspective')
  assert.ok(Math.abs(result.after.direction[1] + Math.SQRT1_2) < 0.002)
  const final = await (await fetch(`${base}/api/scenes/${id}`)).json()
  assert.deepEqual(final.graph, initial.graph, 'camera commands cannot write Formal Scene')
  assert.equal(final.version, initial.version, 'camera commands cannot create scene revisions')
  assert.deepEqual(errors, [])
  console.log('PASS: actual Dia input → camera pose, projection and Formal Scene invariance')
} finally {
  writeFileSync('work/DiaStage-current/.local/camera-runtime-acceptance.json', JSON.stringify({ id, checks, errors }, null, 2))
  await browser.close()
  const removed = await fetch(`${base}/api/scenes/${id}`, { method: 'DELETE', headers: { Origin: base } })
  assert.ok(removed.ok, 'only the temporary camera QA scene is retired')
}
