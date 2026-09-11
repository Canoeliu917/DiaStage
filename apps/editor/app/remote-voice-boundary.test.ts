import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(import.meta.dir, path), 'utf8')

test('/remote-voice stays outside the 3D editor bootstrap', () => {
  const layout = read('layout.tsx')
  const scenePage = read('scene/[id]/page.tsx')
  const controller = read('../components/stage-entry/remote-voice-controller.tsx')

  expect(layout).not.toContain('ClientBootstrap')
  expect(scenePage).toContain('<ClientBootstrap>')
  expect(controller).toMatch(/dynamic\(\s*\(\) => import\('\.\/scan-transfer'\)/)
  expect(controller).toMatch(/dynamic\(\s*\(\) => import\('\.\/voice-recorder'\)/)
})
