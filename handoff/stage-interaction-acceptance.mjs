import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'
const base = 'http://127.0.0.1:4329'
const fixture = JSON.parse(readFileSync('work/DiaStage-current/.local/stage-interaction-fixture.json', 'utf8'))
const { id, graph } = fixture
assert.ok(id.startsWith('stage-interaction-qa-'), 'only the generated temporary fixture may be reset')
const current=await(await fetch(`${base}/api/scenes/${id}`)).json()
const reset=await fetch(`${base}/api/scenes/${id}`,{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({graph,expectedVersion:current.version})})
assert.ok(reset.ok,await reset.text())
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
const checks = [], errors = []
page.on('pageerror', e => errors.push(e.message))
const saved = async () => (await (await fetch(`${base}/api/scenes/${id}`)).json()).graph.nodes
const pause = () => page.waitForTimeout(1100)
const select = async asset => {
  const node = Object.values(graph.nodes).find(n => n.asset?.id === asset)
  await page.locator(`.dia-pinned-plan [data-proposal-id="${node.id}"] text`).click()
  await pause()
  return node
}
const project = async (axis, points) => page.evaluate(({ axis, points }) => {
  const s = window.__sceneProbe.getState(), rig = s.scene.getObjectByName('stage-transform-gizmo')
  const group = rig.children[['X','Y','Z'].indexOf(axis)]
  group.updateWorldMatrix(true, true)
  const rect = s.gl.domElement.getBoundingClientRect()
  return points.map(p => {
    const v = group.position.clone().set(...p).applyMatrix4(group.matrixWorld).project(s.camera)
    return { x: rect.x + (v.x + 1) * rect.width / 2, y: rect.y + (1 - v.y) * rect.height / 2 }
  })
}, { axis, points })
try {
  await page.goto(`${base}/scene/${id}?workspace=set`)
  await page.locator('.dia-stage-context > summary').click({ timeout: 120000 })
  await pause()
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
  const node = await select('SCN-RISER-02')
  await page.getByRole('button', { name: '移动', exact: true }).click()
  await pause()
  console.log('rig', await page.evaluate(() => window.__sceneProbe.getState().scene.getObjectByName('stage-transform-gizmo')?.children.map(g => ({ name:g.name, visible:g.visible, pos:g.position.toArray(),scale:g.scale.toArray() }))))
  for (const [index, axis] of ['X','Y','Z'].entries()) {
    const before = (await saved())[node.id]
    const [start, end] = await project(axis, [[0,0,0.85], [0,0,1.6]])
    console.log(axis, start, end)
    await page.mouse.move(start.x, start.y); await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 15 }); await pause()
    assert.deepEqual((await saved())[node.id], before, 'held drag stays transient')
    await page.mouse.up(); await pause()
    const after = (await saved())[node.id]
    console.log('move', axis, before.position, after.position)
    assert.notEqual(after.position[index], before.position[index], `${axis} moves`)
    for (const i of [0,1,2]) if (i !== index) assert.equal(after.position[i], before.position[i])
    await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Control+z'); await pause()
    assert.deepEqual((await saved())[node.id], before, 'one undo restores drag')
    await page.keyboard.press('Control+Shift+z'); await pause()
    assert.deepEqual((await saved())[node.id], after, 'redo restores drag')
    await page.keyboard.press('Control+z'); await pause()
    checks.push(`${axis} move/live/one undo/redo`)
  }
  await page.screenshot({ path: 'work/stage-interaction/move.png' })
  await page.getByRole('button', { name: '旋转', exact: true }).click()
  await pause()
  for (const [index, axis] of ['X','Y','Z'].entries()) {
    const before = (await saved())[node.id]
    const [start, end] = await project(axis, [[Math.cos(.7),Math.sin(.7),0], [Math.cos(1.3),Math.sin(1.3),0]])
    await page.mouse.move(start.x,start.y); await page.mouse.down()
    await page.mouse.move(end.x,end.y,{steps:20}); await pause()
    assert.deepEqual((await saved())[node.id],before,'rotation is live before release')
    await page.mouse.up();await pause()
    const after=(await saved())[node.id]
    console.log('rotate',axis,before.rotation,after.rotation)
    assert.notEqual(after.rotation[index],before.rotation[index],`${axis} rotates`)
    for (const i of [0,1,2]) if (i!==index) assert.equal(after.rotation[i],before.rotation[i],`${axis} isolates ${i}`)
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+z');await pause()
    assert.deepEqual((await saved())[node.id],before,'rotation undo')
    checks.push(`${axis} rotate/live/one undo`)
  }
  await page.screenshot({path:'work/stage-interaction/rotate.png'})
  const beforeCancel=(await saved())[node.id]
  const [cancelStart,cancelEnd]=await project('Y',[[Math.cos(.7),Math.sin(.7),0],[Math.cos(1.3),Math.sin(1.3),0]])
  await page.mouse.move(cancelStart.x,cancelStart.y);await page.mouse.down();await page.mouse.move(cancelEnd.x,cancelEnd.y,{steps:10})
  await page.keyboard.press('Escape');await page.mouse.up();await pause()
  assert.deepEqual((await saved())[node.id],beforeCancel,'I: Esc cancels without scene mutation')
  checks.push('I: Esc cancellation')
  await page.getByRole('button',{name:'选择',exact:true}).click()
  const projectWorld=async point=>page.evaluate(point=>{const s=window.__sceneProbe.getState(),rect=s.gl.domElement.getBoundingClientRect(),v=s.camera.position.clone().set(...point).project(s.camera);return{x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2}},point)
  let lastStacked
  for (const [asset, expected] of [['SCN-RISER-02',.15],['SCN-RISER-03',.3],['SCN-TABLE-120',.45],['SCN-CHAIR-045',1.2]]) {
    const before=await saved()
    await page.locator(`[data-stage-asset-id="${asset}"]`).dblclick()
    const drop=await projectWorld([-1.5,0,0])
    await page.mouse.move(drop.x,drop.y,{steps:15});await page.mouse.click(drop.x,drop.y);await pause()
    const after=await saved(), added=Object.values(after).find(n=>!before[n.id]&&n.asset?.id===asset)
    assert.ok(added,`${asset} added on support`)
    console.log('stack',asset,added.position,'height',added.asset.dimensions)
    assert.ok(Math.abs(added.position[1]-expected)<1e-7,`${asset} exact support contact`)
    lastStacked=added
    checks.push(`${asset} browser drop stack: ${added.position[1]}`)
  }
  await page.screenshot({path:'work/stage-interaction/stack.png'})
  await page.getByRole('button',{name:'移动',exact:true}).click();await pause()
  await page.locator('.stage-grid-controls > summary').click()
  await page.getByRole('button',{name:'特殊：自由放置',exact:true}).click()
  await page.locator('.stage-grid-controls > summary').click()
  const heightDrag=async delta=>{
    const scale=await page.evaluate(()=>window.__sceneProbe.getState().scene.getObjectByName('stage-transform-gizmo').children[1].scale.x)
    const [a,b]=await project('Y',[[0,0,.85],[0,0,.85+delta/scale]])
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up();await pause()
  }
  await heightDrag(.3)
  assert.ok(Math.abs((await saved())[lastStacked.id].position[1]-1.5)<1e-5,'Y lifts freely')
  await page.locator('.stage-grid-controls > summary').click()
  await page.getByRole('button',{name:'边缘与支撑面贴合：关闭',exact:true}).click()
  await page.locator('.stage-grid-controls > summary').click()
  await heightDrag(-.26)
  assert.ok(Math.abs((await saved())[lastStacked.id].position[1]-1.2)<1e-10,'magnetic Y saves exact table contact')
  checks.push('Y free lift and magnetic exact table contact')
  await page.getByRole('button',{name:'分屏',exact:true}).click();await pause()
  assert.ok(await page.evaluate(()=>window.__sceneProbe.getState().scene.getObjectByName('stage-transform-gizmo')),'split has gizmo')
  const splitBefore=(await saved())[lastStacked.id]
  const [sa,sb]=await project('X',[[0,0,.85],[0,0,1.2]])
  await page.mouse.move(sa.x,sa.y);await page.mouse.down();await page.mouse.move(sb.x,sb.y,{steps:10});await page.keyboard.press('Escape');await page.mouse.up();await pause()
  assert.deepEqual((await saved())[lastStacked.id],splitBefore,'split cancel')
  checks.push('split 3D gizmo/cancel')
  await page.screenshot({path:'work/stage-interaction/split.png'})
} catch(e) {
  await page.screenshot({ path: 'work/stage-interaction/failure.png' })
  console.error(e)
  process.exitCode = 1
} finally {
  writeFileSync('work/stage-interaction/results.json', JSON.stringify({ id, checks, errors },null,2))
  await browser.close()
}
