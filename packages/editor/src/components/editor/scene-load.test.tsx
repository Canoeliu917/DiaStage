import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { SceneGraph } from '../../lib/scene'
import type { EditorProps } from './index'

if (!process.env.EDITOR_LOAD_FIXTURE) {
  test('UI refresh retains edits while an explicit persisted source change loads the new scene', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, EDITOR_LOAD_FIXTURE: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const ts = await import('typescript')
  const initial: SceneGraph = {
    nodes: { site: { type: 'site', metadata: { takes: [] } } },
    rootNodeIds: ['site'],
  }
  let graph = structuredClone(initial)
  const edited: SceneGraph = {
    nodes: { site: { type: 'site', metadata: { takes: ['first'], roles: 3 } } },
    rootNodeIds: ['site'],
  }
  let loads = 0
  let unloads = 0
  let applied = 0
  let hookIndex = 0
  const hooks: unknown[] = []
  let onLoad = async () => {
    loads += 1
    return initial
  }
  let loadEffect: (() => undefined | (() => void)) | undefined
  const loading = { current: true }
  const selectorStore = (state: () => object) =>
    Object.assign((selector: (value: never) => unknown) => selector(state() as never), {
      getState: state,
    })
  mock.module('react', () => ({
    ...React,
    useCallback: <T,>(callback: T) => callback,
    useEffect: (effect: () => undefined | (() => void), deps: unknown[]) => {
      // Exercise the real Editor load effect; GPU/runtime effects remain isolated.
      if (deps.includes(onLoad)) loadEffect = effect
    },
    useRef: <T,>(value: T) => {
      const index = hookIndex++
      hooks[index] ??= { current: value }
      return hooks[index]
    },
    useState: <T,>(value: T) => {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = value
      return [
        hooks[index],
        (next: T | ((previous: T) => T)) => {
          hooks[index] =
            typeof next === 'function' ? (next as (previous: T) => T)(hooks[index] as T) : next
        },
      ]
    },
  }))
  const overrides: Record<string, unknown> = {
    useEditor: selectorStore(() => ({ workspaceMode: 'edit', viewMode: '3d' })),
    useScene: selectorStore(() => ({
      ...graph,
      materials: {},
      unloadScene: () => {
        unloads += 1
        graph = { nodes: {}, rootNodeIds: [] }
      },
    })),
    useViewer: selectorStore(() => ({ selection: {}, outliner: {}, resetSelection: () => {} })),
    useSidebarStore: selectorStore(() => ({ width: 280, isCollapsed: false })),
    useSessionGroups: selectorStore(() => ({ clearGroups: () => {} })),
    useAutoSave: () => ({ isLoadingSceneRef: loading }),
    useHostPanels: () => [],
    applySceneGraphToEditor: (next: SceneGraph) => {
      applied += 1
      graph = structuredClone(next)
    },
    PERF_OVERLAY_ENABLED: false,
  }
  const indexUrl = new URL('./index.tsx', import.meta.url)
  const source = ts.createSourceFile(
    'index.tsx',
    readFileSync(indexUrl, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const specifier = statement.moduleSpecifier.text
    if (specifier === 'react' || statement.importClause?.isTypeOnly) continue
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
      specifier.startsWith('.') ? fileURLToPath(new URL(specifier, indexUrl)) : specifier,
      () => exports,
    )
  }
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: () => void) => {
      callback()
      return 1
    },
  })
  const { default: Editor } = await import('./index')
  const render = (key: string) => {
    hookIndex = 0
    const content = Editor({ onLoad, sceneLoadKey: key, layoutVersion: 'v2' }).props.children as {
      type: (props: EditorProps) => unknown
      props: EditorProps
    }
    content.type(content.props)
    assert.ok(loadEffect)
    return loadEffect()
  }
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  let cleanup = render('production:1')
  await flush()
  assert.deepEqual(graph, initial)
  assert.equal(loading.current, false)
  graph = structuredClone(edited)
  cleanup?.()
  // Fast Refresh reruns effects and replaces callback identities without a source change.
  onLoad = async () => {
    loads += 1
    return initial
  }
  cleanup = render('production:1')
  await flush()
  assert.deepEqual(graph, edited, 'refresh must preserve takes and newly added roles')
  assert.equal(unloads, 1)
  assert.equal(loads, 1)
  assert.equal(applied, 1)
  cleanup?.()
  const refreshed = {
    nodes: { site: { type: 'site', metadata: { takes: ['server version'] } } },
    rootNodeIds: ['site'],
  }
  onLoad = async () => {
    loads += 1
    return refreshed
  }
  cleanup = render('production:2')
  await flush()
  assert.deepEqual(graph, refreshed, 'an explicitly refreshed persisted revision is still loaded')
  assert.equal(loads, 2)
  cleanup?.()
  onLoad = async () => {
    loads += 1
    return initial
  }
  render('another-production:2')
  await flush()
  assert.deepEqual(graph, initial, 'switching scenes still loads even when revisions match')
  assert.equal(loads, 3)
}
