import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = 'http://127.0.0.1:4332'
const result = { physicalIpad: 'NOT_RUN', physicalPencil: 'NOT_RUN', checks: [], pageerrors: [] }
const json = async (url) => {
  const response = await fetch(url)
  assert.ok(response.ok, `${url}: ${response.status}`)
  return response.json()
}
async function formalSnapshot() {
  const { scenes } = await json('http://127.0.0.1:4329/api/scenes')
  assert.equal(scenes.length, 3)
  return Promise.all(scenes.map(async ({ id, version }) => ({
    id, version, hash: createHash('sha256').update(JSON.stringify(await json(`http://127.0.0.1:4329/api/scenes/${id}`))).digest('hex'),
  })))
}
assert.deepEqual((await json(`${base}/api/scenes`)).scenes, [], 'Only an empty, dedicated QA database')
result.formalBefore = await formalSnapshot()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let sceneId
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  page.on('pageerror', (error) => result.pageerrors.push(error.message))
  await page.goto(`${base}/?entry=manual`)
  const created = page.waitForResponse((r) => r.url() === `${base}/api/scenes` && r.request().method() === 'POST')
  await page.getByRole('button', { name: '建立舞台', exact: true }).click()
  const creation = await created
  assert.ok(creation.ok())
  sceneId = (await creation.json()).id
  await page.waitForURL(`**/scene/${sceneId}**`)
  await page.locator('.diastage-viewer-column canvas').first().waitFor()
  const panel = page.getByRole('complementary', { name: 'Dia 对话工作区' })
  await panel.locator('[aria-label="Dia 靠左"]').waitFor()
  await page.waitForTimeout(1200)
  const initialScene = await json(`${base}/api/scenes/${sceneId}`)
  const mutations = []
  page.on('request', (request) => {
    if (/\/api\/scenes\//.test(request.url()) && ['POST','PUT','PATCH','DELETE'].includes(request.method()))
      mutations.push({ method: request.method(), url: request.url() })
  })
  const record = (name) => { result.checks.push({ name, status: 'PASS' }); console.log('PASS', name) }
  const edge = page.locator('.dia-edge-tab')
  async function edgeLegal() {
    const rect = await edge.boundingBox()
    assert.ok(rect)
    const viewport = page.viewportSize()
    assert.equal(rect.width, 48)
    assert.equal(rect.height, 48)
    assert(Math.abs(rect.x + rect.width - (viewport.width - 8)) < 1)
    assert(rect.y >= 8 && rect.y + rect.height <= viewport.height - 8)
    const controls = await page.locator('[aria-label="三维"],[aria-label="平面"],[aria-label="分屏"],[aria-label="视口布局"]').evaluateAll((els) =>
      els.map((el) => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height } }))
    for (const c of controls) if (c.width && c.height)
      assert(!(rect.x < c.x+c.width && rect.x+rect.width > c.x && rect.y < c.y+c.height && rect.y+rect.height > c.y))
    return rect
  }
  const cdp = await context.newCDPSession(page)
  async function drag(type, dx, dy) {
    const before = await edgeLegal()
    const start = { x: before.x+24, y: before.y+24 }
    if (type === 'touch') {
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[start] })
      for (let i=1;i<=5;i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:start.x+dx*i/5,y:start.y+dy*i/5}] })
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] })
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', ...start, button:'left',buttons:1,pointerType:'pen',clickCount:1 })
      for (let i=1;i<=5;i++) await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved',x:start.x+dx*i/5,y:start.y+dy*i/5,button:'left',buttons:1,pointerType:'pen' })
      await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased',x:start.x+dx,y:start.y+dy,button:'left',buttons:0,pointerType:'pen',clickCount:1 })
    }
    const after = await edgeLegal()
    assert.equal(before.x, after.x)
  }
  for (const [width,height] of [[1180,820],[820,1180]]) {
    await page.setViewportSize({width,height})
    if (await edge.isVisible()) await edge.click()
    let rect = await panel.boundingBox()
    assert(Math.abs(rect.x+rect.width-(width-8))<1)
    record(`${width}x${height}: expanded right dock`)
    await page.getByRole('button',{name:'Dia 靠左',exact:true}).click()
    assert.equal((await panel.boundingBox()).x,8)
    await page.getByRole('button',{name:'Dia 靠右',exact:true}).click()
    assert(Math.abs((await panel.boundingBox()).x+(await panel.boundingBox()).width-(width-8))<1)
    record(`${width}x${height}: explicit left/right docking`)
    assert.equal(await panel.locator('.dia-panel').evaluate(el=>getComputedStyle(el).display),'flex')
    const dialogue = await panel.locator('.dia-dialogue').boundingBox()
    const dockRect = await panel.boundingBox()
    assert(dialogue.width > dockRect.width - 4, 'narrow edge dock must not retain the old two-column bottom-sheet layout')
    const composer = await panel.locator('.dia-composer').boundingBox()
    assert(composer.y+composer.height <= dockRect.y+dockRect.height+1, 'composer remains inside the dock')
    await page.screenshot({path:`.local/touch-polish-${width}-expanded.png`})
    await page.getByRole('button',{name:'收起 Dia 对话框',exact:true}).click()
    await edgeLegal()
    await page.evaluate(() => {
      window.__touchQaCanvasDowns=0
      document.querySelectorAll('canvas').forEach((canvas)=>canvas.addEventListener('pointerdown',()=>window.__touchQaCanvasDowns++))
    })
    for(const type of ['touch','pen']) {
      for(const dy of [-100,80,120,-150,60]) await drag(type,-30,dy)
      assert.equal(await page.evaluate(()=>window.__touchQaCanvasDowns),0)
      record(`${width}x${height}: ${type} 5 vertical drags, fixed X, zero canvas pointerdown`)
    }
    // Real layout control rectangle moved into the edge lane to exercise the exclusion policy.
    const control = page.locator('[aria-label="三维"]').first()
    await control.evaluate((el)=> { el.dataset.qaStyle=el.getAttribute('style')??''; el.style.cssText='position:fixed;right:8px;top:16px;width:140px;height:44px;z-index:120' })
    const current = await edge.boundingBox()
    await drag('touch',0,40-current.y)
    await edgeLegal()
    record(`${width}x${height}: measured control exclusion on drag`)
    await control.evaluate((el)=> { el.setAttribute('style',el.dataset.qaStyle); delete el.dataset.qaStyle })
    await edge.click()
    await panel.waitFor()
    record(`${width}x${height}: expand after drag`)
    await page.getByRole('button',{name:'收起 Dia 对话框',exact:true}).click()
    await page.screenshot({path:`.local/touch-polish-${width}-collapsed.png`})
  }
  // Synthetic VisualViewport event: geometry regression, not a physical iOS keyboard test.
  await edge.click()
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport,'height',{configurable:true,value:400})
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(50)
  assert((await panel.boundingBox()).y+(await panel.boundingBox()).height<=400)
  await page.getByRole('button',{name:'收起 Dia 对话框',exact:true}).click()
  assert((await edge.boundingBox()).y+48<=392)
  record('VisualViewport keyboard-height clamp')
  const finalScene = await json(`${base}/api/scenes/${sceneId}`)
  assert.deepEqual(finalScene, initialScene)
  assert.deepEqual(mutations,[])
  record('dock/collapse/drag/expand: zero scene API mutations; exact scene unchanged')
  await page.screenshot({path:'.local/touch-polish-portrait.png'})
  await context.close()

  const desktop = await browser.newContext({ viewport:{width:1440,height:900},hasTouch:false })
  const desktopPage = await desktop.newPage()
  desktopPage.on('pageerror',(error)=>result.pageerrors.push(error.message))
  await desktopPage.goto(`${base}/scene/${sceneId}?workspace=set`)
  await desktopPage.locator('.dia-resizable-dock').waitFor()
  const style = await desktopPage.locator('.dia-resizable-dock').evaluate((el)=>({
    position:getComputedStyle(el).position,width:el.getBoundingClientRect().width,touch:el.hasAttribute('data-touch-dock'),
  }))
  assert.deepEqual(style,{position:'relative',width:370,touch:false})
  await desktopPage.getByRole('button',{name:'收起 Dia 对话框',exact:true}).click()
  assert.equal(await desktopPage.locator('.dia-edge-tab').count(),0)
  await desktopPage.getByRole('button',{name:'展开 Dia 对话框',exact:true}).click()
  record('Desktop 370px relative dock and original restore control retained')
  await desktop.close()
  assert.deepEqual(result.pageerrors,[])
} catch(error) {
  result.error=error.message
  process.exitCode=1
} finally {
  await browser.close()
  if(sceneId) {
    const removed=await fetch(`${base}/api/scenes/${sceneId}`,{method:'DELETE'})
    assert.ok(removed.ok)
    result.deletedQaId=sceneId
  }
  result.formalAfter=await formalSnapshot()
  result.formalUnchanged=JSON.stringify(result.formalBefore)===JSON.stringify(result.formalAfter)
  await writeFile('.local/touch-polish-browser-results.json',JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
  assert.equal(result.formalUnchanged,true)
}
