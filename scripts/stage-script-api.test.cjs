const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { test } = require('node:test')

// Run against next start after building; unit tests do not exercise Turbopack's worker output.
const base = process.env.BASE_URL || 'http://127.0.0.1:4319'
const fixtures = path.join(__dirname, 'fixtures/stage-script')

async function upload(name, mime) {
  const form = new FormData()
  form.set('file', new File([await fs.readFile(path.join(fixtures, name))], name, { type: mime }))
  const response = await fetch(`${base}/api/script/stage-plan`, {
    method: 'POST',
    headers: { origin: new URL(base).origin },
    body: form,
    signal: AbortSignal.timeout(65000),
  })
  const body = await response.json()
  assert.equal(typeof body.requestId, 'string')
  return { status: response.status, body }
}

test('built script route extracts PDF and DOCX and preserves safe document errors', async () => {
  for (const [extension, mime] of [
    ['pdf', 'application/pdf'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ]) {
    const { status, body } = await upload(`stage-three-items.${extension}`, mime)
    assert.equal(status, 200, JSON.stringify(body.error))
    assert.equal(body.file.type, extension)
    assert.equal(body.file.pageCount, extension === 'pdf' ? 1 : null)
    assert.equal(body.file.paragraphCount, 1)
    assert.deepEqual(body.plan.items.map(item => item.kind).sort(), ['door-flat', 'sofa', 'window-flat'])
    assert.equal(body.plan.questions.length, 0)
    assert.ok(body.plan.items.every(item => item.evidenceIds.length > 0))
    assert.ok(body.plan.evidence.every(evidence => extension === 'pdf' ? evidence.page === 1 : evidence.paragraph === 1))
  }
  const scanned = await upload('scanned-empty.pdf', 'application/pdf')
  assert.equal(scanned.status, 422)
  assert.equal(scanned.body.error.code, 'SCANNED_PDF')
  const legacy = await upload('legacy.doc', 'application/msword')
  assert.equal(legacy.status, 415)
  assert.equal(legacy.body.error.code, 'UNSUPPORTED_FILE')
  assert.match(legacy.body.error.message, /另存为 \.docx/)
})
