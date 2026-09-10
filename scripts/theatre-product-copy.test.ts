import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { THEATRE_CATALOG_ITEMS } from '../packages/editor/src/components/ui/item-catalog/theatre-catalog'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const banned = /家装|装修|户型|厨房|卫浴|家电|橱柜|暖通|风管|冷媒|屋顶|地形|道路|\b(?:apartment|renovation|MEP|HVAC)\b/i

// Compatibility sources remain loadable, but are not registered in the DiaStage product UI.
const compatibilityPaths = [
  'apps/editor/components/rooms-preset-panel.tsx',
  'packages/editor/src/components/ui/controls/terrain-sculpt-panel.tsx',
  'packages/editor/src/components/ui/item-catalog/catalog-items.tsx',
  'packages/editor/src/components/ui/sidebar/panels/site-panel/',
  'packages/editor/src/components/ui/panels/parametric-field-utils.ts',
  'packages/editor/src/components/ui/level-duplicate-dialog.tsx',
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

test('product copy and default resource classifications do not expose excluded workflows', () => {
  const files = [
    ...sourceFiles(join(root, 'apps/editor/app')),
    ...sourceFiles(join(root, 'apps/editor/components')),
    ...sourceFiles(join(root, 'packages/editor/src/components/ui')),
    ...sourceFiles(join(root, 'packages/editor/src/components/viewer')),
  ]
  const failures: string[] = []
  for (const file of files) {
    const path = relative(root, file).replaceAll('\\', '/')
    if (compatibilityPaths.some((allowed) => allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed)) continue
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && banned.test(node.text)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        failures.push(`${path}:${line}: ${node.text.trim()}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  for (const file of ['PRODUCT.md', 'DESIGN.md', 'README.md', 'CAMERA_STUDIO.md', 'REMOUNT.md']) {
    const copy = readFileSync(join(root, file), 'utf8')
    if (banned.test(copy)) failures.push(`${file}: ${copy.match(banned)?.[0]}`)
  }
  for (const item of THEATRE_CATALOG_ITEMS) {
    if (banned.test(`${item.name} ${item.category} ${item.tags?.join(' ')}`)) failures.push(`catalog: ${item.id}`)
  }
  expect(failures).toEqual([])
})

test('product entrypoints cannot re-arm isolated tools or source classifications', () => {
  const build = readFileSync(join(root, 'apps/editor/components/build-tab.tsx'), 'utf8')
  expect(build).not.toMatch(/RoomsPresetPanel|TerrainSculptPanel|CABINET_PRESETS|collectRoofFeatures/)
  const commands = readFileSync(join(root, 'packages/editor/src/components/ui/command-palette/editor-commands.tsx'), 'utf8')
  expect(commands).not.toContain("id: 'editor.mode.terrain-sculpt'")
  expect(commands).not.toContain("id: 'editor.level.add'")
  const keyboard = readFileSync(join(root, 'packages/editor/src/hooks/use-keyboard.ts'), 'utf8')
  expect(keyboard).not.toContain("armToolMode({ mode: 'terrain-sculpt' })")
  const bootstrap = readFileSync(join(root, 'apps/editor/lib/bootstrap.ts'), 'utf8')
  expect(bootstrap).not.toContain('registerEditorHostPanel(')
  for (const inspector of ['parametric-inspector.tsx', 'multi-parametric-inspector.tsx']) {
    const source = readFileSync(join(root, 'packages/editor/src/components/ui/panels', inspector), 'utf8')
    expect(source).toContain('theatreParametrics(nodeType,')
  }
  const wrapper = readFileSync(join(root, 'packages/editor/src/components/ui/panels/panel-wrapper.tsx'), 'utf8')
  expect(wrapper).not.toContain('getInspectorExtensions(')
})
