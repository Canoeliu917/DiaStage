import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  clearSceneHistory,
  ItemNode,
  sceneRegistry,
  subscribeSceneCommits,
  useScene,
} from '@pascal-app/core'
import { validateStagePlan } from '@pascal-app/core/stage'
import { applyItemFoldControls } from '@pascal-app/nodes/item-fold'
import { Group } from 'three'
import { ItemGLTFLoader } from '../../../../packages/nodes/src/item/model-loader'
import { SceneJournal } from '../scene-journal'
import { useStagePlanPreview } from '../stage/plan-preview'
import { AVAILABLE_STAGE_SCENERY } from '../stage/prop-assets'
import { createTheatreSceneGraph } from '../theatre/new-production'
import { bindRehearsalScene } from './authority'
import { DiaConversation } from './conversation-controller'
import { parseOpenLanguage } from './open-language'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
async function setup(assets: string[]) {
  const graph = createTheatreSceneGraph(),
    level = Object.values(graph.nodes).find((n) => n.type === 'level')!
  for (const node of Object.values(graph.nodes))
    if (node.type === 'item') {
      delete graph.nodes[node.id]
      level.children = level.children.filter((id) => id !== node.id)
    }
  const ids: string[] = []
  for (const [index, assetId] of assets.entries()) {
    const source = AVAILABLE_STAGE_SCENERY.find(({ asset }) => asset.id === assetId)!
    const node = ItemNode.parse({
      parentId: level.id,
      asset: source.asset,
      name: assetId === 'SCN-FOLD-03' ? '三联景片' : `景片${index}`,
      position: [index === 0 ? 0 : index === 1 ? -2 : 2, 0, 0],
      metadata: { stageKind: source.kind },
      ...(assetId === 'SCN-FOLD-03'
        ? { controls: { fold_angle_1_deg: 180, fold_angle_2_deg: 180 } }
        : {}),
    })
    graph.nodes[node.id] = node
    level.children.push(node.id)
    ids.push(node.id)
    const bytes = readFileSync(
      new URL(`../../public/stage-library/models/${assetId}.glb`, import.meta.url),
    )
    const model = await new ItemGLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    const root = new Group()
    root.userData.itemModelSettled = true
    root.add(model.scene)
    applyItemFoldControls(root, node.controls)
    sceneRegistry.nodes.set(node.id, root)
  }
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  clearSceneHistory()
  return ids
}
for (const scenario of ['enclosure', 'partial', 'corner', 'fold', 'direction', 'provider'] as const)
  test(`Integration: ${scenario} grounded proposal, followups, no writes until one Accept transaction`, async () => {
    const ids = await setup(
      scenario === 'fold'
        ? ['SCN-FOLD-03']
        : Array(scenario === 'enclosure' ? 3 : scenario === 'direction' ? 1 : 2).fill(
            'SCN-FLAT-090',
          ),
    )
    const sceneId = crypto.randomUUID(),
      journal = new SceneJournal(sceneId)
    await journal.recover(useScene.getState(), 1)
    const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
    let commits = 0,
      queue = Promise.resolve()
    const stop = subscribeSceneCommits(() => {
      commits++
      const snapshot = useScene.getState()
      queue = queue.then(() => journal.append(snapshot))
    })
    const dia = new DiaConversation(sceneId, () => null, undefined, false)
    const originalFetch = globalThis.fetch
    let providerCalls = 0
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      expect(url).toBe('/api/dia/ground')
      providerCalls++
      const request = JSON.parse(String(init?.body))
      expect(request.context.objects.some((o: object) => 'transform' in o)).toBe(false)
      return Response.json({
        requestId: crypto.randomUUID(),
        grounding: {
          ...(parseOpenLanguage(request.rawUtterance) ?? parseOpenLanguage('两块景片拐90度')),
          rawUtterance: request.rawUtterance,
        },
        provider: 'openai',
        model: 'mock-provider-not-live',
      })
    }) as typeof fetch
    const send = async (text: string) => {
      await dia.send(text)
      return dia.store.getState().thread!.messages.at(-1)?.content
    }
    const phrase =
      scenario === 'enclosure'
        ? '拿三块景片给我围一下。'
        : scenario === 'partial'
          ? '两块景片围空间，中间留入口'
          : scenario === 'corner'
            ? '两块景片接成直角'
            : scenario === 'fold'
              ? '三联景片收成U型'
              : scenario === 'provider'
                ? '把两个平片搭成直角弯'
                : '景片0放到台左'
    try {
      await dia.load()
      const before = JSON.stringify(useScene.getState().nodes)
      const message = await send(phrase)
      expect(dia.buildProposal()?.structuredGrounding, message).toBeDefined()
      expect(dia.buildProposal()!.groundingProvider).toEqual({
        provider: 'openai',
        model: 'mock-provider-not-live',
      })
      if (scenario === 'enclosure') {
        const first = dia.buildProposal()!.id
        expect(await send('前面别封死，留个入口。')).toContain('Stage Proposal')
        expect(dia.buildProposal()!.parentId).toBe(first)
        expect(
          dia.buildProposal()!.spatialSolution!.constraints.some((c) => c.type === 'leave_opening'),
        ).toBe(true)
        const second = dia.buildProposal()!.id
        await send('再宽一点。')
        expect(dia.buildProposal()!.parentId).toBe(second)
        expect(dia.buildProposal()!.knowledgeProposal!.constraints[0]!.widthMeters).toBe(0.9)
      }
      if (scenario === 'direction') {
        const first = dia.buildProposal()!.id
        expect(await send('不是台左，我说的是观众左边。')).toContain('Stage Proposal')
        expect(dia.buildProposal()!.parentId).toBe(first)
        expect(dia.buildProposal()!.knowledgeProposal!.actions[0]!.parameters!.frame).toBe(
          'audience',
        )
      }
      await dia.previewBuild(
        validateStagePlan(dia.buildProposal()!.plan, dia.buildProposal()!.context).plan,
      )
      expect(dia.buildProposal()!.status, dia.store.getState().notice).toBe('previewed')
      if (['enclosure', 'partial', 'corner', 'provider'].includes(scenario)) {
        await send('看第二个')
        const second = dia.buildProposal()!.spatialSolution!.selectedCandidateId
        await send('换另一个方案。')
        expect(dia.buildProposal()!.spatialSolution!.selectedCandidateId).not.toBe(second)
      }
      const ghost = useStagePlanPreview.getState().plan,
        parent = dia.buildProposal()!.id
      for (const text of ['开放一点。', '把左边那块转个90度。', '让景片飞起来', '角度小一点']) {
        expect(await send(text)).toContain('需要澄清')
        expect(dia.buildProposal()!.id).toBe(parent)
        expect(useStagePlanPreview.getState().plan).toEqual(ghost)
      }
      expect(commits).toBe(0)
      expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
      await send('不要了。')
      expect(useStagePlanPreview.getState().plan).toBeNull()
      expect(commits).toBe(0)
      await send(phrase)
      await dia.previewBuild(
        validateStagePlan(dia.buildProposal()!.plan, dia.buildProposal()!.context).plan,
      )
      await dia.adopt()
      await queue
      expect(commits, dia.store.getState().notice).toBe(1)
      expect(useScene.temporal.getState().pastStates).toHaveLength(1)
      const accepted = JSON.stringify(useScene.getState().nodes)
      const acceptedLeft =
        scenario === 'partial'
          ? [...dia.buildProposal()!.spatialSolution!.candidates]
              .find(
                (candidate) =>
                  candidate.candidateId ===
                  dia.buildProposal()!.spatialSolution!.selectedCandidateId,
              )!
              .resolvedTransforms.toSorted(
                (a, b) => b.transform.position.x - a.transform.position.x,
              )[0]!.subject
          : null
      const acceptedLeftTransform = acceptedLeft
        ? JSON.stringify({
            position: (useScene.getState().nodes[acceptedLeft] as ItemNode).position,
            rotation: (useScene.getState().nodes[acceptedLeft] as ItemNode).rotation,
          })
        : null
      useScene.temporal.getState().undo()
      expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
      useScene.temporal.getState().redo()
      expect(JSON.stringify(useScene.getState().nodes)).toBe(accepted)
      if (scenario === 'partial') {
        const parent = dia.buildProposal()!.id
        expect(await send('入口再宽一点，但左边景片不要动')).toContain('Stage Proposal')
        expect(dia.buildProposal()!.parentId).toBe(parent)
        expect(commits).toBe(1)
        await dia.previewBuild(
          validateStagePlan(dia.buildProposal()!.plan, dia.buildProposal()!.context).plan,
        )
        expect(commits).toBe(1)
        await dia.adopt()
        await queue
        expect(commits).toBe(2)
        expect(
          JSON.stringify({
            position: (useScene.getState().nodes[acceptedLeft!] as ItemNode).position,
            rotation: (useScene.getState().nodes[acceptedLeft!] as ItemNode).rotation,
          }),
        ).toBe(acceptedLeftTransform)
      }
      expect(providerCalls).toBe(
        scenario === 'enclosure' ? 4 : ['partial', 'direction'].includes(scenario) ? 3 : 2,
      )
    } finally {
      globalThis.fetch = originalFetch
      dia.dispose()
      stop()
      unbind()
      for (const id of ids) sceneRegistry.nodes.delete(id)
      useScene.getState().unloadScene()
      clearSceneHistory()
    }
  }, 120000)

