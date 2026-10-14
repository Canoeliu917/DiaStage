import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const outputRoot = join(root, '.local')
await mkdir(outputRoot, { recursive: true })
const output = await mkdtemp(join(outputRoot, 'private-scene-tests-'))
try {
  const result = await Bun.build({
    entrypoints: [join(root, 'apps/editor/lib/private-scene-api.integration.ts')],
    outdir: output,
    naming: 'integration.cjs',
    target: 'node',
    format: 'cjs',
    external: ['better-auth', 'better-auth/*', 'next', 'next/*', 'bun:sqlite'],
    plugins: [{
      name: 'server-test-context',
      setup(build) {
        build.onResolve({ filter: /^server-only$/ }, () => ({
          path: join(root, 'node_modules/next/dist/compiled/server-only/empty.js'),
        }))
      },
    }],
  })
  if (!result.success) throw new AggregateError(result.logs, 'Private scene test build failed')
  const child = Bun.spawn(['node', '--test', join(output, 'integration.cjs')], {
    cwd: root, stdout: 'inherit', stderr: 'inherit',
  })
  process.exitCode = await child.exited
} finally {
  await rm(output, { recursive: true, force: true })
}
