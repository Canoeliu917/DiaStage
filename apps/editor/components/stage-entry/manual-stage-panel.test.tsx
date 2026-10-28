import { afterEach, expect, test } from 'bun:test'
import { ItemNode, useScene } from '@pascal-app/core'
import { STAGE_OBJECT_CATEGORIES, STAGE_OBJECT_REGISTRY } from '@pascal-app/core/stage'
import { useViewer } from '@pascal-app/viewer'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AVAILABLE_STAGE_SCENERY,
  STAGE_PROP_MENU,
  stagePropAssetUrl,
} from '@/lib/stage/prop-assets'
import { createTheatreSceneGraph } from '@/lib/theatre/new-production'
import {
  cancelStagePlacement,
  STAGE_LIBRARY,
  STAGE_LIBRARY_CATEGORIES,
  StageLibraryPanel,
  StageObjectPanel,
  startStagePlacement,
  useStagePlacement,
} from './manual-stage-panel'

afterEach(() => {
  cancelStagePlacement()
  useScene.getState().unloadScene()
  useScene.setState({ readOnly: false })
})

test('the library groups all 21 selectable object definitions into scenery, furniture and props', () => {
  expect(STAGE_LIBRARY.map(({ spec }) => spec.canonicalId)).toEqual(
    [...STAGE_OBJECT_REGISTRY]
      .sort(
        (a, b) =>
          STAGE_OBJECT_CATEGORIES.indexOf(a.category) - STAGE_OBJECT_CATEGORIES.indexOf(b.category),
      )
      .map((spec) => spec.canonicalId),
  )
  expect(new Set(STAGE_LIBRARY.map(({ spec }) => spec.canonicalId)).size).toBe(21)
  expect(
    STAGE_OBJECT_CATEGORIES.map(
      (category) => STAGE_LIBRARY.filter(({ spec }) => spec.category === category).length,
    ),
  ).toEqual([2, 5, 4, 2, 4, 4])
  expect(STAGE_LIBRARY_CATEGORIES.map(({ label }) => label)).toEqual(['布景', '家具', '道具'])
  const groups = STAGE_LIBRARY_CATEGORIES.map(({ sources }) =>
    STAGE_LIBRARY.filter(({ menu }) => sources.some((source) => menu.category === source)),
  )
  expect(groups.map((group) => group.length)).toEqual([6, 10, 5])
  expect(new Set(groups.flat().map(({ spec }) => spec.canonicalId)).size).toBe(21)
  expect(groups[0]!.filter(({ menu }) => menu.category === '门窗')).toHaveLength(4)
})

test('official models link by canonical ID while browsing loads only their supplied PNGs', () => {
  expect(STAGE_LIBRARY.every(({ entry, menu }) => entry?.libraryAssetId === menu.id)).toBe(true)
  expect(
    [...STAGE_LIBRARY.map(({ menu }) => menu)].sort((a, b) => a.id.localeCompare(b.id)),
  ).toEqual([...STAGE_PROP_MENU.assets].sort((a, b) => a.id.localeCompare(b.id)))
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const before = useScene.getState().nodes
  const html = renderToStaticMarkup(<StageLibraryPanel />)
  expect((html.match(/data-model-ready="true"/g) ?? []).length).toBe(6)
  expect((html.match(/draggable="true"/g) ?? []).length).toBe(6)
  expect((html.match(/单片宽 90 cm/g) ?? []).length).toBe(4)
  expect(html).toContain(stagePropAssetUrl('thumbnails/256/SCN-FOLD-02.png'))
  expect(html).toContain(stagePropAssetUrl('thumbnails/512/SCN-FOLD-02.png'))
  expect(html).toContain('搜索全部 21 件道具')
  expect(html).toContain('aria-label="道具预览"')
  expect(html).toContain('class="stage-library-copy"')
  expect(html).toContain('点选道具，再点舞台放置；Esc 取消。')
  expect(html).toContain('景片边缘贴合')
  expect(html).toContain('10 厘米')
  expect(html).toContain('21 件')
  expect(html).toContain('aria-label="放大二帘组合预览"')
  expect(html).not.toContain('.glb')
  expect(html).not.toContain('/stage-library/guide/')
  expect(html).not.toContain('可编辑台件')
  expect(html).not.toContain('舞台模型')
  expect(useStagePlacement.getState().draft).toBeNull()
  expect(useScene.getState().nodes).toBe(before)
})

