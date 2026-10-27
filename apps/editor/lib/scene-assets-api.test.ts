import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

test('asset routes use real isolated cookie sessions and private SQLite without network access', async () => {
  const root = resolve(import.meta.dir, '../../..')
  await mkdir(join(root, '.local'), { recursive: true })
  const output = await mkdtemp(join(root, '.local', 'asset-route-tests-'))
  try {
    const built = await Bun.build({
      entrypoints: [join(root, 'apps/editor/lib/scene-assets-api.integration.ts')],
      outdir: output,
      naming: 'integration.cjs',
      target: 'node',
      format: 'cjs',
      external: ['better-auth', 'better-auth/*', 'next', 'next/*', 'bun:sqlite'],
      plugins: [
        {
          name: 'server-test-context',
          setup(build) {
            build.onResolve({ filter: /^server-only$/ }, () => ({
              path: join(root, 'node_modules/next/dist/compiled/server-only/empty.js'),
            }))
          },
        },
      ],
    })
    if (!built.success) throw new AggregateError(built.logs, 'Asset route fixture build failed')
    const child = Bun.spawn(['node', '--test', join(output, 'integration.cjs')], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: 'test',
        DIASTAGE_AUTH_EMAIL_ENABLED: 'false',
        OPENAI_API_KEY: '',
        DIASTAGE_AI_BETA_USER_IDS: '',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (status !== 0) throw new Error(`${stdout}\n${stderr}`)
    expect(stdout).toContain('tests 7')
    expect(stdout).toContain('fail 0')
    console.info(stdout)
  } finally {
    assert.equal(dirname(resolve(output)), join(root, '.local'))
    assert.ok(basename(output).startsWith('asset-route-tests-'))
    await rm(output, { recursive: true, force: true })
  }
}, 30_000)
