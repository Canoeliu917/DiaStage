import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = 'http://127.0.0.1:4332'
const result = { checks: [], pageerrors: [], finger: 'EMULATED_NOT_PHYSICAL', pencil: 'EMULATED_NOT_PHYSICAL' }
const check = (name) => { result.checks.push(name); console.log('PASS', name) }
async function json(url) { const response = await fetch(url); assert(response.ok, `${url}: ${response.status}`); return response.json() }
async function waitStored(predicate) { const deadline=Date.now()+15000; while(Date.now()<deadline) { await new Promise(r=>setTimeout(r,2000)); const scene=await stored(); if(predicate(scene))return scene } throw new Error('QA scene save did not reach the expected state') }
async function formalSnapshot() {
  const { scenes } = await json('http://127.0.0.1:4329/api/scenes')
  assert.equal(scenes.length, 3)
  return Promise.all(scenes.map(async ({ id, version }) => ({ id, version, hash: createHash('sha256').update(JSON.stringify(await json(`http://127.0.0.1:4329/api/scenes/${id}`))).digest('hex') })))
}
result.formalBefore = await formalSnapshot()
assert.deepEqual((await json(`${base}/api/scenes`)).scenes, [], 'Dedicated QA DB must start empty')
const { graph, ids } = JSON.parse(await readFile('.local/ipad-v2-fixture.json', 'utf8'))
const id = randomUUID()
const created = await fetch(`${base}/api/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ id, name: 'iPad V2 isolated QA', graph }) })
assert.equal(created.status, 201)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const stored = () => json(`${base}/api/scenes/${id}`)
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  page.on('pageerror', (error) => result.pageerrors.push(error.message))
  await page.goto(`${base}/scene/${id}?workspace=set`)
  await page.locator('.diastage-viewer-column canvas').first().waitFor({ timeout: 90000 })
  const panel = page.getByRole('complementary', { name: 'Dia 对话工作区' })
  await panel.locator('.dia-composer textarea').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('[aria-label="Dia 靠左"]').count(), 0)
  const initial = await stored()
  for (const [width, height] of [[1180, 820], [820, 1180]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(300)
    const dock = await panel.boundingBox()
    assert(Math.abs(dock.x + dock.width - (width - 8)) < 2)
    await panel.locator('textarea').fill('输入内容必须始终清晰可读')
    const style = await panel.locator('textarea').evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height }))
    assert(style.size >= 20 && style.height >= 112, JSON.stringify({width,height,style}))
    await page.screenshot({ path: `.local/ipad-v2-${width}.png` })
    await page.getByRole('button', { name: '收起 Dia 对话框', exact: true }).click()
    const edge = await page.locator('.dia-edge-tab').boundingBox()
    assert.equal(edge.width, 24); assert.equal(edge.height, 40)
    for (const name of ['三维', '平面', '分屏']) {
      const c = await page.getByRole('button', { name, exact: true }).boundingBox()
      assert(!(edge.x < c.x+c.width && edge.x+edge.width > c.x && edge.y < c.y+c.height && edge.y+edge.height > c.y))
    }
    await page.locator('.dia-edge-tab').click()
    check(`${width}x${height}: right-only dock, narrow edge handle, larger readable composer`)
  }
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.getByRole('button', { name: '收起 Dia 对话框', exact: true }).click()
  const separator = page.getByRole('separator', { name: '调整左侧栏宽度', exact: true })
  await separator.focus(); await separator.press('Home')
  assert.equal(await separator.getAttribute('aria-valuenow'), '120')
  const grid = await page.locator('.stage-grid-controls').boundingBox()
  const viewer = await page.locator('.diastage-viewer-column').boundingBox()
  assert(grid.y > viewer.y + viewer.height * 0.8 && grid.x < viewer.x + 150)
  check('sidebar shrinks toward left edge; grid/snap controls beside bottom-left compass')
  // Restore useful list width before selecting props.
  for (let n=0;n<8;n++) await separator.press('ArrowRight')
  assert.deepEqual(await stored(), initial, 'Layout changes make zero scene writes')
  const row = page.getByRole('row').filter({ hasText: 'QA chair' })
  await row.locator('.stage-overview-name').tap()
  await page.getByRole('button', { name: '旋转', exact: true }).tap()
  await page.locator('[data-rotation-axis="X"]').waitFor()
  await page.waitForTimeout(2000)
  const cdp = await context.newCDPSession(page)
  async function gesture(type, axis, cancel = false) {
    const control = page.locator(`[data-rotation-axis="${axis}"]`)
    const r = await control.boundingBox(), start = { x: r.x+r.width/2, y: r.y+r.height/2 }
    assert(await control.evaluate((el) => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }), `${type} ${axis}: control is obscured`)
    const end = { x: start.x+65, y: start.y }
    if(type === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    else await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button:'left', buttons:1, pointerType:'pen', clickCount:1 })
    await page.waitForFunction((axis)=>document.querySelector(`[data-rotation-axis="${axis}"]`)?.getAttribute('aria-pressed') === 'true', axis, {timeout:2000})
    for (const other of ['X','Y','Z'].filter((a)=>a!==axis)) assert(await page.locator(`[data-rotation-axis="${other}"]`).isDisabled())
    if(type === 'touch') await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[end] })
    else await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', ...end, button:'left',buttons:1,pointerType:'pen' })
    await page.waitForTimeout(100)
    if(type === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints:[] })
    else await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', ...end, button:'left',buttons:0,pointerType:'pen',clickCount:1 })
  }
  const boxes = await page.locator('[data-rotation-axis]').evaluateAll((els) => els.map((el)=>{const r=el.getBoundingClientRect();return {x:r.x,width:r.width}}))
  for(let n=1;n<boxes.length;n++) assert(boxes[n].x >= boxes[n-1].x+boxes[n-1].width+8)
  for (const type of ['touch', 'pen']) {
    for (const [axisIndex, axis] of ['X','Y','Z'].entries()) for(let n=0;n<3;n++) {
      const before = await stored()
      await gesture(type, axis)
      const after = await waitStored(s=>s.graph.nodes[ids['QA chair']].rotation[axisIndex] !== before.graph.nodes[ids['QA chair']].rotation[axisIndex]), a=after.graph.nodes[ids['QA chair']], b=before.graph.nodes[ids['QA chair']]
      for(let k=0;k<3;k++) assert(Math.abs(a.rotation[k]-b.rotation[k]-(k===axisIndex?Math.PI/6:0)) < 1e-6, JSON.stringify({type,axis,n,before:b.rotation,after:a.rotation}))
      assert.equal(after.version, before.version+1)
      await page.locator('button.studio-history-action[aria-label="撤销"]').click()
      await waitStored(s=>s.version>after.version)
      assert.deepEqual((await stored()).graph.nodes[ids['QA chair']], b)
      if(axisIndex===0 && n===0) {
        await page.locator('button.studio-history-action[aria-label="重做"]').click()
        await waitStored(s=>s.graph.nodes[ids['QA chair']].rotation[axisIndex] === a.rotation[axisIndex])
        assert.deepEqual((await stored()).graph.nodes[ids['QA chair']],a)
        await page.locator('button.studio-history-action[aria-label="撤销"]').click()
        await waitStored(s=>s.graph.nodes[ids['QA chair']].rotation[axisIndex] === b.rotation[axisIndex])
        check(`emulated ${type}: Redo restores the exact accepted pose`)
      }
      // Mouse clicks switch geometry; restore contact pointer before the next fixed-control gesture.
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerover',{pointerType:'touch'})))
      await row.locator('.stage-overview-name').tap()
    }
    check(`emulated ${type}: nine single-axis 30-degree rotations, one save per drag, Undo restores`)
  }
  const beforeCancel = await stored()
  await gesture('touch', 'X', true); await page.waitForTimeout(700)
  assert.deepEqual(await stored(), beforeCancel)
  check('touch cancel makes zero Scene writes')
  await page.getByRole('button',{name:'锁定舞台视角',exact:true}).tap()
  assert.equal(await page.getByRole('button',{name:'锁定舞台视角',exact:true}).getAttribute('aria-pressed'),'true')
  check('explicit stage camera lock is reachable')
  await page.screenshot({path:'.local/ipad-v2-controls.png'})
  await context.close()
  const desktop = await browser.newContext({viewport:{width:1440,height:900},hasTouch:false})
  const dp = await desktop.newPage(); dp.on('pageerror',(e)=>result.pageerrors.push(e.message))
  await dp.goto(`${base}/scene/${id}?workspace=set`)
  await dp.locator('.diastage-viewer-column canvas').first().waitFor({timeout:90000})
  await dp.getByRole('button',{name:'收起 Dia 对话框',exact:true}).click()
  await dp.getByRole('row').filter({hasText:'QA chair'}).locator('.stage-overview-name').click()
  await dp.getByRole('button',{name:'旋转',exact:true}).click()
  assert.equal(await dp.locator('[data-rotation-axis]').count(),0)
  check('Desktop retains 3D rings; no fixed touch controls')
  await desktop.close()
  assert.deepEqual(result.pageerrors,[])
} catch(error) { result.error = String(error); console.error(result.error); process.exitCode=1 }
finally {
  await browser.close()
  const removed=await fetch(`${base}/api/scenes/${id}`,{method:'DELETE',headers:{Origin:base}})
  assert(removed.ok); result.deletedQaId=id
  result.formalAfter=await formalSnapshot()
  assert.deepEqual(result.formalAfter,result.formalBefore)
  await writeFile('.local/ipad-v2-browser-results.json',JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
}
