import { expect, mock, test } from 'bun:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import type { EditorProps } from './index'

if (process.argv.includes('--mount-fixture')) {
  let editorState: Record<string, unknown> = {}
  const sceneState = { nodes: { level: { type: 'level' } }, materials: {} }
  const viewerState = { selection: { levelId: null }, outliner: {} }
  const sidebarState = { width: 280, isCollapsed: false, isDragging: false }
  const selectorStore = (state: () => object) =>
    Object.assign((selector: (value: never) => unknown) => selector(state() as never), {
      getState: state,
    })
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>
  const panelIds = ['common', 'edit-only', 'studio-only', 'never', 'host']
  const selectCommon = () => false
  const overrides: Record<string, unknown> = {
    useEditor: selectorStore(() => editorState),
    useScene: selectorStore(() => sceneState),
    useViewer: selectorStore(() => viewerState),
    useSidebarStore: selectorStore(() => sidebarState),
    useAutoSave: () => ({ isLoadingSceneRef: { current: false } }),
    useHostPanels: () => [{ id: 'host', label: 'Host', component: () => <i>panel-host</i> }],
    Viewer: passthrough,
    ViewerStage: passthrough,
    ErrorBoundary: passthrough,
    PERF_OVERLAY_ENABLED: false,
    EditorLayoutV2: ({
      viewerContent,
      sidebarTabs,
      renderTabContent,
    }: {
      viewerContent: ReactNode
      sidebarTabs: { id: string; onSelect?: () => boolean }[]
      renderTabContent: (id: string) => ReactNode
    }) => {
      assert.equal(sidebarTabs.find((tab) => tab.id === 'common')?.onSelect, selectCommon)
      return (
        <>
          {viewerContent}
          <nav data-tabs={sidebarTabs.map((tab) => tab.id).join(',')} />
          {panelIds.map((id) => (
            <section key={id}>{renderTabContent(id)}</section>
          ))}
        </>
      )
    },
  }
  // Keep the real Editor/ViewerCanvas/ViewerSceneContent JSX and React rendering;
  // replace only their external stores and UI/GPU leaves, in an isolated process.
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
    const path = specifier.startsWith('.') ? fileURLToPath(new URL(specifier, indexUrl)) : specifier
    mock.module(path, () => exports)
  }
  const { default: Editor } = await import('./index')
  const sidebarTabs: NonNullable<EditorProps['sidebarTabs']> = [
    { id: 'common', label: 'Common', component: () => <i>panel-common</i>, onSelect: selectCommon },
    { id: 'edit-only', label: 'Edit', workspaces: ['edit'], component: () => <i>panel-edit</i> },
    {
      id: 'studio-only',
      label: 'Studio',
      workspaces: ['studio'],
      component: () => <i>panel-studio</i>,
    },
    { id: 'never', label: 'Never', workspaces: [], component: () => <i>panel-never</i> },
  ]
  const scenarios = [
    { name: 'Edit', studio: false, editSlot: true, studioSlot: false },
    {
      name: 'Edit 2D keeps legacy slot semantics',
      studio: false,
      view: '2d',
      editSlot: true,
      studioSlot: false,
    },
    { name: 'Studio', studio: true, editSlot: false, studioSlot: true },
    {
      name: 'Edit hides plugin UI',
      studio: false,
      hidePlugins: true,
      editSlot: true,
      studioSlot: false,
    },
    {
      name: 'Studio hides plugin UI',
      studio: true,
      hidePlugins: true,
      editSlot: false,
      studioSlot: true,
    },
    { name: 'First person', studio: true, firstPerson: true, studioSlot: false },
    { name: 'Capture', studio: true, capture: true, studioSlot: false },
    { name: '2D', studio: true, view: '2d', studioSlot: false },
    { name: 'Split', studio: true, view: 'split', studioSlot: true },
    { name: 'Version preview', studio: true, versionPreview: true, studioSlot: false },
    { name: 'Preview', studio: true, preview: true, studioSlot: false },
    { name: 'Loading preview', studio: true, preview: true, loading: true, studioSlot: false },
  ]
  for (const layoutVersion of ['v1', 'v2'] as const) {
    for (const scenario of scenarios) {
      editorState = {
        workspaceMode: scenario.studio ? 'studio' : 'edit',
        isFirstPersonMode: !!scenario.firstPerson,
        isCaptureMode: !!scenario.capture,
        isPreviewMode: !!scenario.preview,
        viewMode: scenario.view ?? '3d',
        floorplanPaneRatio: 0.5,
        mode: 'select',
        activePaintMaterial: null,
      }
      const mounted: string[] = []
      const Probe = ({ name }: { name: string }) => {
        mounted.push(name)
        return <span data-slot={name} />
      }
      const markup = renderToStaticMarkup(
        <Editor
          layoutVersion={layoutVersion}
          isLoading={scenario.loading}
          isVersionPreviewMode={scenario.versionPreview}
          sidebarTabs={sidebarTabs}
          showPluginPanels={!scenario.hidePlugins}
          viewerSceneSlot={<Probe name="edit" />}
          viewerRuntimeSlot={<Probe name="runtime" />}
          studioSceneSlot={<Probe name="studio" />}
        />,
      )
      const context = `${layoutVersion}: ${scenario.name}`
      assert.equal(mounted.includes('studio'), !!scenario.studioSlot, context)
      assert.equal(mounted.includes('edit'), !!scenario.editSlot, context)
      assert.equal(mounted.filter((name) => name === 'runtime').length, 1, context)
      if (layoutVersion === 'v2' && (!scenario.preview || scenario.loading)) {
        const workspaceTab = scenario.studio ? 'studio-only' : 'edit-only'
        const hostTab = scenario.hidePlugins ? '' : ',host'
        assert.ok(markup.includes(`data-tabs="common,${workspaceTab}${hostTab}"`), context)
        assert.equal(markup.includes('panel-studio'), scenario.studio, context)
        assert.equal(markup.includes('panel-edit'), !scenario.studio, context)
        assert.ok(markup.includes('panel-common'), context)
        assert.equal(markup.includes('panel-host'), !scenario.hidePlugins, context)
        assert.ok(!markup.includes('panel-never'), context)
      }
    }
  }
} else {
  test('Editor mounts Studio slots exclusively and filters both rail and panel content by workspace', () => {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mount-fixture'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    })
    expect(run.status, run.stderr || run.stdout).toBe(0)
  })
}
