import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'
const base='http://127.0.0.1:4329'
const {id,graph}=JSON.parse(readFileSync('work/DiaStage-current/.local/stage-interaction-fixture.json','utf8'))
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1820,height:1100}})
const node=Object.values(graph.nodes).find(n=>n.asset?.id==='SCN-RISER-03')
const saved=async()=>(await(await fetch(`${base}/api/scenes/${id}`)).json()).graph.nodes
try {
  await page.goto(`${base}/scene/${id}`)
  await page.locator('.dia-stage-context > summary').click({timeout:120000})
  await page.locator(`.dia-pinned-plan [data-proposal-id="${node.id}"] text`).click()
  await page.getByRole('button',{name:'移动',exact:true}).click()
  const row=page.locator('.stage-overview').getByRole('row').filter({hasText:node.name}).first()
  await row.getByRole('button',{name:`固定${node.name}`,exact:true}).click()
  await page.waitForTimeout(1200)
  assert.equal((await saved())[node.id].metadata.stageLocked,true)
  assert.equal(await page.getByRole('button',{name:'移动',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'旋转',exact:true}).isDisabled(),true)
  await row.getByRole('button',{name:`解锁${node.name}`,exact:true}).click()
  await page.getByRole('button',{name:'选择',exact:true}).click()
  // Drop into the plan view, exercising the same support policy through its other UI entry.
  await page.getByRole('button',{name:'平面',exact:true}).click()
  await page.waitForTimeout(1000)
  const before=await saved()
  await page.getByRole('button',{name:'资产',exact:true}).click()
  await page.locator('[data-stage-asset-id="SCN-CHAIR-045"]').dblclick()
  const floor=page.locator('[data-stage-placement-surface="true"]')
  const point=await floor.evaluate(el=>{
    const svg=el.ownerSVGElement,p=svg.createSVGPoint();p.x=1.5;p.y=0
    const screen=p.matrixTransform(el.getScreenCTM());return{x:screen.x,y:screen.y}
  })
  await page.mouse.move(point.x,point.y);await page.mouse.click(point.x,point.y);await page.waitForTimeout(1200)
  const added=Object.values(await saved()).find(n=>!before[n.id]&&n.asset?.id==='SCN-CHAIR-045')
  assert.ok(added)
  assert.ok(Math.abs(added.position[1]-.15)<1e-10,JSON.stringify(added.position))
  await page.screenshot({path:'work/stage-interaction/chair-platform-plan.png'})
  writeFileSync('work/stage-interaction/extra-results.json',JSON.stringify({lock:'PASS',unlock:'PASS',chairOnPlatformViaPlan:'PASS',position:added.position},null,2))
  console.log('PASS: lock / unlock / chair on platform in plan view')
} finally { await browser.close() }
