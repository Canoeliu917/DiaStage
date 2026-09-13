import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'bun:test'
import { clearSceneHistory, useScene } from '@pascal-app/core'
import { diaRemoteSnapshot } from '../../components/theatre/dia-remote-bridge'
import { BETA_REHEARSAL_ENABLED } from '../beta-capabilities'
import { SceneJournal } from '../scene-journal'
import { migrateStudioGroup, migrateStudioPanel } from '../studio-workspaces'
import { bindRehearsalScene, clearProposalGhost, useProposalGhost } from './authority'
import { DiaConversation } from './conversation-controller'
import { createSyntheticDemoScene } from './synthetic-demo'

globalThis.requestAnimationFrame ??= () => 0
globalThis.cancelAnimationFrame ??= () => {}
const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  clearProposalGhost()
  useScene.getState().unloadScene()
  clearSceneHistory()
})

async function setup(rehearsalEnabled = BETA_REHEARSAL_ENABLED) {
  const graph = createSyntheticDemoScene()
  const sceneId = crypto.randomUUID()
  useScene.getState().setReadOnly(false)
  useScene.getState().setScene(graph.nodes, graph.rootNodeIds, graph)
  const journal = new SceneJournal(sceneId)
  await journal.recover(useScene.getState(), 1)
  disposers.push(bindRehearsalScene(sceneId, () => journal.assertCurrent()))
  const controller = new DiaConversation(sceneId, () => null, undefined, rehearsalEnabled)
  disposers.push(() => controller.dispose())
  await controller.load()
  expect(controller.store.getState().ready).toBe(true)
  return { controller, sceneId }
}

test('0.1 maps historical workspaces and hidden panels to Build or basic View', () => {
  expect(BETA_REHEARSAL_ENABLED).toBe(false)
  for (const value of ['rehearse', 'director', 'lighting', 'timeline', 'video'])
    expect(migrateStudioGroup(value)).toBe('set')
  for (const value of ['simulation', 'theatre-roles', 'theatre-paths', 'lighting', 'sequencer'])
    expect(migrateStudioPanel(value)).toBe('items')
  for (const value of ['camera-studio', 'camera-rehearsal', 'record', 'observe'])
    expect(migrateStudioPanel(value)).toBe('view')
  expect(migrateStudioPanel('versions')).toBe('versions')
  expect(migrateStudioGroup('remount')).toBe('remount')
})

test('0.1 Dia refuses rehearsal, lighting and production commands without scene writes', async () => {
  const { controller } = await setup()
  const before = useScene.getState().nodes
  for (const command of [
    '安排人物走位',
    '给我两个排法',
    'CREATE_ROUTE',
    'PLACE_PERFORMER',
    '调整灯光',
    '添加灯具',
    'Cue 1',
    '打开 Timeline',
    'Camera Animation',
    'First Person',
  ]) {
    await controller.send(command)
    expect(controller.proposal()).toBeUndefined()
    expect(controller.buildProposal()).toBeUndefined()
    expect(controller.store.getState().interaction).toBeNull()
    expect(useProposalGhost.getState().visible).toBe(false)
    expect(useScene.getState().nodes).toBe(before)
  }
  const remote = diaRemoteSnapshot(controller)
  expect(remote.stage.performers).toEqual([])
  expect(remote.stage.paths).toEqual([])
  expect(remote.proposals).toEqual([])
})

test('0.1 keeps Build preview and rejection behind human authority', async () => {
  const { controller } = await setup()
  const before = useScene.getState().nodes
  await controller.send('一张圆桌，两把硬椅')
  const proposal = controller.buildProposal()!
  expect(proposal.plan.items).toHaveLength(3)
  await controller.adopt()
  expect(useScene.getState().nodes).toBe(before)
  await controller.preview()
  expect(controller.buildProposal()!.status).toBe('previewed')
  expect(useScene.getState().nodes).toBe(before)
  await controller.reject()
  expect(controller.buildProposal()!.status).toBe('rejected')
  expect(useScene.getState().nodes).toBe(before)
})

test('0.1 can read old dialogue but cannot resume its rehearsal or publish it to the phone', async () => {
  const { controller: legacy, sceneId } = await setup(true)
  await legacy.send('给我两个排法')
  expect(legacy.proposal()).toBeDefined()
  legacy.dispose()
  const before = useScene.getState().nodes
  const current = new DiaConversation(sceneId, () => null, undefined, false)
  disposers.push(() => current.dispose())
  await current.load()
  expect(current.store.getState().thread!.messages.length).toBeGreaterThan(0)
  expect(current.store.getState().interaction).not.toBeNull()
  expect(current.proposal()).toBeUndefined()
  await current.preview()
  await current.adopt()
  expect(useProposalGhost.getState().visible).toBe(false)
  expect(diaRemoteSnapshot(current).proposals).toEqual([])
  expect(useScene.getState().nodes).toBe(before)
})
