import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { plugin } from 'bun'

const require = createRequire(import.meta.url)
plugin({
  name: 'next-server-only-cli',
  setup(build) {
    build.module('server-only', () => ({
      exports: require('next/dist/compiled/server-only/empty.js'),
      loader: 'object',
    }))
  },
})

try {
  const { runRealEval } = await import('../apps/editor/lib/rehearsal-intelligence/real-eval.ts')
  const { values } = parseArgs({ options: { count: { type: 'string', default: '10' } } })
  const report = await runRealEval(Number(values.count))
  console.log(JSON.stringify(report, null, 2))
  if ('transportErrors' in report && report.transportErrors.length) process.exitCode = 1
} catch {
  console.error(
    'Evaluation stopped: check count (10–20), configuration and storage; saved rows remain in .local/rehearsal-real-eval',
  )
  process.exitCode = 1
}
