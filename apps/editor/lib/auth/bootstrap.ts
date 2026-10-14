import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { authPaths, createAuth } from './factory'

type BootstrapInput = {
  email: string
  sceneIds: string[]
  apply?: boolean
  env?: NodeJS.ProcessEnv
}

export async function bootstrapOwner({
  email,
  sceneIds,
  apply = false,
  env = process.env,
}: BootstrapInput) {
  email = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Provide the owner email explicitly')
  if (
    !sceneIds.length ||
    new Set(sceneIds).size !== sceneIds.length ||
    sceneIds.some((id) => !id.trim())
  ) {
    throw new Error('Provide unique, exact legacy scene IDs')
  }
  const paths = authPaths(env)
  const scenes = new DatabaseSync(paths.sceneDatabase, { readOnly: !apply })
  let createdAuth: Awaited<ReturnType<typeof createAuth>> | undefined
  try {
    const rows = sceneIds.map((id) => {
      const row = scenes.prepare('SELECT id, owner_id FROM scenes WHERE id = ?').get(id)
      if (!row) throw new Error(`Scene does not exist: ${id}`)
      return row
    })
    if (!apply)
      return {
        applied: false,
        email,
        sceneIds,
        unassigned: rows.filter((row) => row.owner_id === null).length,
      }

    const backupDirectory = join(
      paths.directory,
      'backups',
      `owner-bootstrap-${Date.now()}-${randomUUID()}`,
    )
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
    await backup(scenes, join(backupDirectory, 'scenes.sqlite'))
    if (existsSync(paths.database)) {
      const existingAuth = new DatabaseSync(paths.database, { readOnly: true })
      try {
        await backup(existingAuth, join(backupDirectory, 'auth.sqlite'))
      } finally {
        existingAuth.close()
      }
    }

    const setupPath = join(paths.directory, `owner-setup-${randomUUID()}.json`)
    let wroteSetup = false
    createdAuth = await createAuth({
      env,
      sendResetPassword: async ({ user, token }) => {
        if (user.email !== email) throw new Error('Unexpected bootstrap account')
        const url = new URL('/reset-password', env.BETTER_AUTH_URL || 'http://127.0.0.1:4329')
        url.searchParams.set('token', token)
        await writeFile(setupPath, JSON.stringify({ email, url: url.href }, null, 2), {
          flag: 'wx',
          mode: 0o600,
        })
        wroteSetup = true
      },
    })
    const { auth, database } = createdAuth
    database.exec(`CREATE TABLE IF NOT EXISTS diastage_owner_bootstrap (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL UNIQUE,
      scene_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
    const reserved = database
      .prepare('SELECT email FROM diastage_owner_bootstrap WHERE id = 1')
      .get()
    if (reserved && reserved.email !== email)
      throw new Error('A different CLI owner is already reserved')
    const idsJson = JSON.stringify([...sceneIds].sort())
    const existing = database.prepare('SELECT id FROM user WHERE email = ?').get(email)
    const marker = database
      .prepare('SELECT user_id, scene_ids_json FROM diastage_owner_bootstrap WHERE email = ?')
      .get(email)
    let userId: string
    if (existing) {
      if (!marker || marker.user_id !== existing.id || marker.scene_ids_json !== idsJson) {
        throw new Error(
          'Refusing to assign legacy scenes to an existing account without a matching CLI bootstrap record',
        )
      }
      userId = String(existing.id)
    } else {
      if (marker) throw new Error('Bootstrap record exists without its account')
      if (rows.some((row) => row.owner_id !== null))
        throw new Error('A supplied scene already has an owner')
      const result = await auth.api.signUpEmail({
        body: {
          email,
          name: 'DiaStage',
          password: randomBytes(48).toString('base64url'),
        },
      })
      userId = result.user.id
      database.prepare('DELETE FROM session WHERE userId = ?').run(userId)
      database
        .prepare(
          'INSERT INTO diastage_owner_bootstrap (id, email, user_id, scene_ids_json, created_at) VALUES (1, ?, ?, ?, ?)',
        )
        .run(email, userId, idsJson, new Date().toISOString())
    }

    scenes.exec('BEGIN IMMEDIATE')
    try {
      for (const id of sceneIds) {
        const current = scenes.prepare('SELECT owner_id FROM scenes WHERE id = ?').get(id)
        if (!current || (current.owner_id !== null && current.owner_id !== userId)) {
          throw new Error(`Scene ownership changed: ${id}`)
        }
        if (current.owner_id === null)
          scenes
            .prepare('UPDATE scenes SET owner_id = ? WHERE id = ? AND owner_id IS NULL')
            .run(userId, id)
      }
      scenes.exec('COMMIT')
    } catch (error) {
      scenes.exec('ROLLBACK')
      throw error
    }
    database
      .prepare("DELETE FROM verification WHERE value = ? AND identifier LIKE 'reset-password:%'")
      .run(userId)
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: new URL('/reset-password', env.BETTER_AUTH_URL || 'http://127.0.0.1:4329').href,
      },
    })
    if (!wroteSetup)
      throw new Error('The account was reserved but the private setup link was not written')
    return { applied: true, email, sceneIds, backupDirectory, setupPath }
  } finally {
    createdAuth?.database.close()
    scenes.close()
  }
}
