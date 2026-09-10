import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  BaseNode,
  isNodeKindEnabled,
  loadPlugin,
  nodeRegistry,
  type Plugin,
  SiteNode,
  useScene,
} from '@pascal-app/core'
import { z } from 'zod'
import { editorHostPanelRegistry, registerEditorHostPanel } from './plugin-panels'
import { applySceneGraphToEditor, type SceneGraph, syncLegacyScenePlugins } from './scene'

// Exercise the real registry/render gate without importing procedural geometry or image assets.
const TreeNode = BaseNode.extend({ type: z.literal('trees:tree').default('trees:tree') })
const treesPlugin: Plugin = {
  id: 'pascal:trees',
  apiVersion: 1,
  nodes: [
    {
      kind: 'trees:tree',
      schemaVersion: 1,
      schema: TreeNode,
      category: 'utility',
      defaults: () => ({}),
      capabilities: {},
      renderer: { kind: 'parametric', module: async () => ({ default: () => null }) },
    },
  ],
}

describe('legacy scene plugin compatibility without authoring panels', () => {
  let restoreRegistry = () => {}
  let restorePanels = () => {}
  beforeEach(() => {
    restoreRegistry = nodeRegistry._snapshot()
    const previousPanels = editorHostPanelRegistry.getSnapshot()
    restorePanels = () => {
      editorHostPanelRegistry.reset()
      for (const panel of previousPanels) registerEditorHostPanel(panel)
    }
    nodeRegistry._reset()
    editorHostPanelRegistry.reset()
    useScene.getState().setReadOnly(false)
    useScene.getState().unloadScene()
  })
  afterEach(() => {
    useScene.getState().unloadScene()
    restoreRegistry()
    restorePanels()
  })
  function fixture(): SceneGraph {
    const site = SiteNode.parse({ name: '旧场景' })
    const tree = TreeNode.parse({ id: 'tree_legacy', parentId: site.id })
    return {
      nodes: { [site.id]: { ...site, children: [tree.id] }, [tree.id]: tree },
      rootNodeIds: [site.id],
    }
  }
  test('an old tree graph without an install field remains renderable without a host panel', async () => {
    await loadPlugin(treesPlugin)
    const graph = fixture()
    const original = JSON.stringify(graph)
    applySceneGraphToEditor(graph)
    expect(useScene.getState().installedPlugins).toEqual(['pascal:trees'])
    expect(isNodeKindEnabled('trees:tree', useScene.getState().installedPlugins)).toBe(true)
    expect(useScene.getState().hasExplicitPluginInstallState).toBe(false)
    expect(editorHostPanelRegistry.getSnapshot()).toEqual([])
    expect(JSON.stringify(graph)).toBe(original)
  })
  test('an explicitly empty install field keeps the user-disabled plugin disabled', async () => {
    await loadPlugin(treesPlugin)
    applySceneGraphToEditor({ ...fixture(), installedPlugins: [] })
    syncLegacyScenePlugins()
    expect(useScene.getState().installedPlugins).toEqual([])
    expect(isNodeKindEnabled('trees:tree', useScene.getState().installedPlugins)).toBe(false)
    expect(useScene.getState().hasExplicitPluginInstallState).toBe(true)
  })
  test('late plugin registration enables only plugins used by a legacy graph', async () => {
    applySceneGraphToEditor(fixture())
    expect(useScene.getState().installedPlugins).toEqual([])
    await loadPlugin(treesPlugin)
    syncLegacyScenePlugins()
    expect(useScene.getState().installedPlugins).toEqual(['pascal:trees'])
    const site = SiteNode.parse({})
    applySceneGraphToEditor({ nodes: { [site.id]: site }, rootNodeIds: [site.id] })
    syncLegacyScenePlugins()
    expect(useScene.getState().installedPlugins).toEqual([])
  })
})
