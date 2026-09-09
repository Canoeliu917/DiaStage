import { type AnyNodeId, CabinetModuleNode, CabinetNode } from '@pascal-app/core'
import { CABINET_PRESETS, cabinetPresetById } from './presets'

export type CabinetPlacementTemplate = {
  run: CabinetNode
  modules: CabinetModuleNode[]
  snapshot: boolean
}

export function resolveCabinetPlacementTemplate(
  defaults?: Record<string, unknown>,
): CabinetPlacementTemplate {
  const snapshot = defaults?.nodeData as { root: unknown; descendants: unknown[] } | undefined
  if (snapshot) {
    const sourceRun = CabinetNode.parse(snapshot.root)
    const modules = snapshot.descendants.map((node) => CabinetModuleNode.parse(node))
    if (
      modules.length === 0 ||
      modules.some((node) => node.parentId !== sourceRun.id || node.children.length > 0) ||
      modules.length !== sourceRun.children.length ||
      modules.some((node) => !sourceRun.children.includes(node.id))
    ) {
      throw new Error('橱柜预设必须包含柜列及其完整的直接模块。')
    }
    // Library runs may store the modules away from their root's origin. Move
    // the whole arrangement to the cursor without changing relative offsets.
    const minX = Math.min(...modules.map((node) => node.position[0] - node.width / 2))
    const maxX = Math.max(...modules.map((node) => node.position[0] + node.width / 2))
    const minZ = Math.min(...modules.map((node) => node.position[2] - node.depth / 2))
    const maxZ = Math.max(...modules.map((node) => node.position[2] + node.depth / 2))
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2
    const run = CabinetNode.parse({
      ...sourceRun,
      id: undefined,
      parentId: null,
      children: [],
      position: [0, 0, 0],
      rotation: 0,
      supportSlabId: undefined,
      width: maxX - minX,
      depth: maxZ - minZ,
    })
    const copied = modules.map((node) =>
      CabinetModuleNode.parse({
        ...node,
        id: undefined,
        parentId: run.id,
        position: [node.position[0] - centerX, node.position[1], node.position[2] - centerZ],
        supportSlabId: undefined,
      }),
    )
    run.children = copied.map((node) => node.id)
    return { run, modules: copied, snapshot: true }
  }

  const preset =
    CABINET_PRESETS.find((candidate) => candidate.id === defaults?.presetId) ??
    cabinetPresetById('base-door')
  const module = CabinetModuleNode.parse(preset.createPatch())
  const run = CabinetNode.parse({
    name: 'Modular Cabinet',
    width: module.width,
    depth: module.depth,
    carcassHeight: module.carcassHeight,
    runTier: module.cabinetType === 'tall' ? 'tall' : 'base',
    withCountertop: module.cabinetType !== 'tall',
  })
  module.parentId = run.id
  module.position = [0, run.showPlinth ? run.plinthHeight : 0, 0]
  run.children = [module.id]
  return { run, modules: [module], snapshot: false }
}

export function instantiateCabinetPlacement(
  template: CabinetPlacementTemplate,
  position: [number, number, number],
  rotation: number,
  parentId: AnyNodeId,
): { run: CabinetNode; modules: CabinetModuleNode[] } {
  const run = CabinetNode.parse({
    ...template.run,
    id: undefined,
    parentId,
    children: [],
    position,
    rotation,
  })
  const modules = template.modules.map((node) =>
    CabinetModuleNode.parse({ ...node, id: undefined, parentId: run.id }),
  )
  run.children = modules.map((node) => node.id)
  return { run, modules }
}
