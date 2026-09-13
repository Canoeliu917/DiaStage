import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { instrumentResources } from './internal-device-resources.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local synthetic database');
const out = '.impeccable/review/internal-device';
await mkdir(out, { recursive: true });
const phase = process.argv[2] || 'matrix';
const result = { phase, synthetic: true, viewportEvidence: 'SIMULATION', realModel: 'NOT_RUN', realIphone: 'NOT_RUN', realIpad: 'NOT_RUN', realAndroid: 'NOT_RUN', errors: [], requestFailures: [], checks: [], matrix: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['microphone'] });
await owner.addInitScript(instrumentResources);
await mobile.addInitScript(instrumentResources);
const page = await owner.newPage(), phone = await mobile.newPage();
for (const p of [page, phone]) { p.setDefaultTimeout(30000); p.on('pageerror', error => result.errors.push({page:p===page?'owner':'phone',message:error.message,stack:error.stack})); p.on('requestfailed', r=>result.requestFailures.push({page:p===page?'owner':'phone',path:new URL(r.url()).pathname,error:r.failure()?.errorText})); }
const panel = page.getByRole('region', { name: 'Dia 排演对话', exact: true });
const state = value => page.locator(`[data-dia-state="${value}"]`).waitFor();
const send = async text => { await panel.getByRole('textbox', { name: '你想试什么？', exact: true }).fill(text); await panel.getByRole('button', { name: '发送', exact: true }).click(); await state('proposal-ready'); };
const check = async (name, action) => {
  try { const evidence = await action(); result.checks.push({ name, status: 'PASS', evidence }); console.log('PASS', name); }
  catch (error) { result.checks.push({ name, status: 'FAIL', reason: error.message }); console.log('FAIL', name, error.message); }
};
const rect = locator => locator.first().boundingBox();
const visible = (box, width, height) => box && box.width > 0 && box.height > 0 && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1;
async function reachable(locator, p) {
  await locator.first().evaluate(e => e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const box = await rect(locator), viewport = p.viewportSize();
  assert.ok(visible(box, viewport.width, viewport.height), `unreachable ${JSON.stringify(box)} within ${JSON.stringify(viewport)}`);
  return box;
}
const matrix = [
  ['phone',360,800],['phone',375,812],['phone',390,844],['phone',393,852],['phone',430,932],
  ['phone',800,360],['phone',812,375],['phone',844,390],['phone',932,430],
  ['tablet',768,1024],['tablet',820,1180],['tablet',834,1194],['tablet',1024,1366],
  ['tablet',1024,768],['tablet',1180,820],['tablet',1194,834],['tablet',1366,1024],
  ['desktop',1280,720],['desktop',1366,768],['desktop',1440,900],['desktop',1440,1000],['desktop',1920,1080],
];
let sceneId;
const scene = async () => { const response=await owner.request.get(`${base}/api/scenes/${sceneId}`);assert.ok(response.ok(),`Scene read ${response.status()}: ${await response.text()}`);return (await response.json()).graph; };
const log = () => page.evaluate(async id => {
  const db = await new Promise((resolve,reject) => { const r=indexedDB.open('diastage-rehearsal-feedback');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
  const get = name => new Promise((resolve,reject) => { const r=db.transaction(name).objectStore(name).index('sceneId').getAll(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
  const [threads, interactions, events] = await Promise.all(['threads','interactions','events'].map(get)); db.close(); return {threads,interactions,events};
}, sceneId);
try {
  const firstRender = performance.now();
  await page.goto(base + '/demo', { waitUntil:'domcontentloaded' });
  await page.waitForURL(/\/scene\//);
  sceneId = new URL(page.url()).pathname.split('/').at(-1);
  await panel.getByRole('textbox', {name:'你想试什么？',exact:true}).waitFor();
  result.conversationFirstRenderMs = Math.round(performance.now()-firstRender);
  const firstScene = page.url();
  await send('给我两个排法');
  await panel.getByText('连接手机舞台助手',{exact:true}).click();
  await panel.getByRole('button',{name:'生成配对码',exact:true}).click();
  const code = (await panel.locator('.phone-voice-link__code').innerText()).replace(/[^A-Z0-9]/g,'');
  await phone.goto(base+'/remote-voice',{waitUntil:'networkidle'});
  await phone.getByLabel('8 位配对码',{exact:true}).fill(code);
  await phone.getByRole('button',{name:'连接舞台',exact:true}).click();
  await phone.getByRole('button',{name:'预演到舞台',exact:true}).first().waitFor();
  console.log('paired synthetic scene');
  if (phase === 'matrix') {
    for (const [device,width,height] of matrix) {
      const p = device==='phone' ? phone : page;
      await p.setViewportSize({width,height});
      if(device!=='phone' && !await panel.isVisible()) await page.getByRole('button',{name:'告诉 Dia',exact:true}).click();
      await p.waitForTimeout(250);
      const entry = { device, width, height, orientation:width>height?'landscape':'portrait', status:'PASS', boxes:{}, issues:[] };
      const input = device==='phone' ? phone.getByLabel('你想试什么？',{exact:true}) : panel.getByRole('textbox',{name:'你想试什么？',exact:true});
      const sendButton = device==='phone' ? phone.getByRole('button',{name:'发送给 Dia',exact:true}) : panel.getByRole('button',{name:'发送',exact:true});
      const preview = device==='phone' ? phone.getByRole('button',{name:'预演到舞台',exact:true}) : panel.getByRole('button',{name:'在舞台上试试',exact:true});
      await p.evaluate(()=>window.scrollTo(0,0));
      entry.boxes.firstInput = await rect(input); entry.boxes.firstSend = await rect(sendButton); entry.boxes.firstPreview = await rect(preview);
      entry.firstScreen = { input:visible(entry.boxes.firstInput,width,height),send:visible(entry.boxes.firstSend,width,height),preview:visible(entry.boxes.firstPreview,width,height) };
      if(width===390 && height===844 && (!entry.firstScreen.input || !entry.firstScreen.send || !entry.firstScreen.preview)) entry.issues.push('Phone primary controls below first viewport');
      for(const [name,control] of [['input',input],['send',sendButton],['preview',preview]]) {
        try { entry.boxes[name] = await reachable(control,p); } catch(error) {entry.issues.push(`${name}: ${error.message}`);}
      }
      entry.overflow = await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      if(entry.overflow.scrollWidth>width+1) entry.issues.push('horizontal overflow');
      if(device!=='phone') {
        entry.boxes.stage = await rect(page.locator('.diastage-viewer-column'));
        if(!entry.boxes.stage || entry.boxes.stage.width<500 || entry.boxes.stage.height<150) entry.issues.push('Stage smaller than internal 500x150 minimum');
      }
      const scope = device==='phone' ? '.mobile-dia' : '.dia-panel';
      entry.touchTargets = await p.locator(`${scope} button,${scope} select,${scope} summary`).evaluateAll(elements=>elements.filter(e=>e.checkVisibility()).map(e=>({name:e.textContent.trim().slice(0,40),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<44||e.height<44));
      if(entry.touchTargets.length)entry.issues.push('touch targets below 44x44');
      entry.cardOverflow = await p.locator(`${scope} article,${scope} textarea`).evaluateAll(elements=>elements.filter(e=>e.checkVisibility()).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className));
      if(entry.cardOverflow.length)entry.issues.push('card or textarea overflow');
      await p.evaluate(()=>window.scrollTo(0,0));
      entry.screenshot = `${out}/${device}-${width}x${height}.png`;
      await p.screenshot({path:entry.screenshot});
      entry.status=entry.issues.length?'FAIL':'PASS';result.matrix.push(entry);console.log(entry.status,device,width,height,entry.issues.join('; '));
    }
    await check('soft keyboard simulation retains text and reachable Send',async()=>{
      await phone.setViewportSize({width:390,height:844});const input=phone.getByLabel('你想试什么？',{exact:true});await input.fill('软键盘模拟：这段文字不能丢');await input.focus();await phone.setViewportSize({width:390,height:500});await reachable(input,phone);const sendBox=await reachable(phone.getByRole('button',{name:'发送给 Dia',exact:true}),phone);assert.equal(await input.inputValue(),'软键盘模拟：这段文字不能丢');await phone.screenshot({path:`${out}/soft-keyboard-simulation.png`});return {kind:'SIMULATION',sendBox};
    });
    await check('phone orientation retains draft and selection',async()=>{
      const selected=await phone.locator('article[data-selected=true] h3').innerText();
      for(const size of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]) {await phone.setViewportSize(size);await reachable(phone.getByRole('button',{name:'发送给 Dia',exact:true}),phone);assert.equal(await phone.getByLabel('你想试什么？',{exact:true}).inputValue(),'软键盘模拟：这段文字不能丢');assert.equal(await phone.locator('article[data-selected=true] h3').innerText(),selected);} return {kind:'SIMULATION'};
    });
    await check('tablet single-side priority and layout restoration',async()=>{
      await page.setViewportSize({width:1024,height:768});await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await panel.waitFor({state:'hidden'});await page.getByRole('button',{name:'告诉 Dia',exact:true}).click();await panel.waitFor();await page.getByRole('button',{name:'展开侧栏',exact:true}).waitFor();assert.ok((await rect(page.locator('.diastage-viewer-column'))).width>=500);return {kind:'SIMULATION'};
    });
    await page.setViewportSize({width:1440,height:1000});
    await panel.getByRole('button',{name:'在舞台上试试',exact:true}).first().click();await state('waiting-human');
    await phone.getByRole('button',{name:'停止预演',exact:true}).waitFor();
    for(const [device,width,height] of matrix) await check(`Ghost controls ${device} ${width}x${height}`,async()=>{
      const p=device==='phone'?phone:page;await p.setViewportSize({width,height});await p.waitForTimeout(180);
      const control=device==='phone'?phone.getByRole('button',{name:'停止预演',exact:true}):panel.getByRole('button',{name:'播放建议',exact:true});
      const box=await reachable(control,p);assert.ok(box.width>=44&&box.height>=44);
      if(device!=='phone')assert.ok((await rect(page.locator('.diastage-viewer-column'))).width>=500);
      const input=device==='phone'?phone.getByLabel('你想试什么？',{exact:true}):panel.getByRole('textbox',{name:'你想试什么？',exact:true});
      const draft='舞台'.repeat(500)+'UnbrokenWord'.repeat(83);await input.fill(draft);await reachable(input,p);assert.equal(await input.inputValue(),draft);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const screenshot=`${out}/ghost-${device}-${width}x${height}.png`;await reachable(control,p);await p.screenshot({path:screenshot});return {box,screenshot};
    });
    await check('tablet orientation preserves Thread selection draft and Ghost',async()=>{
      const before=(await log()).threads[0].thread;
      for(const size of [{width:820,height:1180},{width:1180,height:820},{width:820,height:1180}]){await page.setViewportSize(size);await reachable(panel.getByRole('button',{name:'播放建议',exact:true}),page);await state('waiting-human');assert.ok(await panel.getByRole('textbox',{name:'你想试什么？',exact:true}).inputValue());}
      const after=(await log()).threads[0].thread;assert.equal(after.threadId,before.threadId);assert.equal(after.selectedProposalId,before.selectedProposalId);return {kind:'SIMULATION'};
    });
  }
  if(phase==='faults') {
    for(const fault of ['slow','timeout','offline-send'])await check(`${fault} preserves pending identity without duplicate work`,async()=>{
      await phone.getByText('和电脑上的同一个舞台一起排。',{exact:true}).waitFor();await phone.waitForTimeout(2200);const before=(await log()).threads[0].thread.messages.filter(m=>m.role==='user').length;
      let first,second;await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{
        if(route.request().method()!=='POST')return route.continue();first=route.request().postDataJSON();
        if(fault==='offline-send')return route.abort('internetdisconnected');
        await new Promise(resolve=>setTimeout(resolve,fault==='timeout'?16000:2000));
        try{await route.continue()}catch{}
      });
      await phone.getByLabel('你想试什么？',{exact:true}).fill(`synthetic ${fault}`);await phone.getByRole('button',{name:'发送给 Dia',exact:true}).click();
      if(fault==='slow'){await phone.getByRole('button',{name:'正在发送…',exact:true}).waitFor();assert.equal((await log()).threads[0].thread.messages.filter(m=>m.role==='user').length,before);await phone.waitForTimeout(4500)}
      else {await phone.getByRole('button',{name:'重试同一请求',exact:true}).waitFor();await phone.waitForTimeout(fault==='timeout'?16500:500);await phone.unrouteAll({behavior:'wait'});await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{if(route.request().method()==='POST')second=route.request().postDataJSON();await route.continue()});await phone.getByRole('button',{name:'重试同一请求',exact:true}).click();}
      await phone.waitForTimeout(5000);assert.equal((await log()).threads[0].thread.messages.filter(m=>m.role==='user').length,before+1);if(fault!=='slow')assert.deepEqual(first,second);await phone.unrouteAll();
    });
    await check('late accepted response after cancel cannot resurrect Ghost',async()=>{
      const before=await scene();let posted=false;
      await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{
        if(route.request().method()==='POST'&&!posted){posted=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,18000));try{await route.fulfill({response})}catch{}}
        else await route.continue();
      });
      await phone.getByRole('button',{name:'预演到舞台',exact:true}).first().click();await state('waiting-human');await panel.getByRole('button',{name:'清除预演',exact:true}).click();await state('proposal-ready');await phone.waitForTimeout(19000);assert.equal(await panel.locator('.dia-ghost-controls').count(),0);assert.deepEqual(await scene(),before);await phone.unrouteAll({behavior:'wait'});
    });
    for(const status of [410,404])await check(`${status===410?'expired':'server session lost'} stops polling and allows re-pair`,async()=>{
      await phone.route('**/api/remote-voice/sessions/**',route=>route.fulfill({status,json:{error:{message:'合成测试：配对已过期，请重新配对。'}}}));
      await phone.getByRole('button',{name:'重新配对',exact:true}).waitFor();let requests=0;const listener=r=>{if(r.url().includes('/api/remote-voice/sessions/'))requests++};phone.on('request',listener);await phone.waitForTimeout(5000);assert.equal(requests,0);phone.off('request',listener);assert.equal(await phone.locator('.mobile-dia__composer').count(),0);await phone.unrouteAll();await phone.reload({waitUntil:'networkidle'});await phone.getByRole('button',{name:'预演到舞台',exact:true}).first().waitFor();
    });
  }
  if (phase === 'recovery') {
    await check('phone preview is real owner Ghost and zero formal writes',async()=>{
      const before=await scene();await phone.getByRole('button',{name:'预演到舞台',exact:true}).first().click();await state('waiting-human');await phone.getByText('已发送到舞台，等待你的决定。',{exact:true}).waitFor();assert.deepEqual(await scene(),before);
    });
    await check('desktop reject reaches phone',async()=>{await panel.getByRole('button',{name:'不成立',exact:true}).click();await state('rejected');await phone.getByText('这个方向已放下，可以换一种',{exact:true}).waitFor();});
    await check('immediate desktop refresh recovers draft selection decision without live Ghost',async()=>{
      const before=(await log()).threads[0].thread;
      await panel.getByRole('textbox',{name:'你想试什么？',exact:true}).fill('最后输入，立即刷新');await page.reload();await state('rejected');assert.equal(await panel.getByRole('textbox',{name:'你想试什么？',exact:true}).inputValue(),'最后输入，立即刷新');const after=(await log()).threads[0].thread;assert.equal(after.threadId,before.threadId);assert.equal(after.selectedProposalId,before.selectedProposalId);assert.equal(await panel.locator('.dia-ghost-controls').count(),0);
    });
    await check('offline phone draft and refreshed pairing recover',async()=>{
      await phone.getByLabel('你想试什么？',{exact:true}).fill('离线也要保留这句');await mobile.setOffline(true);await phone.waitForTimeout(2300);assert.equal(await phone.getByLabel('你想试什么？',{exact:true}).inputValue(),'离线也要保留这句');await mobile.setOffline(false);await phone.reload({waitUntil:'networkidle'});await phone.getByLabel('你想试什么？',{exact:true}).waitFor();assert.equal(await phone.getByLabel('你想试什么？',{exact:true}).inputValue(),'离线也要保留这句');await phone.getByText('和电脑上的同一个舞台一起排。',{exact:true}).waitFor();
    });
    await check('lost POST response and phone refresh retry do not duplicate message',async()=>{
      const before=(await log()).threads[0].thread.messages.filter(m=>m.role==='user').length;
      let lost=false, original;
      await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{
        if(route.request().method()==='POST'&&!lost) {lost=true;original=route.request().postDataJSON();await route.fetch();await route.abort('failed');}else await route.continue();
      });
      await phone.getByLabel('你想试什么？',{exact:true}).fill('一次且只一次的手机消息');await phone.getByRole('button',{name:'发送给 Dia',exact:true}).click();await phone.reload({waitUntil:'networkidle'});
      const retry=phone.getByRole('button',{name:'重试同一请求',exact:true});if(await retry.isVisible())await retry.click();
      await state('proposal-ready');await page.waitForTimeout(2200);const after=await log();assert.equal(after.threads[0].thread.messages.filter(m=>m.role==='user').length,before+1);assert.equal(after.threads[0].thread.messages.filter(m=>m.content==='一次且只一次的手机消息').length,1);await phone.unrouteAll();return {requestIdPreserved:!!original};
    });
    for(const http of [429,503])await check(`${http} retains exact pending request and permits retry`,async()=>{
      await phone.getByText('和电脑上的同一个舞台一起排。',{exact:true}).waitFor();await phone.waitForTimeout(2200);
      let original,retry;
      await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{if(route.request().method()==='POST'){original=route.request().postDataJSON();await route.fulfill({status:http,json:{error:{message:`合成 ${http}：稍后重试`}}});}else await route.continue();});
      await phone.getByLabel('你想试什么？',{exact:true}).fill(`故障 ${http} 后重试`);await phone.getByRole('button',{name:'发送给 Dia',exact:true}).click();await phone.getByRole('alert').filter({hasText:`${http}`}).waitFor();await phone.unrouteAll();
      phone.once('request',()=>{});await phone.route('**/api/remote-voice/sessions/*/dia',async route=>{if(route.request().method()==='POST')retry=route.request().postDataJSON();await route.continue();});
      await phone.getByRole('button',{name:'重试同一请求',exact:true}).click();await state('proposal-ready');await phone.waitForTimeout(4500);assert.deepEqual(retry,original);await phone.unrouteAll();
    });
    await check('lost owner acknowledgement followed by refresh does not replay work',async()=>{
      await phone.waitForTimeout(2500);const before=(await log()).threads[0].thread.messages.filter(m=>m.role==='user').length;
      let blocked=false;
      await page.route('**/api/remote-voice/sessions/*/dia',async route=>{if(route.request().method()==='PATCH'&&route.request().postDataJSON().acknowledgement){blocked=true;await route.abort('failed')}else await route.continue()});
      await phone.getByLabel('你想试什么？',{exact:true}).fill('电脑刷新也不能重复的消息');await phone.getByRole('button',{name:'发送给 Dia',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[data-dia-state="proposal-ready"]')&&document.body.innerText.includes('电脑刷新也不能重复的消息'));
      assert.ok(blocked);await page.unrouteAll();await page.reload();await state('proposal-ready');await phone.waitForTimeout(5000);
      const after=(await log()).threads[0].thread.messages.filter(m=>m.role==='user');assert.equal(after.length,before+1);assert.equal(after.filter(m=>m.content==='电脑刷新也不能重复的消息').length,1);
    });
    await check('owner offline and scene switch do not produce false Ghost success',async()=>{
      const before=await scene();await page.getByRole('link',{name:'剧目库',exact:true}).click();await page.waitForURL(/\/scenes$/);await phone.waitForTimeout(17000);await phone.getByText('电脑 Dia 暂未连接，请在电脑上打开 Dia；尚未确认预演。',{exact:true}).waitFor();assert.ok(await phone.getByRole('button',{name:'预演到舞台',exact:true}).first().isDisabled());assert.deepEqual(await scene(),before);await page.goBack();await panel.waitFor();await phone.getByText('和电脑上的同一个舞台一起排。',{exact:true}).waitFor();
    });
    await check('revoked session disables Dia and scan, stops polling and re-pairs',async()=>{
      const pairing=panel.locator('.phone-voice-link');if(!await pairing.evaluate(e=>e.open))await panel.getByText('连接手机舞台助手',{exact:true}).click();const disconnect=panel.getByRole('button',{name:'断开连接',exact:true});await disconnect.click();await phone.getByRole('button',{name:'重新配对',exact:true}).waitFor();let count=0;const listener=r=>{if(r.url().includes('/api/remote-voice/sessions/'))count++};phone.on('request',listener);await phone.waitForTimeout(5000);assert.equal(count,0);phone.off('request',listener);assert.equal(await phone.locator('.mobile-dia__composer').count(),0);await phone.getByRole('button',{name:'重新配对',exact:true}).click();await phone.getByLabel('8 位配对码',{exact:true}).waitFor();
    });
  }
  if(phase==='resources'||phase==='leak') {
    await check('20 client-navigation Ghost cycles release resources',async()=>{
      const cdp=await owner.newCDPSession(page),samples=[];
      for(let i=0;i<(phase==='leak'?5:20);i++) {
        await panel.getByRole('button',{name:'在舞台上试试',exact:true}).first().click();await state('waiting-human');
        await panel.getByRole('button',{name:'播放建议',exact:true}).click();await page.waitForTimeout(150);
        await panel.getByRole('button',{name:'清除预演',exact:true}).click();await state('proposal-ready');
        // R3F defers renderer cleanup by 500ms; measure after that window, without relaxing growth limits.
        await page.getByRole('link',{name:'剧目库',exact:true}).click();await page.waitForURL(/\/scenes$/);await page.waitForTimeout(800);
        await cdp.send('HeapProfiler.collectGarbage');
        const beforeDiscard=await cdp.send('Memory.getDOMCounters');
        if(phase==='leak'){await cdp.send('Runtime.discardConsoleEntries');await cdp.send('HeapProfiler.collectGarbage')}
        samples.push({cycle:i+1,timeOrigin:await page.evaluate(()=>performance.timeOrigin),beforeDiscard,...await page.evaluate(()=>window.__diaResources()),...await cdp.send('Memory.getDOMCounters')});
        await page.goBack();await panel.waitFor();await state('proposal-ready');console.log('resource cycle',i+1);
      }
      result.resourceSamples=samples;
      if(phase==='leak') {
        const chunks=[];cdp.on('HeapProfiler.addHeapSnapshotChunk',({chunk})=>chunks.push(chunk));
        await cdp.send('HeapProfiler.takeHeapSnapshot');await writeFile('.tmp-hardening-heap.json',chunks.join(''));
        console.log(JSON.stringify(samples));return;
      }
      const baseline=samples[4],last=samples.at(-1);
      for(const key of ['objectUrls','audioContexts','tracks','frames'])assert.equal(last[key],baseline[key],key);
      assert.ok(last.timers<=baseline.timers+3,'timer growth');assert.ok(last.intervals<=baseline.intervals+1,'interval growth');
      assert.ok(last.nodes<=baseline.nodes*1.15+50,'retained DOM growth');assert.ok(last.jsEventListeners<=baseline.jsEventListeners*1.15+20,'retained listener growth');
      return {cycles:20,baseline,last,evidence:'REAL desktop browser; synthetic content; instrumented counts, not a GPU memory certification'};
    });
    await check('fake microphone cancel background unmount and route change release hardware',async()=>{
      await phone.getByRole('button',{name:'说一句',exact:true}).click();
      for(let i=0;i<6;i++) {
        await phone.getByRole('button',{name:'开始说话',exact:true}).click();await phone.getByRole('button',{name:'停止并转写',exact:true}).waitFor();
        if(i===3) await phone.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
        else await phone.getByRole('button',{name:'取消录音处理',exact:true}).click();
        await phone.waitForTimeout(200);const sample=await phone.evaluate(()=>window.__diaResources());assert.equal(sample.tracks,0);assert.equal(sample.audioContexts,0);
        if(i===3)await phone.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
      }
      await phone.getByRole('button',{name:'开始说话',exact:true}).click();await phone.getByRole('button',{name:'停止并转写',exact:true}).waitFor();await phone.getByRole('button',{name:'收起录音',exact:true}).click();await phone.waitForTimeout(250);let sample=await phone.evaluate(()=>window.__diaResources());assert.equal(sample.tracks,0);assert.equal(sample.audioContexts,0);
      const tools=phone.locator('.mobile-assistant-tools');await tools.locator('summary').click();await tools.getByRole('button',{name:'语音构台',exact:true}).click();
      let polls=0;const listen=r=>{if(r.url().endsWith('/dia'))polls++};phone.on('request',listen);await phone.waitForTimeout(4500);assert.equal(polls,0);phone.off('request',listen);
      await phone.getByRole('button',{name:'开始说话',exact:true}).click();await phone.getByRole('button',{name:'停止并转写',exact:true}).waitFor();await phone.getByRole('link',{name:'剧本搭台',exact:true}).click();await phone.waitForTimeout(300);sample=await phone.evaluate(()=>window.__diaResources());assert.equal(sample.tracks,0);assert.equal(sample.audioContexts,0);return {kind:'SIMULATION fake Chromium microphone, background event, no real recording or transcription'};
    });
  }
  if(phase==='stress') {
    for(const count of [50,100,200])await check(`${count} long messages restore and remain operable`,async()=>{
      await page.evaluate(async({sceneId,count})=>{
        const db=await new Promise(resolve=>{const r=indexedDB.open('diastage-rehearsal-feedback');r.onsuccess=()=>resolve(r.result)});
        await new Promise((resolve,reject)=>{const tx=db.transaction('threads','readwrite'),store=tx.objectStore('threads'),r=store.get(sceneId);r.onsuccess=()=>{const record=r.result;record.thread.messages=Array.from({length:count},(_,i)=>({messageId:crypto.randomUUID(),role:i%2?'dia':'user',content:['中'.repeat(2000),'UnbrokenEnglish'.repeat(142),'混合 Mixed '.repeat(220),'多行\n对白\n'.repeat(285)][i%4].slice(0,2000).trim(),createdAt:new Date().toISOString(),sceneVersion:record.thread.sceneVersion}));record.storageRevision++;store.put(record)};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close();
      },{sceneId,count});
      const start=performance.now();await page.reload();await panel.waitFor();await state('proposal-ready');const restoreMs=Math.round(performance.now()-start);
      assert.equal((await log()).threads[0].thread.messages.length,count);
      await panel.getByText(`更早的对话（${count-6}）`,{exact:true}).click();assert.equal(await panel.locator('.dia-message').count(),count);
      await reachable(panel.getByRole('button',{name:'发送',exact:true}),page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1440);
      return {count,restoreMs};
    });
    await check('keyboard-only conversation controls and focus',async()=>{
      const tabTo=async locator=>{for(let i=0;i<350;i++){if(await locator.first().evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab')}throw new Error('keyboard target unreachable')};
      await page.getByRole('button',{name:'收起 Dia',exact:true}).focus();await page.keyboard.press('Enter');await panel.waitFor({state:'hidden'});await page.keyboard.press('Enter');await panel.waitFor();
      const input=panel.getByRole('textbox',{name:'你想试什么？',exact:true});await tabTo(input);await page.keyboard.type('Give two alternatives');await page.keyboard.press('Enter');await state('proposal-ready');
      await tabTo(panel.getByRole('button',{name:'选这个',exact:true}).first());await page.keyboard.press('Enter');
      const why=panel.locator('.dia-proposal summary').first();await tabTo(why);await page.keyboard.press('Enter');assert.ok(await why.evaluate(e=>e.parentElement.open));await page.keyboard.press('Enter');assert.ok(await why.evaluate(e=>e===document.activeElement));
      await tabTo(panel.getByRole('button',{name:'在舞台上试试',exact:true}).first());await page.keyboard.press('Enter');await state('waiting-human');await tabTo(panel.getByRole('button',{name:'不成立',exact:true}));await page.keyboard.press('Enter');await state('rejected');
      assert.equal(await panel.locator('.dia-ghost-controls[aria-live]').count(),0);return {keyboard:true,scope:'internal, not accessibility certification'};
    });
  }
  if(phase==='performers') {
    for(const count of [2,6,12,24])await check(`${count} performers and maximum routes in 2D 3D Professional and Mini Stage`,async()=>{
      await page.getByRole('link',{name:'剧目库',exact:true}).click();await page.waitForURL(/\/scenes$/);
      const saved=await (await owner.request.get(`${base}/api/scenes/${sceneId}`)).json(),graph=saved.graph;
      const document=graph.nodes[graph.rootNodeIds[0]].metadata.diastageTheatre;
      document.rehearsalSimulation.performers=Array.from({length:count},(_,i)=>({id:`synthetic-person-${i}`,name:`人物 ${i} ${'LongName'.repeat(8)}`,color:'#888888',position:[-2.5+i%6,0,-1.5+Math.floor(i/6)],facing:0,visible:true}));
      document.rehearsalSimulation.paths=document.rehearsalSimulation.performers.map(p=>({id:`path-${p.id}`,performerId:p.id,points:Array.from({length:64},(_,i)=>[p.position[0]+Math.sin(i/10)*0.1,0,p.position[2]+i*0.002]),durationSeconds:20,visible:true}));
      const response=await owner.request.put(`${base}/api/scenes/${sceneId}`,{headers:{origin:base},data:{graph,expectedVersion:saved.version}});assert.ok(response.ok(),await response.text());
      await page.goto(firstScene);await panel.getByRole('textbox',{name:'你想试什么？',exact:true}).waitFor();await send('给我两个排法');
      for(const mode of ['default','professional']){await panel.getByRole('combobox',{name:'对话模式',exact:true}).selectOption(mode);await reachable(panel.getByRole('button',{name:'在舞台上试试',exact:true}).first(),page)}
      const started=performance.now();await panel.getByRole('button',{name:'在舞台上试试',exact:true}).first().click();await state('waiting-human');const previewMs=Math.round(performance.now()-started);assert.ok(previewMs<4000);
      await panel.getByRole('button',{name:'播放建议',exact:true}).click();
      for(const view of ['平面','三维']){await page.getByRole('button',{name:view,exact:true}).click();await page.waitForTimeout(600);await reachable(panel.getByRole('button',{name:'暂停建议',exact:true}),page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
      await phone.waitForTimeout(2500);await phone.getByRole('button',{name:'停止预演',exact:true}).waitFor();
      const mini=phone.locator('.mobile-dia__mini');if(!await mini.isVisible())await phone.getByText('查看舞台与预演',{exact:true}).click();assert.equal(await mini.locator('.mobile-dia__actor').count(),count);
      await page.screenshot({path:`${out}/performers-${count}-3d.png`});await phone.screenshot({path:`${out}/performers-${count}-mini.png`});
      await panel.getByRole('button',{name:'清除预演',exact:true}).click();await state('proposal-ready');return {count,routePoints:64,previewMs};
    });
  }
  if(phase==='screens') {
    for(const [device,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900]])await check(`${device} Home Demo Conversation Proposal Ghost Professional evidence`,async()=>{
      const home=await owner.newPage();await home.setViewportSize({width,height});await home.goto(base,{waitUntil:'networkidle'});await home.screenshot({path:`${out}/${device}-home.png`});assert.ok(await home.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await home.goto(base+'/demo');await home.waitForURL(/\/scene\//);const demo=home.getByRole('region',{name:'Dia 排演对话',exact:true});await demo.waitFor();await home.screenshot({path:`${out}/${device}-demo-first.png`});await home.close();
      const p=device==='phone'?phone:page;await p.setViewportSize({width,height});if(device!=='phone')await panel.getByRole('combobox',{name:'对话模式',exact:true}).selectOption('default');await p.screenshot({path:`${out}/${device}-conversation.png`});
      await reachable(device==='phone'?phone.getByRole('button',{name:'预演到舞台',exact:true}):panel.getByRole('button',{name:'在舞台上试试',exact:true}),p);await p.screenshot({path:`${out}/${device}-proposal.png`});await panel.getByRole('button',{name:'在舞台上试试',exact:true}).first().click();await state('waiting-human');await phone.getByRole('button',{name:'停止预演',exact:true}).waitFor();await p.screenshot({path:`${out}/${device}-ghost.png`});
      if(device!=='phone'){await panel.getByRole('combobox',{name:'对话模式',exact:true}).selectOption('professional');await reachable(panel.getByText('专业分析与版本信息',{exact:true}),p);await p.screenshot({path:`${out}/${device}-professional.png`})}
      await panel.getByRole('button',{name:'清除预演',exact:true}).click();await state('proposal-ready');await phone.waitForTimeout(2300);return {phoneProfessional:device==='phone'?'intentionally unavailable: remote cannot Adopt':undefined};
    });
  }
  if(phase==='gesture') {
    await page.getByRole('button',{name:'平面',exact:true}).click();
    const actor=page.locator('g[aria-label="模拟排演舞台图"] > g').filter({has:page.locator('text').filter({hasText:/^A$/})}).last();
    await actor.waitFor();await page.waitForTimeout(600);
    const centre=async()=>{const box=await actor.locator('circle').first().boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2}};
    const before=await scene();
    for(const cancellation of ['pointercancel','blur','scroll'])await check(`${cancellation} discards drag without formal writes`,async()=>{
      const p=await centre(),transform=await actor.getAttribute('transform');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+24,p.y+8,{steps:5});assert.notEqual(await actor.getAttribute('transform'),transform);
      if(cancellation==='scroll'){await panel.locator('.dia-dialogue').evaluate(e=>{const old=e.scrollTop;e.scrollTop=old>0?0:e.scrollHeight;if(e.scrollTop===old)throw new Error('No scroll occurred')});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
      else await page.evaluate(type=>window.dispatchEvent(type==='pointercancel'?new PointerEvent(type,{pointerId:1}):new Event(type)),cancellation);
      await page.mouse.up();await page.waitForTimeout(1700);assert.deepEqual(await scene(),before);assert.equal(await actor.getAttribute('transform'),transform);
    });
    await check('single touch and second-finger interruption do not commit a partial actor move',async()=>{
      const cdp=await owner.newCDPSession(page),p=await centre();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await scene(),before);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...p}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x+24,y:p.y+8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x+24,y:p.y+8},{id:2,x:p.x+50,y:p.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(1700);assert.deepEqual(await scene(),before);
    });
    await check('completed drag writes once, only after release',async()=>{
      const p=await centre();let puts=0;const listen=r=>{if(r.method()==='PUT'&&r.url().endsWith(`/api/scenes/${sceneId}`))puts++};page.on('request',listen);
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+25,p.y+8,{steps:10});await page.waitForTimeout(1500);assert.equal(puts,0);assert.deepEqual(await scene(),before);await page.mouse.up();await page.waitForTimeout(2200);assert.equal(puts,1);assert.notDeepEqual(await scene(),before);page.off('request',listen);
    });
  }
  result.sceneFixture = 'independent synthetic farewell';
  result.status = result.matrix.some(x=>x.status==='FAIL')||result.checks.some(x=>x.status==='FAIL')||result.errors.length?'FAIL':'PASS';
} catch(error) { result.status='FAIL';result.errors.push(error.stack);console.error(error); }
finally {
  await writeFile(`${out}/${phase}-result.json`,JSON.stringify(result,null,2));
  await browser.close();
}
console.log(JSON.stringify({phase,status:result.status,errors:result.errors,checks:result.checks}));
if(result.status!=='PASS')process.exitCode=1;
