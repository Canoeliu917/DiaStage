import { expect, test } from 'bun:test'
import { type AnyNode, type GeometryContext, LevelNode, useScene } from '@pascal-app/core'
import { Box3 } from 'three'
import { cabinetFloorPlacedFootprints } from '../definition'
import { buildCabinetGeometry } from '../geometry'
import { instantiateCabinetPlacement, resolveCabinetPlacementTemplate } from '../placement-template'
import { CABINET_PRESETS } from '../presets'
import fixtures from './placement-library-fixtures.json'

test('all nine native presets retain their stack and tall cabinet settings', () => {
  expect(CABINET_PRESETS).toHaveLength(9)
  for (const preset of CABINET_PRESETS) {
    const template = resolveCabinetPlacementTemplate({ presetId: preset.id })
    const patch = preset.createPatch()
    const module = template.modules[0]!
    expect(module.width).toBe(patch.width)
    expect(module.cabinetType).toBe(patch.cabinetType)
    expect(module.stack?.map(({ type }) => type)).toEqual(patch.stack?.map(({ type }) => type))
    expect(module.parentId).toBe(template.run.id)
    expect(module.position).toEqual([0, template.run.plinthHeight, 0])
    expect(template.run.withCountertop).toBe(module.cabinetType !== 'tall')
    expect(template.run.runTier).toBe(module.cabinetType === 'tall' ? 'tall' : 'base')
  }
  expect(resolveCabinetPlacementTemplate().modules[0]!.name).toBe('Base Cabinet')
})

test('published cabinet and island retain their full modules, sink, and relative placement', () => {
  const before = JSON.stringify(fixtures)
  for (const fixture of fixtures) {
    const template = resolveCabinetPlacementTemplate({
      nodeData: fixture.nodeData,
      presetId: 'base-door',
    })
    expect(template.snapshot).toBe(true)
    expect(template.modules).toHaveLength(fixture.nodeData.descendants.length)
    expect(template.run.parentId).toBeNull()
    expect(template.run.children).toEqual(template.modules.map(({ id }) => id))
    template.modules.forEach((module, index) => {
      const source = fixture.nodeData.descendants[index]!
      expect(module.id).not.toBe(source.id)
      expect(module.parentId).toBe(template.run.id)
      expect(module.width).toBe(source.width)
      expect(module.stack?.map(({ type }) => type)).toEqual(source.stack?.map(({ type }) => type))
      expect(module.position[0] - template.modules[0]!.position[0]).toBeCloseTo(
        source.position[0]! - fixture.nodeData.descendants[0]!.position[0]!,
      )
      expect(module.position[1]).toBe(source.position[1]!)
    })
    expect(template.run.countertopBackOverhang).toBe(fixture.nodeData.root.countertopBackOverhang)
    const bounds = cabinetFloorPlacedFootprints(
      template.run,
      Object.fromEntries(template.modules.map((node) => [node.id, node as AnyNode])),
    )
    expect(bounds).toHaveLength(template.modules.length)
    expect(
      Math.min(...bounds.map(({ position, dimensions }) => position[0] - dimensions[0] / 2)),
    ).toBeCloseTo(-template.run.width / 2)
    expect(
      Math.max(...bounds.map(({ position, dimensions }) => position[0] + dimensions[0] / 2)),
    ).toBeCloseTo(template.run.width / 2)
  }
  expect(JSON.stringify(fixtures)).toBe(before)
  const island = resolveCabinetPlacementTemplate({ nodeData: fixtures[1]!.nodeData })
  expect(island.modules).toHaveLength(3)
  expect(island.modules[1]!.stack?.some(({ type }) => type === 'sink')).toBe(true)
  expect(island.run.countertopBackOverhang).toBe(0.42)
})

test('library templates generate nonempty root and module geometry', () => {
  for (const fixture of fixtures) {
    const { run, modules } = resolveCabinetPlacementTemplate({ nodeData: fixture.nodeData })
    const nodes = Object.fromEntries([run, ...modules].map((node) => [node.id, node]))
    const context: GeometryContext = {
      resolve: (id) => nodes[id] as never,
      parent: null,
      children: modules,
      siblings: [],
    }
    const rootGeometry = buildCabinetGeometry(run, context)
    expect(new Box3().setFromObject(rootGeometry).isEmpty()).toBe(false)
    for (const module of modules) {
      const child = buildCabinetGeometry(module, { ...context, children: [], parent: run })
      expect(new Box3().setFromObject(child).isEmpty()).toBe(false)
    }
  }
})

test('preparing a complete library assembly leaves the scene untouched and one create is one undo', () => {
  const original = useScene.getState()
  const level = LevelNode.parse({})
  useScene.setState({ nodes: { [level.id]: level }, rootNodeIds: [level.id], readOnly: false })
  useScene.temporal.getState().clear()
  try {
    const before = useScene.getState().nodes
    const template = resolveCabinetPlacementTemplate({ nodeData: fixtures[1]!.nodeData })
    const { run, modules } = instantiateCabinetPlacement(template, [4, 0, 2], Math.PI / 2, level.id)
    expect(useScene.getState().nodes).toBe(before)
    expect(useScene.temporal.getState().pastStates).toHaveLength(0)
    expect(new Set([run.id, ...modules.map(({ id }) => id)]).size).toBe(4)
    expect(run.id).not.toBe(template.run.id)
    expect(run.position).toEqual([4, 0, 2])
    expect(run.rotation).toBe(Math.PI / 2)
    useScene
      .getState()
      .createNodes([
        { node: run, parentId: level.id },
        ...modules.map((node) => ({ node, parentId: run.id })),
      ])
    expect(Object.keys(useScene.getState().nodes)).toHaveLength(5)
    expect(useScene.getState().nodes[run.id]!.children).toEqual(modules.map(({ id }) => id))
    expect(useScene.temporal.getState().pastStates).toHaveLength(1)
    useScene.temporal.getState().undo()
    expect(useScene.getState().nodes).toEqual(before)
  } finally {
    useScene.setState(original)
    useScene.temporal.getState().clear()
  }
})
