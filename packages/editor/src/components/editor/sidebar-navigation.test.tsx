import { expect, mock, test } from 'bun:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactNode } from 'react'
import ts from 'typescript'

if (process.argv.includes('--sidebar-fixture')) {
  const React = await import('react')
  const originalUseState = React.useState
  mock.module('react', () => ({
    ...React,
    useState: (value: unknown) => originalUseState(value === 0 ? 600 : value),
  }))
  const { renderToStaticMarkup } = await import('react-dom/server')
  const calls: string[] = []
  let mobile = false
  let activate: ((id: string) => void) | undefined
  const editor = {
    isCaptureMode: false,
    activeSidebarPanel: 'first',
    mobilePanelSheetHeight: 0,
    setActiveSidebarPanel: (id: string) => {
      calls.push(`select:${id}`)
      editor.activeSidebarPanel = id
    },
  }
  const sidebar = {
    width: 320,
    isCollapsed: false,
    isDragging: false,
    setIsCollapsed: (collapsed: boolean) => {
      sidebar.isCollapsed = collapsed
    },
    setWidth: () => {},
    setIsDragging: () => {},
  }
  const selectorStore = (state: object) =>
    Object.assign((selector: (value: never) => unknown) => selector(state as never), {
      getState: () => state,
    })
  const overrides: Record<string, unknown> = {
    useEditor: selectorStore(editor),
    useViewer: selectorStore({ sceneTheme: 'studio' }),
    useSidebarStore: selectorStore(sidebar),
    useIsMobile: () => mobile,
    getSceneTheme: () => ({ appearance: 'dark' }),
    IconRail: ({ onIconClick }: { onIconClick: (id: string) => void }) => {
      activate = onIconClick
      return null
    },
    MobileTabBar: ({ onTabPress }: { onTabPress: (id: string) => void }) => {
      activate = onTabPress
      return null
    },
    BottomSheet: ({ children }: { children: ReactNode }) => children,
  }
  for (const filename of ['editor-layout-v2.tsx', 'editor-layout-mobile.tsx']) {
    const url = new URL(filename, import.meta.url)
    const source = ts.createSourceFile(
      filename,
      readFileSync(url, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue
      const specifier = statement.moduleSpecifier.text
      if (
        specifier === 'react' ||
        specifier === './editor-layout-mobile' ||
        statement.importClause?.isTypeOnly
      )
        continue
      const exports: Record<string, unknown> = {}
      const clause = statement.importClause
      if (clause?.name) exports.default = overrides[clause.name.text] ?? (() => null)
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const binding of clause.namedBindings.elements) {
          if (!binding.isTypeOnly)
            exports[binding.propertyName?.text ?? binding.name.text] =
              overrides[binding.name.text] ?? (() => null)
        }
      }
      mock.module(
        specifier.startsWith('.') ? fileURLToPath(new URL(specifier, url)) : specifier,
        () => exports,
      )
    }
  }
  const { EditorLayoutV2 } = await import('./editor-layout-v2')
  for (const isMobile of [false, true]) {
    mobile = isMobile
    for (const allowed of [false, true]) {
      editor.activeSidebarPanel = 'first'
      sidebar.isCollapsed = false
      calls.length = 0
      renderToStaticMarkup(
        <EditorLayoutV2
          sidebarTabs={[
            { id: 'first', label: 'First' },
            {
              id: 'second',
              label: 'Second',
              onSelect: () => {
                calls.push('activate')
                return allowed
              },
            },
          ]}
          renderTabContent={() => null}
          viewerContent={null}
        />,
      )
      assert.equal(typeof activate, 'function')
      activate?.('second')
      assert.deepEqual(
        calls,
        allowed ? ['activate', 'select:second'] : ['activate'],
        `${mobile ? 'mobile' : 'desktop'}: activation precedes selection and can cancel`,
      )
      assert.equal(editor.activeSidebarPanel, allowed ? 'second' : 'first')
    }
  }
} else {
  test('desktop and mobile sidebar switches honor host activation before selecting a panel', () => {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--sidebar-fixture'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    })
    expect(run.status, run.stderr || run.stdout).toBe(0)
  })
}
