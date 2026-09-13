import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  DELETE as dismiss,
  GET as download,
  PATCH as receipt,
} from '../../app/api/remote-voice/sessions/[id]/scans/[uploadId]/route'
import { GET as list, POST as upload } from '../../app/api/remote-voice/sessions/[id]/scans/route'
import { scanUploads } from './scan-store'
import { scanGlb } from './scan-test-fixtures'
import { remoteVoiceSessions } from './session-store'

test('scan API: role isolation, saved scene, streamed upload, verified download, idempotent receipts and revoke', async () => {
  const oldRate = process.env.PASCAL_SCENE_API_RATE_LIMIT
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  const owner = remoteVoiceSessions.create('synthetic', 'saved-scene'),
    remote = remoteVoiceSessions.join(owner.pairingCode)
  const bytes = scanGlb(),
    id = crypto.randomUUID(),
    digest = createHash('sha256').update(bytes).digest('hex')
  const base = `http://127.0.0.1/api/remote-voice/sessions/${owner.id}/scans`
  const params = { params: Promise.resolve({ id: owner.id }) }
  const item = { params: Promise.resolve({ id: owner.id, uploadId: id }) }
  const ownerHeaders = { 'x-diastage-owner-token': owner.ownerToken },
    remoteHeaders = { 'x-diastage-remote-token': remote.remoteToken }
  try {
    expect((await list(new Request(base), params)).status).toBe(401)
    const response = await upload(
      new Request(base, {
        method: 'POST',
        headers: {
          ...remoteHeaders,
          'content-type': 'model/gltf-binary',
          'x-scan-id': id,
          'x-scan-name': 'synthetic.glb',
          'x-scan-bytes': String(bytes.length),
          'x-scan-sha256': digest,
        },
        body: bytes,
      }),
      params,
    )
    expect(response.status).toBe(202)
    expect((await response.json()).upload.state).toBe('ready')
    expect((await list(new Request(base, { headers: remoteHeaders }), params)).status).toBe(200)
    expect(
      (await download(new Request(`${base}/${id}`, { headers: remoteHeaders }), item)).status,
    ).toBe(401)
    const file = await download(new Request(`${base}/${id}`, { headers: ownerHeaders }), item)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
    expect(file.headers.get('x-scan-sha256')).toBe(digest)
    const ack = () =>
      new Request(`${base}/${id}`, {
        method: 'PATCH',
        headers: { ...ownerHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ state: 'imported' }),
      })
    for (let retry = 0; retry < 3; retry++) expect((await receipt(ack(), item)).status).toBe(200)
    expect(
      (await download(new Request(`${base}/${id}`, { headers: ownerHeaders }), item)).status,
    ).toBe(409)
    expect(
      (
        await dismiss(
          new Request(`${base}/${id}`, { method: 'DELETE', headers: remoteHeaders }),
          item,
        )
      ).status,
    ).toBe(200)
    expect(scanUploads.list(owner.id)[0]!.state).toBe('imported')
    remoteVoiceSessions.revokeRemote(owner.id, remote.remoteToken)
    expect((await list(new Request(base, { headers: ownerHeaders }), params)).status).toBe(410)
  } finally {
    await scanUploads.revoke(owner.id)
    if (oldRate === undefined) delete process.env.PASCAL_SCENE_API_RATE_LIMIT
    else process.env.PASCAL_SCENE_API_RATE_LIMIT = oldRate
  }
})
