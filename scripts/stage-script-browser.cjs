const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:4318'
  const fixtures = process.env.SCRIPT_FIXTURES || path.join(__dirname, 'fixtures/stage-script')
  const output = path.resolve(process.env.BROWSER_OUTPUT || 'previews/stage-script')
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], consoleErrors = [], httpErrors = [], failed = [], cancelledPrefetch = [], checks = [], projects = [], layouts = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ message: message.text(), location: message.location() })
  })
  page.on('response', response => {
    if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() })
  })
  page.on('requestfailed', request => {
    const entry = { url: request.url(), error: request.failure()?.errorText }
    const headers = request.headers()
    const prefetch = headers['next-router-prefetch'] === '1' || headers.purpose === 'prefetch'
    ;(prefetch && entry.error === 'net::ERR_ABORTED' ? cancelledPrefetch : failed).push(entry)
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { get: () => undefined }))
  const root = graph => graph.nodes[graph.rootNodeIds[0]]
  const objects = graph => Object.values(graph.nodes).filter(node => node.metadata.stageKind)
  const waitStored = async (id, predicate) => {
    for (let attempt = 0; attempt < 70; attempt++) {
      const response = await page.request.get(`${base}/api/scenes/${id}`)
      assert.equal(response.status(), 200)
      const result = await response.json()
      if (predicate(result.graph)) return result.graph
      await page.waitForTimeout(500)
    }
    throw new Error('Timed out awaiting script scene persistence')
  }
  const open = async () => {
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '选择 PDF / Word', exact: true }).click()
    await page.getByLabel('剧本文件', { exact: true }).waitFor()
  }
  try {
    for (const [name, width, height] of [['desktop', 1440, 900], ['ipad-portrait', 820, 1180], ['ipad-landscape', 1180, 820], ['iphone', 390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.goto(base, { waitUntil: 'networkidle' })
      assert.equal(await page.getByRole('button', { name: '选择 PDF / Word', exact: true }).isEnabled(), true)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `home-${name}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await open()
    await page.getByLabel('剧本文件', { exact: true }).setInputFiles(path.join(fixtures, 'legacy.doc'))
    await page.getByRole('alert').filter({ hasText: '另存为 .docx' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '提取舞台方案', exact: true }).isDisabled(), true)
    await page.getByLabel('剧本文件', { exact: true }).setInputFiles(path.join(fixtures, 'scanned-empty.pdf'))
    await page.getByRole('button', { name: '提取舞台方案', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: /没有.*文字|扫描/ }).waitFor({ timeout: 65000 })
    assert.equal(await page.locator('.stage-plan-review').count(), 0)
    checks.push('Legacy DOC gives conversion guidance; scanned PDF returns a real server error and no empty-stage success')
    for (const extension of ['pdf', 'docx']) {
      await open()
      await page.getByLabel('剧本文件', { exact: true }).setInputFiles(path.join(fixtures, `stage-three-items.${extension}`))
      await page.getByRole('button', { name: '提取舞台方案', exact: true }).click()
      await page.getByRole('heading', { name: '先看台位，再确认搭台', exact: true }).waitFor({ timeout: 65000 })
      assert.equal(await page.locator('.stage-plan-item').count(), 3)
      for (const heading of ['剧本明确写出', '系统推测', '需要确认']) assert.equal(await page.getByRole('heading', { name: heading, exact: true }).count(), 1)
      assert.match(await page.locator('.stage-plan-item blockquote').first().innerText(), extension === 'pdf' ? /第 1 页/ : /第 1 段/)
      const sofaWidth = page.locator('.stage-plan-item').first().getByLabel('宽 / 米', { exact: true })
      await sofaWidth.fill('1.8')
      assert.equal(await sofaWidth.inputValue(), '1.8')
      await sofaWidth.fill('2')
      const door = page.locator('.stage-plan-item').last().getByRole('checkbox')
      await door.uncheck(); assert.equal(await door.isChecked(), false)
      await door.check()
      assert.equal(await page.getByRole('button', { name: '确认搭台', exact: true }).isEnabled(), true)
      if (extension === 'pdf') {
        for (const [name, width, height] of [['desktop', 1440, 900], ['ipad-portrait', 820, 1180], ['ipad-landscape', 1180, 820], ['iphone', 390, 844]]) {
          await page.setViewportSize({ width, height })
          await page.locator('.stage-script-dialog').evaluate(element => { element.scrollTop = 0 })
          await page.screenshot({ path: path.join(output, `plan-${name}.png`) })
          await page.locator('.stage-script-groups > section').evaluateAll(elements => elements.forEach(element => { element.scrollTop = 0 }))
          await page.locator('.stage-script-groups').evaluate(element => element.scrollIntoView({ block: 'start' }))
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          await page.screenshot({ path: path.join(output, `review-${name}.png`) })
        }
        await page.setViewportSize({ width: 1440, height: 900 })
      }
      checks.push(`${extension.toUpperCase()} produces three editable proposals with verified evidence, explicit defaults and selection switches`)
      await page.getByRole('button', { name: '确认搭台', exact: true }).click()
      await page.waitForURL('**/scene/**', { timeout: 60000 })
      const id = new URL(page.url()).pathname.split('/').at(-1); projects.push(id)
      const saved = await waitStored(id, graph => objects(graph).length === 3 && root(graph).metadata.diastageTheatre.importMetadata?.length === 1)
      const record = root(saved).metadata.diastageTheatre.importMetadata[0]
      assert.equal(record.file.type, extension)
      assert.ok(record.evidence.length > 0)
      assert.equal('fullText' in record, false)
      assert.equal('audio' in record, false)
      layouts.push(objects(saved).map(node => ({ kind: node.metadata.stageKind, position: node.position })).sort((a, b) => a.kind.localeCompare(b.kind)))
      await page.getByRole('button', { name: '舞台库', exact: true }).click()
      await page.locator('.stage-manual').getByRole('button', { name: '撤销', exact: true }).click()
      await waitStored(id, graph => objects(graph).length === 0 && !root(graph).metadata.diastageTheatre.importMetadata?.length)
      await page.locator('.stage-manual').getByRole('button', { name: '重做', exact: true }).click()
      await waitStored(id, graph => objects(graph).length === 3 && root(graph).metadata.diastageTheatre.importMetadata?.length === 1)
      await page.reload({ waitUntil: 'networkidle' })
      const reloaded = await waitStored(id, graph => objects(graph).length === 3)
      assert.deepEqual(objects(reloaded).map(node => node.id).sort(), objects(saved).map(node => node.id).sort())
      checks.push(`${extension.toUpperCase()} confirmed nodes and evidence persist together, undo/redo as one batch, and retain IDs after reload`)
    }
    assert.deepEqual(layouts[0], layouts[1])
    checks.push('PDF and DOCX produce identical deterministic three-item coordinates')
    const docxId = projects[1]
    const beforeMove = await waitStored(docxId, graph => objects(graph).length === 3)
    const sofa = objects(beforeMove).find(node => node.metadata.stageKind === 'sofa')
    await page.getByRole('button', { name: '舞台口令', exact: true }).click()
    await page.getByRole('textbox', { name: '舞台口令', exact: true }).fill('把沙发向台后移半米')
    await page.getByRole('button', { name: '生成舞台方案', exact: true }).click()
    await page.getByRole('button', { name: '确认搭台', exact: true }).click()
    await waitStored(docxId, graph => Math.abs(graph.nodes[sofa.id].position[2] - (sofa.position[2] - .5)) < 1e-6)
    checks.push('A command after DOCX import moves the same sofa ID and preserves the imported project')
    await open()
    await page.getByLabel('剧本文件', { exact: true }).setInputFiles(path.join(fixtures, 'stage-three-items.pdf'))
    await page.getByRole('button', { name: '提取舞台方案', exact: true }).click()
    await page.getByRole('heading', { name: '先看台位，再确认搭台', exact: true }).waitFor({ timeout: 65000 })
    await page.locator('.stage-plan-item').last().getByRole('checkbox').uncheck()
    await page.getByRole('button', { name: '确认搭台', exact: true }).click()
    await page.waitForURL('**/scene/**', { timeout: 60000 })
    const selectedId = new URL(page.url()).pathname.split('/').at(-1); projects.push(selectedId)
    const selected = await waitStored(selectedId, graph => objects(graph).length === 2 && root(graph).metadata.diastageTheatre.importMetadata?.length === 1)
    assert.deepEqual(objects(selected).map(node => node.metadata.stageKind).sort(), ['sofa', 'window-flat'])
    checks.push('Excluding the door before confirmation creates only the two selected PDF objects')
    for (const name of ['排演', '复台', '置景']) {
      const workspace = page.getByRole('navigation', { name: '工作区' }).getByRole('button', { name, exact: true })
      await workspace.click()
      await page.getByRole('navigation', { name: '工作区' }).getByRole('button', { name, exact: true, pressed: true }).waitFor()
      assert.equal(await workspace.getAttribute('aria-pressed'), 'true')
      const graph = await waitStored(selectedId, graph => objects(graph).length === 2)
      assert.deepEqual(graph, selected)
    }
    checks.push('Imported nodes and metadata survive switching SET to REHEARSE to REMOUNT and back')
    assert.deepEqual(errors, []); assert.deepEqual(failed, [])
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ projects, checks, errors, consoleErrors, httpErrors, failed, cancelledPrefetch }, null, 2))
    console.log(JSON.stringify({ projects, checks, errors, consoleErrors, httpErrors, failed, cancelledPrefetch }))
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ url: page.url(), checks, errors, consoleErrors, httpErrors, failed, cancelledPrefetch, error: String(error) }, null, 2))
    throw error
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
