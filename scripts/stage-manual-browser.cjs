const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:4318'
  const output = path.resolve('previews/stage-manual')
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], checks = []
  let id
  page.on('pageerror', e => errors.push(e.message))
  if (process.env.TRACE_STAGE_API) page.on('response', async response => {
    if (!response.url().includes('/api/scenes/') || response.url().endsWith('/events')) return
    const data = await response.json().catch(() => ({}))
    console.log(response.request().method(), response.status(), data.version, data.nodeCount, data.error || '')
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { get: () => undefined }))
  const check = message => { checks.push(message); console.log(message) }
  const blocks = async () => {
    const stored = await page.evaluate(async id => (await fetch(`/api/scenes/${id}`, { cache: 'no-store' })).json(), id)
    return Object.values(stored.graph.nodes).filter(n => n.metadata.stageKind === 'neutral-block')
  }
  const waitCount = async count => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await blocks()).length === count) return
      await page.waitForTimeout(500)
    }
    assert.equal((await blocks()).length, count)
  }
  const point = async (x, z) => page.locator('[data-stage-placement-surface]').evaluate((surface, { x, z }) => {
    const corners = [...surface.points], matrix = surface.getScreenCTM()
    const u = (x + 12) / 24, v = (z + 6) / 18
    const p = new DOMPoint(corners[0].x + u * (corners[1].x - corners[0].x) + v * (corners[3].x - corners[0].x), corners[0].y + u * (corners[1].y - corners[0].y) + v * (corners[3].y - corners[0].y)).matrixTransform(matrix)
    return { x: p.x, y: p.y }
  }, { x, z })
  const place = async (x, z) => { const p = await point(x, z); await page.mouse.click(p.x, p.y) }
  try {
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '建立空舞台', exact: true }).click()
    await page.getByLabel('宽度（米）', { exact: true }).fill('8')
    await page.getByLabel('深度（米）', { exact: true }).fill('6')
    await page.getByRole('button', { name: '建立舞台', exact: true }).click()
    await page.waitForURL('**/scene/**')
    id = new URL(page.url()).pathname.split('/').at(-1)
    await page.getByRole('button', { name: '舞台库', exact: true }).click()
    await page.getByRole('heading', { name: '舞台库', exact: true }).waitFor()
    check('Manual entry creates an independent measured stage and opens its library')
    await page.getByRole('button', { name: '平面', exact: true }).click()
    const blockButton = page.getByRole('button', { name: /^台块 1 × 1 米/ })
    await blockButton.click()
    await page.locator('[data-stage-placement-surface]').waitFor()
    assert.equal((await blocks()).length, 0)
    await page.screenshot({ path: path.join(output, 'ghost-2d.png') })
    await place(-2, 2)
    await waitCount(1)
    check('2D preview makes no scene nodes; one click commits a valid placement')
    const props = page.getByRole('group', { name: '布景属性', exact: true })
    await props.getByLabel('名称', { exact: true }).fill('验收台块')
    await props.getByLabel('名称', { exact: true }).press('Enter')
    await props.getByLabel('锁定位置与属性', { exact: true }).check()
    assert.equal(await props.getByLabel('台右位置 / 米', { exact: true }).isDisabled(), true)
    await props.getByLabel('锁定位置与属性', { exact: true }).uncheck()
    await props.getByLabel('高 / 米', { exact: true }).fill('1.2')
    await props.getByLabel('高 / 米', { exact: true }).press('Enter')
    await props.getByLabel('角度 / 度', { exact: true }).fill('90')
    await props.getByLabel('角度 / 度', { exact: true }).press('Enter')
    await props.getByLabel('隐藏', { exact: true }).check()
    await props.getByLabel('隐藏', { exact: true }).uncheck()
    await page.waitForFunction(() => document.querySelector('.studio-save-status')?.textContent === '已保存')
    assert.ok((await blocks()).some(n => n.name === '验收台块' && n.visible !== false && n.metadata.stageLocked === false && Math.abs(n.rotation + Math.PI / 2) < .001))
    check('Rename, lock, resize, rotation and hide/reveal commit through the executor and persist')
    await props.getByRole('button', { name: '复制后落位', exact: true }).click()
    await place(2, 2)
    await waitCount(2)
    await page.locator('.stage-manual').getByRole('button', { name: '撤销', exact: true }).click()
    await waitCount(1)
    await page.locator('.stage-manual').getByRole('button', { name: '重做', exact: true }).click()
    await waitCount(2)
    check('Duplicate placement is one undo step and redoes once')
    await blockButton.click()
    await place(-2, 2)
    await page.locator('[data-stage-placement-surface]').waitFor()
    assert.equal((await blocks()).length, 2)
    await place(5, 2)
    await page.locator('[data-stage-placement-surface]').waitFor()
    assert.equal((await blocks()).length, 2)
    await page.keyboard.press('Escape')
    await page.locator('[data-stage-placement-surface]').waitFor({ state: 'detached' })
    check('Collision and out-of-bounds clicks keep Ghost without nodes; Escape cancels')
    await blockButton.click()
    await page.getByRole('button', { name: '三维', exact: true }).click()
    await page.locator('[data-stage-placement-surface]').waitFor({ state: 'detached' })
    await page.locator('.stage-placement-readout').waitFor({ state: 'detached' })
    const canvas = page.locator('canvas').first()
    const canvasBox = await canvas.boundingBox()
    await blockButton.dragTo(canvas, { targetPosition: { x: canvasBox.width * .5, y: canvasBox.height * .5 } })
    await waitCount(3)
    check('Changing view cancels the draft; desktop drag-drop raycasts into the 3D stage')
    await page.screenshot({ path: path.join(output, 'desktop.png') })
    for (const [name, width, height] of [['tablet', 768, 1024], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(500)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `${name}.png`) })
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ url: page.url(), checks, errors }, null, 2))
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ url: page.url(), checks, errors, error: String(error) }, null, 2))
    throw error
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
