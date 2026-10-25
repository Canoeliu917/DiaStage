import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const outputRoot = join(root, '.local')
await mkdir(outputRoot, { recursive: true })
const output = await mkdtemp(join(outputRoot, 'ai-beta-tests-'))
try {
  const result = await Bun.build({
    entrypoints: [join(root, 'apps/editor/lib/ai/beta-budget.integration.ts')],
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
  if (!result.success) throw new AggregateError(result.logs, 'AI beta test build failed')
  const child = Bun.spawn(['node', '--test', join(output, 'integration.cjs')], {
    cwd: root, stdout: 'inherit', stderr: 'inherit',
  })
  process.exitCode = await child.exited
} finally {
  if (dirname(resolve(output)) !== outputRoot) throw new Error('Unexpected test output directory')
  await rm(output, { recursive: true, force: true })
}
