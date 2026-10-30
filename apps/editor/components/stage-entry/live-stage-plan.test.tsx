import { afterEach, expect, test } from 'bun:test'
import { ItemNode, useScene } from '@pascal-app/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { AVAILABLE_STAGE_SCENERY } from '@/lib/stage/prop-assets'
import { createTheatreSceneGraph } from '@/lib/theatre/new-production'
import { LiveStagePlan } from './live-stage-plan'

afterEach(() => useScene.getState().unloadScene())

test('the independent overview renders its title and a native chair without the conversation', () => {
  const graph = createTheatreSceneGraph('独立俯视图测试')
  const level = Object.values(graph.nodes).find((node) => node.type === 'level')!
  const chair = ItemNode.parse({
    name: '验收硬椅',
    parentId: level.id,
    asset: AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === 'SCN-CHAIR-045')!.asset,
  })
  graph.nodes[chair.id] = chair
  level.children.push(chair.id)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const before = JSON.stringify(useScene.getState().nodes)
  const markup = renderToStaticMarkup(<LiveStagePlan title="舞台俯视图" />)
  expect(markup).toContain('<h2>舞台俯视图</h2>')
  expect(markup).toContain('<svg')
  expect(markup).toContain(`data-proposal-id="${chair.id}"`)
  expect(markup).toContain('验收硬椅')
  expect(markup).not.toContain('textarea')
  expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
})
