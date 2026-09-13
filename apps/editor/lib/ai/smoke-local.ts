// Run against an isolated local server started WITHOUT OPENAI_API_KEY.
// Does not read or write scenes, only temporary pairing and permission sessions.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://127.0.0.1:4320'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Smoke tests are local-only')
let checks = 0
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
  expected = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: { origin: base, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.equal(response.status, expected, `${method} ${path}`)
  checks++
  return { response, body: await response.json() }
}
const created = await request(
  '/api/remote-voice/sessions',
  'POST',
  { label: '本机自动化验收' },
  {},
  201,
)
const owner = created.body.session
const joined = await request('/api/remote-voice/sessions/join', 'POST', { code: owner.pairingCode })
const phone = joined.body.session
const path = `/api/remote-voice/sessions/${owner.id}`
const ownerHeaders = { 'x-diastage-owner-token': owner.ownerToken }
const phoneHeaders = { 'x-diastage-remote-token': phone.remoteToken }
await request('/api/remote-voice/sessions/join', 'POST', { code: owner.pairingCode }, {}, 404)
await request(path, 'GET', undefined, { 'x-diastage-owner-token': phone.remoteToken }, 401)
await request('/api/scenes', 'GET', undefined, phoneHeaders, 403)
await request(path, 'PATCH', { mode: 'create' }, phoneHeaders, 401)
await request(path, 'PATCH', { mode: 'create' }, ownerHeaders)
const sent = await request(
  `${path}/commands`,
  'POST',
  { transcript: '把沙发向台右移半米' },
  phoneHeaders,
  202,
)
await request(`${path}/commands`, 'POST', { transcript: '重复口令' }, phoneHeaders, 409)
await request(
  `${path}/commands`,
  'PATCH',
  {
    sequence: sent.body.command.sequence,
    disposition: 'loaded',
    summary: 'API链路测试，未执行场景写入',
  },
  ownerHeaders,
)
const status = await request(path, 'GET', undefined, phoneHeaders)
assert.equal(status.body.status.summary, 'API链路测试，未执行场景写入')
assert.equal(status.body.status.mode, 'create')
await request(path, 'DELETE', undefined, phoneHeaders)
await request(path, 'GET', undefined, ownerHeaders, 410)

const grantBody = {
  action: 'grant',
  mode: 'create',
  projectId: 'qa-local-project',
  explainedAndConfirmed: true,
}
await request('/api/ai/creation-permission', 'POST', grantBody, phoneHeaders, 403)
const grant = await request('/api/ai/creation-permission', 'POST', grantBody)
const cookie = grant.response.headers.get('set-cookie')!
assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'))
const cookieHeaders = { cookie: cookie.split(';')[0]! }
await request(
  '/api/ai/creation-permission',
  'POST',
  { action: 'check', projectId: 'other-project' },
  cookieHeaders,
  403,
)
await request(
  '/api/ai/creation-permission',
  'POST',
  { action: 'check', projectId: 'qa-local-project' },
  cookieHeaders,
)
await request(
  '/api/ai/creation-permission',
  'POST',
  { action: 'revoke', projectId: 'qa-local-project' },
  cookieHeaders,
)
await request(
  '/api/ai/creation-permission',
  'POST',
  { action: 'check', projectId: 'qa-local-project' },
  cookieHeaders,
  403,
)
const sceneContext = { documentVersion: 0, venue: null, objects: [], selectedObjectIds: [] }
const local = await request('/api/stage/plan', 'POST', {
  source: 'typed-command',
  input: '建立宽8米深6米的舞台',
  sceneContext,
  priorAnswers: [],
})
assert.equal(local.body.plan.venue.widthMeters, 8)
const unconfigured = await request(
  '/api/stage/plan',
  'POST',
  {
    source: 'typed-command',
    input: '按照不对称的空间关系重新组织三块景片',
    sceneContext,
    priorAnswers: [],
  },
  {},
  503,
)
assert.match(unconfigured.body.error.message, /未配置/)
const usage = await request('/api/ai/usage')
assert.equal(usage.body.summary.scope, 'local-workspace')
console.log(
  JSON.stringify({
    checks,
    status: 'passed',
    paidModel: '未实测（无密钥503已验证）',
    iPhone: '未实测；此脚本仅验证真实本地HTTP接口',
    sceneWrites: 0,
  }),
)
