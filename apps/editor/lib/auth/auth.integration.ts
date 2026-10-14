import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { bootstrapOwner } from './bootstrap'
import { createAuth } from './factory'

const origin = 'http://127.0.0.1:4329'
const password = 'temporary-integration-password'
const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify(body),
  })
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

test('real registration, HttpOnly cookie, authentication, CSRF, logout and database session revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-auth-'))
  const { auth, database, paths } = await createAuth({
    env: { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' },
  })
  try {
    const short = await auth.handler(
      request('sign-up/email', {
        email: 'short@example.com',
        name: 'Short',
        password: '123456789',
      }),
    )
    assert.equal(short.status, 400)
    const signup = await auth.handler(
      request('sign-up/email', { email: 'a@example.com', name: 'A', password }),
    )
    assert.equal(signup.status, 200)
    assert.match(signup.headers.get('set-cookie') ?? '', /httponly/i)
    assert.match(signup.headers.get('set-cookie') ?? '', /samesite=lax/i)
    const headers = new Headers({ cookie: cookie(signup) })
    const session = await auth.api.getSession({ headers })
    assert.equal(session?.user.email, 'a@example.com')
    assert.equal(
      (
        await auth.handler(
          request('sign-in/email', { email: 'a@example.com', password: 'wrong-password' }),
        )
      ).status,
      401,
    )
    assert.equal(
      (
        await auth.handler(
          request('sign-out', {}, { cookie: cookie(signup), origin: 'https://untrusted.example' }),
        )
      ).status,
      403,
    )
    assert.equal(
      (await auth.handler(request('sign-out', {}, { cookie: cookie(signup) }))).status,
      200,
    )
    assert.equal(await auth.api.getSession({ headers }), null)
    const signin = await auth.handler(
      request('sign-in/email', { email: 'a@example.com', password }),
    )
    assert.equal(signin.status, 200)
    const signedHeaders = new Headers({ cookie: cookie(signin) })
    assert.ok(await auth.api.getSession({ headers: signedHeaders }))
    database.prepare('DELETE FROM session').run()
    assert.equal(await auth.api.getSession({ headers: signedHeaders }), null)
    assert.ok((await readFile(paths.secret, 'utf8')).length >= 32)
  } finally {
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
})

function createLegacyScenes(database: DatabaseSync) {
  database.exec(`CREATE TABLE scenes (id TEXT PRIMARY KEY, owner_id TEXT, graph_json TEXT, version INTEGER);
    CREATE TABLE scene_revisions (scene_id TEXT, version INTEGER, graph_json TEXT);
    INSERT INTO scenes VALUES ('one', NULL, '{"nodes":[1]}', 2), ('two', NULL, '{"nodes":[2]}', 3);
    INSERT INTO scene_revisions VALUES ('one', 1, '{"nodes":[]}'), ('two', 2, '{"nodes":[]}');`)
}

test('bootstrap claims only exact IDs, preserves graphs and revisions, backs up, and produces a one-use standard reset link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-owner-'))
  const env = { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' as const }
  const scenes = new DatabaseSync(join(directory, 'pascal.db'))
  createLegacyScenes(scenes)
  const graphs = scenes.prepare('SELECT id, graph_json, version FROM scenes ORDER BY id').all()
  const revisions = scenes.prepare('SELECT * FROM scene_revisions ORDER BY scene_id').all()
  let context: Awaited<ReturnType<typeof createAuth>> | undefined
  try {
    const dry = await bootstrapOwner({ email: 'owner@example.com', sceneIds: ['one'], env })
    assert.equal(dry.applied, false)
    assert.equal(
      scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('one')?.owner_id,
      null,
    )
    const result = await bootstrapOwner({
      email: 'owner@example.com',
      sceneIds: ['one'],
      env,
      apply: true,
    })
    assert.equal(result.applied, true)
    assert.ok(result.setupPath && result.backupDirectory)
    const saved = JSON.parse(await readFile(result.setupPath, 'utf8')) as { url: string }
    const token = new URL(saved.url).searchParams.get('token')
    assert.ok(token)
    const userId = scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('one')?.owner_id
    assert.equal(typeof userId, 'string')
    assert.equal(
      scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('two')?.owner_id,
      null,
    )
    assert.deepEqual(
      scenes.prepare('SELECT id, graph_json, version FROM scenes ORDER BY id').all(),
      graphs,
    )
    assert.deepEqual(
      scenes.prepare('SELECT * FROM scene_revisions ORDER BY scene_id').all(),
      revisions,
    )
    const backed = new DatabaseSync(join(result.backupDirectory, 'scenes.sqlite'), {
      readOnly: true,
    })
    assert.equal(
      backed.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('one')?.owner_id,
      null,
    )
    backed.close()
    context = await createAuth({ env })
    const reset = await context.auth.handler(
      request('reset-password', { token, newPassword: password }),
    )
    assert.equal(reset.status, 200)
    assert.equal(
      (await context.auth.handler(request('reset-password', { token, newPassword: password })))
        .status,
      400,
    )
    const signin = await context.auth.handler(
      request('sign-in/email', { email: 'owner@example.com', password }),
    )
    assert.equal(signin.status, 200)
    assert.equal(
      (await context.auth.api.getSession({ headers: new Headers({ cookie: cookie(signin) }) }))
        ?.user.id,
      userId,
    )
    await assert.rejects(
      bootstrapOwner({ email: 'owner@example.com', sceneIds: ['one', 'two'], env, apply: true }),
      /matching CLI bootstrap record/,
    )
    assert.equal(
      scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('two')?.owner_id,
      null,
    )
  } finally {
    context?.database.close()
    scenes.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('an ordinary account cannot claim legacy scenes through owner bootstrap', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'diastage-no-claim-'))
  const env = { PASCAL_DATA_DIR: directory, NODE_ENV: 'test' as const }
  const scenes = new DatabaseSync(join(directory, 'pascal.db'))
  createLegacyScenes(scenes)
  const context = await createAuth({ env })
  try {
    await context.auth.api.signUpEmail({
      body: { email: 'existing@example.com', name: 'Existing', password },
    })
    await assert.rejects(
      bootstrapOwner({ email: 'existing@example.com', sceneIds: ['one'], env, apply: true }),
      /existing account without a matching CLI bootstrap record/,
    )
    assert.equal(
      scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get('one')?.owner_id,
      null,
    )
  } finally {
    context.database.close()
    scenes.close()
    await rm(directory, { recursive: true, force: true })
  }
})
