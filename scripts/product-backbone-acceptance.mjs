import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Only an isolated local synthetic database may be used');
const label = process.env.ACCEPTANCE_RUN || 'dev';
assert.match(label, /^[a-z0-9-]+$/);
const out = label === 'production' ? '.impeccable/review/product-backbone' : `.tmp-product-backbone-${label}`;
await mkdir(out, { recursive: true });
const result = {
  base, startedAt: new Date().toISOString(), synthetic: true,
  realModel: 'NOT_RUN', realDevice: 'NOT_RUN', screenshots: [], checks: [], errors: [], requests: [],
  fixture: {
    creation: 'Real /demo UI creates two independent synthetic scenes, one for desktop and one for paired phone; each outgoing POST is amended before its first persistence.',
    reason: 'Deterministic safe initial blocking permits independent Build and Remount verification without hiding later conflicts.',
    performers: { A: [-2.5, 0, 2], B: [2.5, 0, 2] },
    routes: 'Each performer has a 0.3 m downstage lateral path, 4 seconds; no generated proposal is altered by the harness.',
  },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(25_000);
page.on('pageerror', error => result.errors.push({ message: error.message, stack: error.stack }));
page.on('request', request => {
  if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
    result.requests.push({ time: new Date().toISOString(), method: request.method(), path: new URL(request.url()).pathname });
});
let sceneId, baseline, built, savedVersion, versionId, beforeRemount;
const panel = page.getByRole('region', { name: 'Dia 排演对话', exact: true });
const doc = graph => Object.values(graph.nodes).find(node => node.type === 'site').metadata.diastageTheatre;
const versions = graph => Object.values(graph.nodes).find(node => node.type === 'site').metadata.diastageRehearsalVersions || [];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = graph => createHash('sha256').update(JSON.stringify(canonical(graph))).digest('hex');
const reportPath = `${out}/acceptance-result.json`;
const writeReport = () => writeFile(reportPath, JSON.stringify(result, null, 2));
const screenshot = async name => {
  const path = `${out}/${name}.png`;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
  await page.screenshot({ path });
  result.screenshots.push({ path, viewport: page.viewportSize(), simulation: true });
  return path;
};
const scene = async () => {
  assert.ok(sceneId, 'No synthetic scene has been created');
  const response = await context.request.get(`${base}/api/scenes/${sceneId}`);
  assert.ok(response.ok(), `Scene GET failed: ${response.status()}`);
  return response.json();
};
async function snapshot(name) {
  const value = await scene();
  await writeFile(`${out}/${name}.json`, JSON.stringify(value, null, 2));
  return value;
}
async function unchanged(before, name) {
  await page.waitForTimeout(1800);
  const after = await snapshot(name);
  assert.equal(digest(after.graph), digest(before.graph), 'Formal graph changed before explicit confirmation');
  assert.equal(after.version, before.version, 'Server scene revision changed before explicit confirmation');
  return { beforeVersion: before.version, afterVersion: after.version, beforeHash: digest(before.graph), afterHash: digest(after.graph) };
}
async function persisted(name, predicate) {
  const limit = Date.now() + 30_000;
  while (Date.now() < limit) {
    const current = await scene();
    if (predicate(current.graph)) {
      await page.waitForTimeout(1200);
      return snapshot(name);
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`Scene save did not satisfy ${name}`);
}
async function check(name, action) {
  const started = Date.now();
  try {
    const evidence = await action();
    result.checks.push({ name, status: 'PASS', durationMs: Date.now() - started, evidence });
    console.log('PASS', name);
    await writeReport();
    return true;
  } catch (error) {
    const failure = { name, status: 'FAIL', durationMs: Date.now() - started, reason: error.message };
    try { failure.screenshot = await screenshot(`failure-${result.checks.length}`); failure.ui = (await page.locator('body').innerText()).slice(-18000); } catch {}
    result.checks.push(failure);
    console.log('FAIL', name, error.message);
    await writeReport();
    return false;
  }
}
async function diaVisible() {
  const toggle = page.getByRole('button', { name: /^(告诉 Dia|收起 Dia)$/ });
  await toggle.waitFor();
  if ((await toggle.innerText()).trim() === '告诉 Dia') await toggle.click();
  await panel.waitFor();
}
async function send(text) {
  await diaVisible();
  await panel.getByRole('textbox', { name: '你想试什么？', exact: true }).fill(text);
  await panel.getByRole('button', { name: '发送', exact: true }).click();
  await panel.getByRole('button', { name: '发送', exact: true }).waitFor();
  await page.waitForFunction(() => {
    const input = document.querySelector('.dia-composer textarea');
    const state = document.querySelector('[data-dia-state]')?.getAttribute('data-dia-state');
    return input?.value === '' && state && !['reading', 'thinking', 'understanding', 'proposing', 'compiling', 'applying'].includes(state);
  });
  return panel.locator('[data-dia-state]').innerText();
}
async function tablets(name, locator) {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(250);
  if (locator && !await locator.isVisible()) {
    const openSidebar = page.getByRole('button', { name: '展开侧栏', exact: true });
    if (await openSidebar.isVisible()) await openSidebar.click();
  }
  if (name.startsWith('remount')) {
    // Reframe through the visible UI after a viewport change, just as a user can.
    await page.locator('.rm-panel').getByRole('button', { name: '重新计算并查看全景', exact: true }).click();
  }
  if (locator) await locator.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  await screenshot(`tablet-${name}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.ok(overflow.content <= overflow.width + 1, `Horizontal overflow: ${JSON.stringify(overflow)}`);
  return overflow;
}

try {
  let amended = false;
  await page.route(`${base}/api/scenes`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    assert.equal(amended, false, 'Acceptance creates only one /demo scene');
    const body = route.request().postDataJSON();
    const site = Object.values(body.graph.nodes).find(node => node.type === 'site');
    assert.equal(site.metadata.diastageSyntheticDemo?.provenance, 'synthetic');
    const simulation = doc(body.graph).rehearsalSimulation;
    simulation.performers.forEach(performer => { performer.position = result.fixture.performers[performer.name]; });
    simulation.paths = simulation.performers.map((performer, index) => ({
      id: `backbone-fixture-route-${index}`, performerId: performer.id,
      points: [performer.position, [performer.position[0] + (index === 0 ? 0.3 : -0.3), 0, 2]],
      durationSeconds: 4, visible: true,
    }));
    amended = true;
    await route.continue({ postData: JSON.stringify(body) });
  });
  const ready = await check('Create isolated synthetic stage through /demo', async () => {
    await page.goto(`${base}/demo`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/scene\//);
    sceneId = new URL(page.url()).pathname.split('/').at(-1);
    result.sceneId = sceneId;
    await panel.getByRole('textbox', { name: '你想试什么？', exact: true }).waitFor();
    await page.waitForTimeout(2500);
    baseline = await snapshot('01-initial');
    assert.equal(doc(baseline.graph).rehearsalSimulation.paths.length, 2);
    await screenshot('desktop-initial');
    return { sceneId, url: page.url(), formalHash: digest(baseline.graph), nodeCount: Object.keys(baseline.graph.nodes).length };
  });
  if (!ready) throw new Error('Synthetic fixture could not be opened');
  const buildReady = await check('Build exact request creates four proposed objects with zero formal writes', async () => {
    const notice = await send('给我一张圆桌，两把椅子，台右一扇门');
    const review = panel.getByRole('region', { name: '舞台方案审阅', exact: true });
    await review.waitFor();
    assert.equal(await review.locator('.stage-plan-item').count(), 4);
    await review.getByRole('button', { name: '在舞台上试试搭台', exact: true }).click();
    await screenshot('desktop-build-ghost');
    return { notice, graph: await unchanged(baseline, '02-build-ghost'), names: await review.locator('.stage-plan-item > label').allTextContents() };
  });
  const revisionReady = buildReady && await check('Build follow-up edits same pending table and requires a fresh Ghost', async () => {
    const firstLabels = await panel.locator('.stage-plan-item > label').allTextContents();
    const beforePosition = await panel.locator('.stage-plan-item').filter({ hasText: '圆桌' }).locator('p').first().innerText();
    await send('桌子往台左一点');
    const review = panel.getByRole('region', { name: '舞台方案审阅', exact: true });
    await review.waitFor();
    assert.equal(await review.locator('.stage-plan-item').count(), 4);
    const afterPosition = await review.locator('.stage-plan-item').filter({ hasText: '圆桌' }).locator('p').first().innerText();
    assert.notEqual(beforePosition, afterPosition, 'Pending table pose was not revised');
    assert.equal(await review.getByRole('button', { name: '确认搭台', exact: true }).isEnabled(), false, 'Revised draft must be re-previewed');
    await review.getByRole('button', { name: '在舞台上试试搭台', exact: true }).click();
    await screenshot('desktop-build-revision');
    await tablets('build-revision', review.getByRole('button', { name: '确认搭台', exact: true }));
    return { firstLabels, beforePosition, afterPosition, graph: await unchanged(baseline, '03-build-revision-ghost') };
  });
  if (revisionReady) await check('Confirm Build persists exactly four new objects', async () => {
    await panel.getByRole('button', { name: '确认搭台', exact: true }).click();
    built = await persisted('04-build-adopted', graph => Object.keys(graph.nodes).length === Object.keys(baseline.graph.nodes).length + 4);
    const added = Object.values(built.graph.nodes).filter(node => !baseline.graph.nodes[node.id]);
    assert.equal(added.length, 4);
    assert.deepEqual(doc(built.graph).rehearsalSimulation, doc(baseline.graph).rehearsalSimulation);
    await page.keyboard.press('Escape');
    return { newObjects: added.map(node => ({ id: node.id, name: node.name, position: node.position })), beforeVersion: baseline.version, afterVersion: built.version };
  });
  if (!built) throw new Error('Build could not be adopted; later formal-state acceptance cannot run');

  await check('A by door and B by table is proposed through the rehearsal system, never direct write', async () => {
    const before = await scene();
    const notice = await send('A站门边，B靠桌子');
    const proposals = panel.getByRole('group', { name: '本轮方案', exact: true });
    await proposals.waitFor();
    const suggestions = await proposals.innerText();
    assert.match(suggestions, /A：站在布景旁 · 门 · 净距 0\.5 米/);
    assert.match(suggestions, /B：站在布景旁 · 圆桌 · 净距 0\.5 米/);
    assert.equal(await panel.getByRole('region', { name: '舞台方案审阅', exact: true }).count(), 0);
    await panel.getByRole('button', { name: '在舞台上试试', exact: true }).first().click();
    await panel.locator('.dia-ghost-controls').waitFor();
    await screenshot('desktop-actor-object-ghost');
    return { notice, suggestions, graph: await unchanged(before, '05-actor-ghost') };
  });
  await check('B less close revises rehearsal with zero formal writes', async () => {
    const before = await scene();
    const notice = await send('B别那么近');
    const proposals = panel.getByRole('group', { name: '本轮方案', exact: true });
    await proposals.waitFor();
    const suggestions = await proposals.innerText();
    assert.match(suggestions, /A：站在布景旁 · 门 · 净距 0\.5 米/);
    assert.match(suggestions, /B：站在布景旁 · 圆桌 · 净距 1 米/);
    await panel.getByRole('button', { name: '在舞台上试试', exact: true }).first().click();
    await panel.locator('.dia-ghost-controls').waitFor();
    return { notice, suggestions, graph: await unchanged(before, '06-actor-revision-ghost') };
  });
  await check('Reflect produces discussion; second direction produces a fresh rehearsal Ghost', async () => {
    const before = await scene();
    const discussion = await send('为什么这里感觉很平');
    const messages = await panel.locator('.dia-message').allTextContents();
    assert.ok(messages.some(text => text.includes('两个方向')), 'Reflect did not offer two actionable directions');
    const selection = await send('第二个方向试试');
    await panel.getByRole('group', { name: '本轮方案', exact: true }).waitFor();
    await panel.getByRole('button', { name: '在舞台上试试', exact: true }).first().click();
    await panel.locator('.dia-ghost-controls').waitFor();
    await screenshot('desktop-reflect-ghost');
    return { discussion, selection, graph: await unchanged(before, '07-reflect-ghost') };
  });
  const versionReady = await check('Save a named Version with scene, venue, rehearsal hashes and source time', async () => {
    await diaVisible();
    if (await panel.getByRole('button', { name: '清除预演', exact: true }).isVisible())
      await panel.getByRole('button', { name: '清除预演', exact: true }).click();
    await panel.getByRole('button', { name: '查看与保留版本', exact: true }).click();
    const versionPanel = page.getByRole('region', { name: '排演版本', exact: true });
    await versionPanel.waitFor();
    await versionPanel.getByLabel('版本名称', { exact: true }).fill('骨架验收 · 只读历史源');
    await versionPanel.getByLabel('简短说明（选填）', { exact: true }).fill('合成场景；桌椅门与两位人物两条路径；不含真实项目。');
    await versionPanel.getByRole('button', { name: '保存当前版本', exact: true }).click();
    savedVersion = await persisted('08-version-saved', graph => versions(graph).length === 1);
    const version = versions(savedVersion.graph)[0];
    versionId = version.id;
    for (const key of ['sceneVersion', 'venueVersion', 'rehearsalVersion', 'createdAt']) assert.ok(version[key], `Missing ${key}`);
    assert.equal(version.rehearsalSimulation.paths.length, 2);
    return { id: versionId, sceneVersion: version.sceneVersion, venueVersion: version.venueVersion, rehearsalVersion: version.rehearsalVersion, createdAt: version.createdAt };
  });
  const previewReady = versionReady && await check('View historical Version without restoring or changing any formal data', async () => {
    const versionPanel = page.getByRole('region', { name: '排演版本', exact: true });
    await versionPanel.getByRole('button', { name: '查看此版本', exact: true }).click();
    const preview = page.getByRole('region', { name: '版本预览', exact: true });
    await preview.waitFor();
    assert.ok((await preview.innerText()).includes('当前舞台未改变'));
    assert.equal(await preview.locator('svg polyline').count(), 2);
    await screenshot('desktop-version-readonly');
    await tablets('version-readonly', preview.getByRole('button', { name: '以此版本复台', exact: true }));
    return { graph: await unchanged(savedVersion, '09-version-viewed'), svgRoutes: 2 };
  });
  const remountReady = previewReady && await check('Version becomes Remount source; manual venue and three-point calibration stay draft-only', async () => {
    await page.getByRole('button', { name: '以此版本复台', exact: true }).click();
    const rm = page.locator('.rm-panel');
    await rm.getByLabel(/^复台来源/).waitFor();
    assert.equal(await rm.getByLabel(/^复台来源/).inputValue(), versionId);
    await rm.getByLabel('实测净高 / 米', { exact: true }).fill('4');
    await rm.getByRole('button', { name: '保留历史源，查看目标场地 →', exact: true }).click();
    await rm.getByLabel('场地名称', { exact: true }).fill('验收目标 · 手工测量 10 × 8 米');
    await rm.getByLabel('宽 / 米', { exact: true }).fill('10');
    await rm.getByLabel('深 / 米', { exact: true }).fill('8');
    await rm.getByLabel('实测净高 / 米', { exact: true }).fill('4');
    await rm.getByRole('button', { name: '设置三个对应基准点 →', exact: true }).click();
    const target = rm.locator('.rm-anchors').nth(1);
    const source = rm.locator('.rm-anchors').nth(0);
    const sourceValues = await source.locator('input').evaluateAll(inputs => inputs.map(input => Number(input.value)));
    for (let index = 0; index < 3; index++) await target.getByLabel('X / 米', { exact: true }).nth(index).fill(String(sourceValues[index * 3] + 10));
    await rm.getByRole('button', { name: '校准并生成预览 →', exact: true }).click();
    await rm.getByText('总体校准误差（均方根）', { exact: true }).waitFor();
    beforeRemount = await snapshot('10-remount-preview');
    const graph = await unchanged(savedVersion, '11-remount-before-adopt');
    await screenshot('desktop-remount-overlay');
    return { graph, sourceValues, targetXTranslationMeters: 10, text: await rm.innerText() };
  });
  if (remountReady) {
    await check('Source Target and Overlay controls are visible and switchable', async () => {
      const rm = page.locator('.rm-panel');
      await rm.getByRole('button', { name: /04\s*映射预览/ }).click();
      const group = rm.getByRole('group', { name: '复台视觉对比', exact: true });
      for (const [name, image] of [['原版本', 'source'], ['目标方案', 'target'], ['叠加对比', 'overlay']]) {
        const button = group.getByRole('button', { name, exact: true });
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        await screenshot(`desktop-remount-${image}`);
      }
      await tablets('remount-overlay', group);
      return { graph: await unchanged(beforeRemount, '12-remount-comparison') };
    });
    await check('Confirm Remount applies 1:1 once; real conflicts block instead of being ignored', async () => {
      const rm = page.locator('.rm-panel');
      await rm.getByRole('button', { name: /05\s*实体落位/ }).click();
      await rm.getByLabel('我已核对位置、尺寸、净距提示与现场条件', { exact: true }).check();
      const confirmation = rm.getByRole('button', { name: '确认复台', exact: true });
      if (!await confirmation.isEnabled()) {
        result.remountBlocked = { expectedProtection: true, text: await rm.innerText(), graph: await unchanged(beforeRemount, '13-remount-blocked') };
        throw new Error(`Remount cannot be applied: ${result.remountBlocked.text}`);
      }
      await confirmation.click();
      const applied = await persisted('13-remount-applied', graph => digest(graph) !== digest(beforeRemount.graph));
      const beforeSim = doc(beforeRemount.graph).rehearsalSimulation, afterSim = doc(applied.graph).rehearsalSimulation;
      const scenery = Object.values(beforeRemount.graph.nodes).filter(node => !baseline.graph.nodes[node.id]);
      scenery.forEach(node => {
        const after = applied.graph.nodes[node.id];
        assert.deepEqual(after.position, [node.position[0] + 10, node.position[1], node.position[2]]);
        assert.deepEqual(after.topology, node.topology, '1:1 must not resize physical scenery geometry');
        assert.deepEqual(after.scale, node.scale, '1:1 must not change physical scale');
      });
      beforeSim.performers.forEach((performer, index) => assert.deepEqual(afterSim.performers[index].position, [performer.position[0] + 10, performer.position[1], performer.position[2]]));
      assert.equal(afterSim.durationSeconds, beforeSim.durationSeconds);
      beforeSim.paths.forEach((path, index) => {
        assert.equal(afterSim.paths[index].durationSeconds, path.durationSeconds);
        assert.deepEqual(afterSim.paths[index].points, path.points.map(point => [point[0] + 10, point[1], point[2]]));
      });
      await screenshot('desktop-remount-applied');
      await rm.getByRole('button', { name: '撤销本次复台', exact: true }).click();
      const undone = await persisted('14-remount-undone', graph => digest(graph) === digest(beforeRemount.graph));
      return {
        appliedVersion: applied.version, undoVersion: undone.version, oneUndoRestoresExactGraph: true,
        sceneryObjectsMappedAtOriginalSize: scenery.length,
        formalVenueAfterApply: doc(applied.graph).venue,
        limitation: 'Manual target venue is saved in Remount configuration; this applies mapped poses and rehearsal routes, not a replacement of the formal venue geometry. Full target-venue replacement remains PARTIAL.',
      };
    });
  }
  await check('Paired phone submits Build, requests owner Ghost and receives read-only scenery projection', async () => {
    // A second /demo scene is owned solely by this harness; the original acceptance scene is retained.
    amended = false;
    await page.goto(`${base}/demo`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/scene\//);
    sceneId = new URL(page.url()).pathname.split('/').at(-1);
    assert.notEqual(sceneId, result.sceneId);
    result.phoneSceneId = sceneId;
    await diaVisible();
    await panel.getByRole('textbox', { name: '你想试什么？', exact: true }).waitFor();
    await page.waitForTimeout(1800);
    const before = await snapshot('15-phone-initial');
    await panel.getByText('连接手机舞台助手', { exact: true }).click();
    await panel.getByRole('button', { name: '生成配对码', exact: true }).click();
    const code = (await panel.locator('.phone-voice-link__code').innerText()).replace(/[^A-Z0-9]/g, '');
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const phone = await mobile.newPage();
      phone.setDefaultTimeout(30_000);
      phone.on('pageerror', error => result.errors.push({ page: 'phone', message: error.message, stack: error.stack }));
      await phone.goto(`${base}/remote-voice`, { waitUntil: 'domcontentloaded' });
      await phone.getByLabel('8 位配对码', { exact: true }).fill(code);
      await phone.getByRole('button', { name: '连接舞台', exact: true }).click();
      await phone.getByLabel('你想试什么？', { exact: true }).fill('给我一张圆桌，两把椅子，台右一扇门');
      await phone.getByRole('button', { name: '发送给 Dia', exact: true }).click();
      await panel.getByRole('region', { name: '舞台方案审阅', exact: true }).waitFor();
      await phone.getByRole('button', { name: '预演到舞台', exact: true }).first().click();
      await panel.locator('[data-dia-state="waiting-human"]').waitFor();
      await phone.locator('.mobile-dia__ghost-scenery').first().waitFor();
      assert.equal(await phone.locator('.mobile-dia__ghost-scenery').count(), 4);
      assert.equal(await phone.getByRole('button', { name: /^(采用|采纳|确认搭台|确认复台)$/ }).count(), 0, 'Phone must not expose formal adoption');
      assert.equal(await panel.getByRole('button', { name: '确认搭台', exact: true }).isEnabled(), true);
      const graph = await unchanged(before, '16-phone-build-ghost');
      const path = `${out}/phone-390x844-build-ghost.png`;
      await phone.screenshot({ path });
      result.screenshots.push({ path, viewport: phone.viewportSize(), simulation: true });
      await phone.locator('.mobile-dia__mini').scrollIntoViewIfNeeded();
      await phone.waitForTimeout(150);
      const previewPath = `${out}/phone-390x844-build-scenery.png`;
      await phone.screenshot({ path: previewPath });
      result.screenshots.push({ path: previewPath, viewport: phone.viewportSize(), simulation: true });
      await screenshot('desktop-phone-requested-build-ghost');
      return { sceneId, graph, phoneSceneryCount: 4, phoneAdoptButtons: 0, actualOwnerConfirmedPreview: true, actualOwnerAdopted: false, device: 'Chromium mobile viewport simulation; real iPhone NOT_RUN' };
    } finally { await mobile.close(); }
  });
  await check('No uncaught browser exceptions during completed acceptance', async () => { assert.deepEqual(result.errors, []); return { errors: 0 }; });
} catch (error) {
  result.fatal = { message: error.message, stack: error.stack };
  console.error(error.message);
} finally {
  result.finishedAt = new Date().toISOString();
  result.status = result.fatal || result.checks.some(check => check.status === 'FAIL') ? 'FAIL' : 'PASS';
  await writeReport();
  await browser.close();
  console.log(`${result.status}: ${reportPath}`);
  if (result.status === 'FAIL') process.exitCode = 1;
}
