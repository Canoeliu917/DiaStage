import { afterEach, expect, test } from 'bun:test'
import { useScene } from '@pascal-app/core'
import { STAGE_OBJECT_CATEGORIES, STAGE_OBJECT_REGISTRY } from '@pascal-app/core/stage'
import { renderToStaticMarkup } from 'react-dom/server'
import { STAGE_PROP_MENU, stagePropAssetUrl } from '@/lib/stage/prop-assets'
import { createTheatreSceneGraph } from '@/lib/theatre/new-production'
import {
  STAGE_LIBRARY,
  STAGE_LIBRARY_CATEGORIES,
  StageLibraryPanel,
  startStagePlacement,
  useStagePlacement,
} from './manual-stage-panel'

afterEach(() => {
  useScene.getState().unloadScene()
  useScene.setState({ readOnly: false })
})

test('the library exposes exactly the 22 supplied object definitions in their six categories', () => {
  expect(STAGE_LIBRARY.map(({ spec }) => spec.canonicalId)).toEqual(
    [...STAGE_OBJECT_REGISTRY]
      .sort(
        (a, b) =>
          STAGE_OBJECT_CATEGORIES.indexOf(a.category) - STAGE_OBJECT_CATEGORIES.indexOf(b.category),
      )
      .map((spec) => spec.canonicalId),
  )
  expect(new Set(STAGE_LIBRARY.map(({ spec }) => spec.canonicalId)).size).toBe(22)
  expect(
    STAGE_OBJECT_CATEGORIES.map(
      (category) => STAGE_LIBRARY.filter(({ spec }) => spec.category === category).length,
    ),
  ).toEqual([3, 5, 4, 2, 4, 4])
  expect(STAGE_LIBRARY_CATEGORIES.map(({ label }) => label)).toEqual([
    '全部',
    '空间围合/景片',
    '台块与支撑',
    '门窗',
    '沙发',
    '桌',
    '椅凳',
  ])
  expect(
    STAGE_LIBRARY_CATEGORIES.filter(({ source }) => source !== null).map(
      ({ source }) => STAGE_LIBRARY.filter(({ menu }) => menu.category === source).length,
    ),
  ).toEqual([3, 5, 4, 2, 4, 4])
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
  expect((html.match(/data-model-ready="true"/g) ?? []).length).toBe(22)
  expect((html.match(/draggable="true"/g) ?? []).length).toBe(22)
  expect((html.match(/单片宽 90 cm/g) ?? []).length).toBe(2)
  expect(html).toContain(stagePropAssetUrl('thumbnails/256/SCN-FOLD-02.png'))
  expect(html).toContain(stagePropAssetUrl('thumbnails/512/SCN-FOLD-02.png'))
  expect(html).toContain('搜索道具名称或编号')
  expect(html).toContain('aria-label="道具预览"')
  expect(html).toContain('class="stage-library-copy"')
  expect(html).toMatch(/class="stage-library-use"[^>]*><strong>选用<\/strong>/)
  expect(html).toContain('景片边缘贴合')
  expect(html).toContain('10 厘米')
  expect(html).toContain(stagePropAssetUrl('thumbnails/512/SCN-FLAT-090.png'))
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