test('Integration: compound stage stays Ghost-only until one Accept transaction', async () => {
  await setup([])
  const sceneId = crypto.randomUUID()
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  const unbind = bindRehearsalScene(sceneId, () => journal.assertCurrent())
  let commits = 0
  let queue = Promise.resolve()
  const stop = subscribeSceneCommits(() => {
    commits++
    const snapshot = useScene.getState()
    queue = queue.then(() => journal.append(snapshot))
  })
  const dia = new DiaConversation(sceneId, () => null, undefined, false)
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = (async () => {
    providerCalls++
    throw new Error('compound stage must stay deterministic')
  }) as typeof fetch
  const phrase = '生成一个有三帘景片和二帘景片联合搭成的舞台，舞台中有桌子椅子沙发'
  try {
    await dia.load()
    const before = JSON.stringify(useScene.getState().nodes)
    await dia.send(phrase)
    expect(dia.buildProposal()!.plan.items.map((item) => item.libraryAssetId)).toEqual([
      'SCN-FOLD-03',
      'SCN-FOLD-02',
      'SCN-TABLE-090',
      'SCN-CHAIR-045',
      'SCN-SOFA-175',
    ])
    expect(providerCalls).toBe(0)
    expect(commits).toBe(0)
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    await dia.previewBuild(dia.buildProposal()!.plan)
    expect(dia.buildProposal()!.status).toBe('previewed')
    expect(commits).toBe(0)
    await dia.send('不要了。')
    expect(useStagePlanPreview.getState().plan).toBeNull()
    expect(commits).toBe(0)
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)

    await dia.send(phrase)
    await dia.previewBuild(dia.buildProposal()!.plan)
    await dia.adopt()
    await queue
    expect(commits).toBe(1)
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    const accepted = JSON.stringify(useScene.getState().nodes)
    useScene.temporal.getState().undo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(before)
    useScene.temporal.getState().redo()
    expect(JSON.stringify(useScene.getState().nodes)).toBe(accepted)
    expect(providerCalls).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
    dia.dispose()
    stop()
    unbind()
    useScene.getState().unloadScene()
    clearSceneHistory()
  }
}, 120000)
