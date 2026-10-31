import { expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('the website keeps one complete Courier, Huiwen and Source Han UI font stack', () => {
  const editor = new URL('../', import.meta.url)
  const tokens = readFileSync(new URL('app/design-tokens.css', editor), 'utf8')
  expect(tokens).toContain('--font-dia-latin: "Courier New"')
  expect(tokens).toContain(
    '--dia-font-ui: var(--font-dia-latin), var(--font-huiwen-mincho), var(--font-source-han-sans), "Microsoft YaHei", serif',
  )

  const layout = readFileSync(new URL('app/layout.tsx', editor), 'utf8')
  for (const [variable, font] of [
    ['--font-huiwen-mincho', 'huiwen-mincho/HuiwenMinchoGBK-Regular.woff2'],
    ['--font-source-han-sans', 'source-han-sans/SourceHanSansSC-VF.ttf.woff2'],
  ]) {
    expect(layout).toContain(`variable: '${variable}'`)
    expect(layout).toContain(`./fonts/${font}`)
    expect(existsSync(new URL(`app/fonts/${font}`, editor))).toBe(true)
  }

  for (const folder of ['app', 'components']) {
    const directory = fileURLToPath(new URL(`${folder}/`, editor))
    for (const file of readdirSync(directory, { recursive: true }) as string[]) {
      if (!file.endsWith('.css')) continue
      const css = readFileSync(join(directory, file), 'utf8')
      if (file !== 'design-tokens.css') expect(css).not.toMatch(/--dia-font-ui\s*:/)
      for (const match of css.matchAll(/font-family:\s*([^;}]+)/g)) {
        expect(match[1]!.trim()).toMatch(/^var\(--dia-font-(ui|notation|reading)\)(?:\s*!important)?$|^inherit$/)
      }
    }
  }
})
