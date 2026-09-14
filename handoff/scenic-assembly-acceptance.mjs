import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../browser/node_modules/playwright/index.mjs'
const base='http://127.0.0.1:4329',id=`scenic-assembly-qa-${Date.now()}`
const {graph,ids}=JSON.parse(readFileSync('work/DiaStage-current/.local/scenic-fixture.json','utf8'))
const response=await fetch(`${base}/api/scenes`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({id,name:'Scenic Assembly QA',graph})});assert.ok(response.ok,await response.text())
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1800,height:1100}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
const pause=()=>page.waitForTimeout(1300)
const saved=async()=>(await(await fetch(`${base}/api/scenes/${id}`)).json()).graph.nodes
const select=async key=>{await page.locator(`.dia-pinned-plan [data-proposal-id="${ids[key]}"] text`).click();await pause()}
try{
await page.goto(`${base}/scene/${id}?workspace=set`)
await page.locator('.dia-stage-context > summary').click({timeout:120000});await pause()
await select('tri')
console.log('handles',await page.locator('[data-fold-corner]').evaluateAll(es=>es.map(e=>({tag:e.tagName,corner:e.getAttribute('data-fold-corner'),rect:JSON.stringify(e.getBoundingClientRect())}))))
await page.screenshot({path:'work/DiaStage-current/.local/scenic-initial.png'})
// Pointer drag in the actual plan; choose a quarter-turn around the preceding authored hinge.
for(const [key,position]of [['bi',0],['tri',0],['tri',1]]){
 await select(key)
 const handle=page.locator(`.dia-pinned-plan [data-stage-fold-plan] [data-fold-position="${position}"]`)
 const before=(await saved())[ids[key]]
 const box=await handle.boundingBox();assert.ok(box);console.log('start',key,position,box,await handle.getAttribute('aria-valuenow'));await page.screenshot({path:`work/DiaStage-current/.local/scenic-${key}-${position}.png`})
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down()
 await page.mouse.move(box.x+box.width/2+(position===1?-25:30),box.y+box.height/2+(position===1?25:-25),{steps:20});await pause()
 console.log('live',await handle.getAttribute('aria-valuenow'));assert.deepEqual((await saved())[ids[key]],before,'held gesture is transient')
 await page.mouse.up();await pause()
 const after=(await saved())[ids[key]];console.log('fold',key,position,after.controls)
 assert.notEqual(after.controls?.[`fold_angle_${position+1}_deg`],before.controls?.[`fold_angle_${position+1}_deg`]??90)
 assert.deepEqual([after.position,after.rotation,after.scale],[before.position,before.rotation,before.scale])
 const other=position===0?1:0;assert.equal(after.controls?.[`fold_angle_${other+1}_deg`]??90,before.controls?.[`fold_angle_${other+1}_deg`]??90)
 await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+z');await pause();assert.deepEqual((await saved())[ids[key]],before)
 await page.keyboard.press('Control+Shift+z');await pause();assert.deepEqual((await saved())[ids[key]],after)
 checks.push(`${key} hinge ${position+1}: pointer drag, independent XYZ, one undo and redo`)
}
await page.screenshot({path:'work/DiaStage-current/.local/scenic-fold.png'})

await select('bi')
const beforeCancel=(await saved())[ids.bi], h=page.locator('.dia-pinned-plan [data-stage-fold-plan] [data-fold-position="0"]'), hb=await h.boundingBox()
await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+40,hb.y+20,{steps:12});await page.keyboard.press('Escape');await page.mouse.up();await pause()
assert.deepEqual((await saved())[ids.bi],beforeCancel);checks.push('Esc cancels articulation without saving')
await page.locator('.stage-grid-controls > summary').click()
await page.getByRole('button',{name:'边缘与支撑面贴合：关闭',exact:true}).click()
await page.locator('.stage-grid-controls > summary').click()
const movePlan=async(key,x,z)=>{
 const before=(await saved())[ids[key]]
 const label=page.locator(`.dia-pinned-plan [data-proposal-id="${ids[key]}"] text`)
 const box=await label.boundingBox(), matrix=await label.evaluate(e=>{const m=e.ownerSVGElement.getScreenCTM();return{a:m.a,b:m.b,c:m.c,d:m.d}})
 const dx=x-before.position[0],dz=z-before.position[2],sx=box.x+box.width/2,sy=box.y+box.height/2
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+matrix.a*dx+matrix.c*dz,sy+matrix.b*dx+matrix.d*dz,{steps:20});await pause();await page.mouse.up();await pause()
 const after=(await saved())[ids[key]];console.log('assembled',key,after.position);return after
}
let placed=await movePlan('wall-b',-.54,0)
assert.ok(Math.abs(placed.position[0]+.6)<1e-6,'single flats meet without gap')
checks.push('single-flat collinear wall, exact surface contact')
await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+z');await pause()
placed=await movePlan('wall-c',-.97,.4)
assert.ok(Math.abs(placed.position[0]+1.03)<1e-6,'right U corner contact')
checks.push('two single flats form L, exact 90 degree surface contact')
placed=await movePlan('wall-d',-2.03,.4)
assert.ok(Math.abs(placed.position[0]+1.97)<1e-6,'left U corner contact')
checks.push('three single flats form U enclosure with two 90 degree surface joints')
const folded=(await saved())[ids.tri]
const foldedMin=folded.asset.boundsCenter[0]-folded.asset.dimensions[0]/2
placed=await movePlan('tri',.45-foldedMin+.06,0)
assert.ok(Math.abs(placed.position[0]+foldedMin-.45)<1e-6,'folded tri uses its updated edge')
assert.deepEqual(placed.controls,folded.controls)
checks.push('folded tri-flat connects to a single-flat using its updated edges')
await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+z');await pause();assert.deepEqual((await saved())[ids.tri],folded)
placed=await movePlan('window',1.16,0)
assert.ok(Math.abs(placed.position[0]-1.1)<1e-6,'window-flat exact contact')
checks.push('window-flat and single-flat exact contact')
await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+z');await pause()
placed=await movePlan('door',1.16,0)
assert.ok(Math.abs(placed.position[0]-1.1)<1e-6,'door-flat edge contacts single flat')
checks.push('door-flat and single-flat contact')
await page.screenshot({path:'work/DiaStage-current/.local/scenic-assembly.png'})
await select('bi')
const freeBefore=(await saved())[ids.bi],freeHandle=page.locator('.dia-pinned-plan [data-fold-position="0"]'),freeBox=await freeHandle.boundingBox()
const snapMode=await page.locator('.stage-grid-controls > summary').innerText()
await page.mouse.move(freeBox.x+freeBox.width/2,freeBox.y+freeBox.height/2);await page.mouse.down();await page.keyboard.down('Shift');await page.mouse.move(freeBox.x+freeBox.width/2+8,freeBox.y+freeBox.height/2-4,{steps:10});await page.mouse.up();await page.keyboard.up('Shift');await pause()
const freeAfter=(await saved())[ids.bi];assert.notEqual(freeAfter.controls.fold_angle_1_deg,freeBefore.controls.fold_angle_1_deg);assert.ok(Math.abs(freeAfter.controls.fold_angle_1_deg/15-Math.round(freeAfter.controls.fold_angle_1_deg/15))>1e-4);assert.equal(await page.locator('.stage-grid-controls > summary').innerText(),snapMode)
checks.push('Shift free articulation preserves exact fractional angle and placement snap mode')
const before3d=(await saved())[ids.bi],button=page.locator('button[data-fold-corner="2"]'),bb=await button.boundingBox()
await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.mouse.move(bb.x+60,bb.y+5,{steps:15});await page.mouse.up();await pause()
assert.notEqual((await saved())[ids.bi].controls.fold_angle_1_deg,before3d.controls.fold_angle_1_deg)
checks.push('3D fold handle pointer drag')
await page.getByRole('button',{name:'分屏',exact:true}).click();await pause()
await select('tri')
const splitBefore=(await saved())[ids.tri],splitHandle=page.locator('button[data-fold-corner="3"]'),sb=await splitHandle.boundingBox()
await page.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2);await page.mouse.down();await page.mouse.move(sb.x+60,sb.y+10,{steps:20});await page.mouse.up();await pause()
const splitAfter=(await saved())[ids.tri];console.log('split-fold',splitBefore.controls,splitAfter.controls)
assert.notEqual(splitAfter.controls.fold_angle_2_deg,splitBefore.controls.fold_angle_2_deg)
assert.equal(splitAfter.controls.fold_angle_1_deg,splitBefore.controls.fold_angle_1_deg)
assert.deepEqual([splitAfter.position,splitAfter.rotation],[splitBefore.position,splitBefore.rotation])
checks.push('split-view 3D hinge pointer drag keeps whole transform and other hinge')
await page.screenshot({path:'work/DiaStage-current/.local/scenic-split.png'})
assert.deepEqual(errors,[],'pageerror must be zero')
checks.push('pageerror = 0')
writeFileSync('work/DiaStage-current/.local/scenic-browser.json',JSON.stringify({checks,errors},null,2))
console.log(JSON.stringify({checks,errors}))
}finally{await browser.close();const removed=await fetch(`${base}/api/scenes/${id}`,{method:'DELETE',headers:{Origin:base}});assert.ok(removed.ok,'temporary QA cleanup')}
