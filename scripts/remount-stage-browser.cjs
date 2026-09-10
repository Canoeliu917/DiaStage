const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:4318'
  const output = path.resolve('previews/remount-stage')
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], failedRequests = [], checks = []
  let id
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }) })
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { get: () => undefined }))
  const check = message => { checks.push(message); console.log(message) }
  const stored = () => page.evaluate(async id => (await fetch(`/api/scenes/${id}`, { cache: 'no-store' })).json(), id)
  const root = graph => graph.nodes[graph.rootNodeIds[0]]
  const waitStored = async predicate => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const data = await stored()
      if (predicate(data.graph)) return data.graph
      await page.waitForTimeout(400)
    }
    throw new Error('Expected persisted remount snapshot did not arrive')
  }
  const place = async (x, z) => {
    const position = await page.locator('[data-stage-placement-surface]').evaluate((surface, { x, z }) => {
      const corners = [...surface.points], matrix = surface.getScreenCTM()
      const u = (x + 15) / 30, v = (z + 7) / 21
      const point = new DOMPoint(corners[0].x + u * (corners[1].x - corners[0].x) + v * (corners[3].x - corners[0].x), corners[0].y + u * (corners[1].y - corners[0].y) + v * (corners[3].y - corners[0].y)).matrixTransform(matrix)
      return { x: point.x, y: point.y }
    }, { x, z })
    await page.mouse.click(position.x, position.y)
  }
  const step = number => page.getByRole('navigation', { name: '复台步骤' }).getByRole('button').nth(number - 1).click()
  try {
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '建立空舞台', exact: true }).click()
    await page.getByLabel('宽度（米）', { exact: true }).fill('10')
    await page.getByLabel('深度（米）', { exact: true }).fill('7')
    await page.getByRole('button', { name: '建立舞台', exact: true }).click()
    await page.waitForURL('**/scene/**')
    id = new URL(page.url()).pathname.split('/').at(-1)
    await page.getByRole('button', { name: '舞台库', exact: true }).click()
    await page.getByRole('heading', { name: '舞台库', exact: true }).waitFor()
    await page.getByRole('button', { name: '平面', exact: true }).click()
    await page.getByRole('button', { name: /^台块 1 × 1 米/ }).click()
    await place(-2, 3)
    await waitStored(graph => Object.values(graph.nodes).some(node => node.metadata.stageKind === 'neutral-block'))
    await page.locator('.stage-manual').getByRole('button', { name: '舞台镜头', exact: true }).click()
    await page.locator('.stage-library-grid').getByRole('button').first().click()
    await place(2, 2)
    const before = await waitStored(graph => root(graph).metadata.diastageCameraStudio?.shots.length === 1)
    const object = Object.values(before.nodes).find(node => node.metadata.stageKind === 'neutral-block')
    const camera = root(before).metadata.diastageCameraStudio.shots[0]
    check('Manual entry places scenery and a canonical metadata camera in one project')
    await page.getByRole('navigation', { name: '工作区' }).getByRole('button', { name: '复台', exact: true }).click()
    await page.getByRole('heading', { name: '复台', exact: true }).waitFor()
    assert.equal(await page.getByLabel('宽 / 米', { exact: true }).inputValue(), '10')
    assert.equal(await page.getByLabel('深 / 米', { exact: true }).inputValue(), '7')
    assert.equal(await page.getByLabel('实测净高 / 米', { exact: true }).inputValue(), '')
    await page.getByRole('button', { name: '全选可搬运物件', exact: true }).click()
    await page.getByRole('button', { name: '记录演出布置 →', exact: true }).click()
    await step(3)
    await page.getByRole('button', { name: '校准并生成预览 →', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '净高尚未测量' }).waitFor()
    check('Remount reads 10×7 actual dimensions and blocks preview until source height is measured')
    await step(1)
    await page.getByLabel('实测净高 / 米', { exact: true }).fill('5.2')
    await step(2)
    await page.getByLabel('宽 / 米', { exact: true }).fill('10')
    await page.getByLabel('深 / 米', { exact: true }).fill('7')
    await page.getByLabel('实测净高 / 米', { exact: true }).fill('6')
    await step(3)
    await page.getByRole('button', { name: '校准并生成预览 →', exact: true }).click()
    await page.getByText('总体校准误差（均方根）', { exact: true }).waitFor()
    assert.match(await page.locator('.rm-content').innerText(), /2 个物件 · 0 项冲突/)
    const preview = (await stored()).graph
    assert.deepEqual(preview.nodes[object.id].position, object.position)
    assert.deepEqual(root(preview).metadata.diastageCameraStudio.shots, [camera])
    check('Six-step preview includes both placements without persisting either transform')
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(600)
      await step(4)
      await page.getByRole('button', { name: '重新计算并查看全景', exact: true }).click()
      await page.waitForTimeout(500)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `${name}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.waitForTimeout(600)
    await step(5)
    await page.getByLabel('我已核对位置、尺寸、净距提示与现场条件', { exact: true }).check()
    await page.getByRole('button', { name: '确认复台', exact: true }).click()
    const applied = await waitStored(graph => root(graph).metadata.remount?.lastPlan?.placements.length === 2)
    assert.equal(Object.keys(applied.nodes).length, Object.keys(before.nodes).length)
    assert.equal(applied.nodes[object.id].position[0], object.position[0] + 10)
    assert.equal(root(applied).metadata.diastageCameraStudio.shots[0].keyframes[0].position[0], camera.keyframes[0].position[0] + 10)
    assert.equal(root(applied).metadata.stageHeightMeasured, true)
    check('Confirm persists mixed scenery/camera placement plus measured height without fake nodes')
    await page.getByRole('button', { name: '撤销本次复台', exact: true }).click()
    await waitStored(graph => graph.nodes[object.id].position[0] === object.position[0] && root(graph).metadata.diastageCameraStudio.shots[0].keyframes[0].position[0] === camera.keyframes[0].position[0])
    check('One Remount undo restores and saves both scenery and camera')
    await page.getByRole('navigation', { name: '工作区' }).getByRole('button', { name: '置景', exact: true }).click()
    await page.getByRole('button', { name: '舞台与场地', exact: true }).click()
    await page.getByLabel('实测净高（米）', { exact: true }).fill('4.8')
    await waitStored(graph => root(graph).metadata.stageHeightMeasured === true && root(graph).metadata.diastageTheatre.venue.height === 4.8)
    check('SET venue height measurement uses the same command pipeline and persists its measured flag')
    assert.deepEqual(errors, [])
    assert.deepEqual(failedRequests, [])
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ url: page.url(), checks, errors, failedRequests }, null, 2))
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ url: page.url(), checks, errors, failedRequests, error: String(error) }, null, 2))
    throw error
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