test('read-only scenes reject a library placement request', () => {
  useScene.setState({ readOnly: true })
  startStagePlacement(STAGE_LIBRARY[0]!.entry!)
  expect(useStagePlacement.getState().draft).toBeNull()
})

test('placement guidance follows the ghost and disappears on cancel without losing result notices', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const nodes = useScene.getState().nodes
  const serverSnapshot = useStagePlacement.getInitialState()
  const original = { ...serverSnapshot }
  const render = () => {
    Object.assign(serverSnapshot, useStagePlacement.getState())
    return renderToStaticMarkup(<StageLibraryPanel />)
  }
  try {
    startStagePlacement(STAGE_LIBRARY[0]!.entry!)
    expect(useStagePlacement.getState().draft).not.toBeNull()
    expect(render()).toContain('移动指针查看台位，点击或释放完成落位；Esc 取消。')
    cancelStagePlacement()
    expect(useStagePlacement.getState().draft).toBeNull()
    expect(render()).not.toContain('移动指针查看台位')
    useStagePlacement.setState({ notice: '已更新，可撤销。' })
    cancelStagePlacement()
    expect(render()).toContain('已更新，可撤销。')
    expect(useScene.getState().nodes).toBe(nodes)
  } finally {
    Object.assign(serverSnapshot, original)
    useStagePlacement.setState({ notice: '' })
  }
})

test('properties guide an empty selection without changing scene data', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const nodes = useScene.getState().nodes
  expect(renderToStaticMarkup(<StageObjectPanel />)).toContain('请先在舞台或场景列表中选中一个布景')
  expect(useScene.getState().nodes).toBe(nodes)
})

test('new platforms and sleeper stand on their long edge; existing placements and thumbnails stay unchanged', () => {
  const graph = createTheatreSceneGraph()
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const nodes = useScene.getState().nodes
  for (const { entry } of STAGE_LIBRARY) {
    if (!entry) continue
    startStagePlacement(entry)
    const standing = entry.kind === 'platform' || entry.name === '枕木'
    expect(useStagePlacement.getState().draft!.item.transform.rotationDegrees.z).toBe(
      standing ? 90 : 0,
    )
    const existing = {
      ...entry,
      id: 'existing',
      transform: { position: { x: 0, y: 0, z: 3 }, rotationDegrees: { x: 0, y: 0, z: 0 } },
    }
    startStagePlacement(entry, existing)
    expect(useStagePlacement.getState().draft!.item.transform).toEqual(existing.transform)
  }
  expect(useScene.getState().nodes).toBe(nodes)
})

test('selected prop keeps name, position, heading and visibility primary with advanced controls collapsed', () => {
  const graph = createTheatreSceneGraph()
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const node = ItemNode.parse({
    parentId: level.id,
    asset: AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-CHAIR-045')!.asset,
  })
  graph.nodes[node.id] = node
  level.children.push(node.id)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const before = useScene.getState().nodes
  const serverSnapshot = useScene.getInitialState()
  const serverNodes = serverSnapshot.nodes
  serverSnapshot.nodes = graph.nodes
  const viewerSnapshot = useViewer.getInitialState()
  const loadFailures = viewerSnapshot.itemLoadFailures
  let html: string
  try {
    html = renderToStaticMarkup(<StageObjectPanel nodeId={node.id} />)
    viewerSnapshot.itemLoadFailures = { [node.id]: '/missing-model.glb' }
    expect(renderToStaticMarkup(<StageObjectPanel nodeId={node.id} />)).toContain(
      '模型资源缺失，原台位已保留。',
    )
  } finally {
    serverSnapshot.nodes = serverNodes
    viewerSnapshot.itemLoadFailures = loadFailures
  }
  const primary = html.split('<details class="stage-object-more">')[0]!
  for (const label of ['名称', '位置', '朝向', '在舞台中显示']) expect(primary).toContain(label)
  for (const label of ['锁定位置与属性', '形状初始化', '尺寸与精确位置', '复制后落位', '删除']) {
    expect(primary).not.toContain(label)
    expect(html).toContain(label)
  }
  expect(html).not.toMatch(/<details[^>]* open/)
  expect(html).toContain('向左转30°')
  expect(html).toContain('向右转30°')
  expect(html).toContain('前后倾转')
  expect(html).toContain('左右侧转')
  expect(useScene.getState().nodes).toBe(before)
})
