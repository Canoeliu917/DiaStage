import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('mobile first screen has no static Editor, Viewer, Three, registry, recorder or scan dependency', () => {
  const app = fileURLToPath(new URL('../../', import.meta.url))
  const visited = new Set<string>()
  const scanner = new Bun.Transpiler({ loader: 'tsx' })
  expect(scanner.scanImports("import type { Node } from '@pascal-app/core'")).toEqual([])
  const walk = (file: string) => {
    if (visited.has(file)) return
    visited.add(file)
    for (const entry of scanner.scanImports(readFileSync(file, 'utf8'))) {
      if (entry.kind === 'dynamic-import') continue
      const path = entry.path
      expect(path).not.toMatch(
        /three|@pascal-app\/(core|editor|viewer|nodes)|registry|client-bootstrap|voice-recorder|scan-transfer/,
      )
      if (!path.startsWith('.') && !path.startsWith('@/')) continue
      if (path.endsWith('.css')) continue
      const base = path.startsWith('@/')
        ? resolve(app, path.slice(2))
        : resolve(dirname(file), path)
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        resolve(base, 'index.ts'),
        resolve(base, 'index.tsx'),
      ].find(existsSync)
      expect(target, `resolve static import ${path} in ${file}`).toBeDefined()
      walk(target!)
    }
  }
  walk(resolve(app, 'app/remote-voice/page.tsx'))
  walk(resolve(app, 'components/stage-entry/dia-home-entry.tsx'))
  expect(visited.size).toBeGreaterThan(5)
})
