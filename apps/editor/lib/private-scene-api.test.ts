import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

test('scene routes retain save protections and isolate real authenticated accounts', async () => {
  const root = resolve(import.meta.dir, '../../..')
  const child = Bun.spawn([process.execPath, 'run', 'scripts/test-private-scenes.ts'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (status !== 0) throw new Error(`${stdout}\n${stderr}`)
  expect(stdout).toContain('fail 0')
}, 30_000)
