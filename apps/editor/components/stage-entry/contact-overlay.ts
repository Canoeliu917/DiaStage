import { BATCHED_LAYER, OVERLAY_LAYER, SCENE_LAYER } from '@pascal-app/viewer'
import { BackSide, DoubleSide, Group, Matrix4, Mesh, type Object3D } from 'three'
import {
  cameraProjectionMatrix,
  modelScale,
  modelViewMatrix,
  normalLocal,
  positionLocal,
  screenSize,
  vec4,
} from 'three/tsl'
import { ClippingGroup, MeshBasicNodeMaterial } from 'three/webgpu'
import { DIA_COLORS } from '@/lib/visual-system'

export function createStageContactOverlay(selection = false) {
  const group = new Group()
  group.name = selection ? 'stage-selection-feedback' : 'stage-contact-feedback'
  group.layers.set(OVERLAY_LAYER)
  const material = new MeshBasicNodeMaterial({
    color: DIA_COLORS.error,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const feedbackMaterials = selection
    ? [
        [3, 0.12, DIA_COLORS.ink],
        [1.75, 0.65, DIA_COLORS.ink],
        [0.5, 0.8, DIA_COLORS.ivory],
      ].map(([width, opacity, color]) => {
        const outline = new MeshBasicNodeMaterial({
          color: color as string,
          opacity: opacity as number,
          transparent: true,
          side: BackSide,
          depthWrite: false,
          toneMapped: false,
        })
        // Pixel-sized feedback stays delicate in close-ups and orthographic views.
        const clip = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(positionLocal, 1)))
        const worldPerPixel = clip.w
          .abs()
          .mul(2)
          .div(
            cameraProjectionMatrix
              .mul(vec4(0, 1, 0, 0))
              .y.abs()
              .mul(screenSize.y),
          )
        outline.positionNode = positionLocal.add(
          normalLocal.div(modelScale).mul(worldPerPixel.mul(width as number)),
        )
        return outline
      })
    : [material]
  const inverse = new Matrix4()
  const entries = new Map<
    string,
    {
      source: Object3D
      children: Object3D[]
      revision: number
      settled: unknown
      snapshot: unknown
      meshes: Map<Mesh, Mesh[]>
      container: ClippingGroup
      section: ClippingGroup | null
    }
  >()
  const remove = (id: string) => {
    const entry = entries.get(id)
    if (entry) group.remove(entry.container)
    entries.delete(id)
  }
  return {
    group,
    sync(
      ids: ReadonlySet<string>,
      sources: ReadonlyMap<string, Object3D>,
      revision: number,
      snapshot: unknown,
    ) {
      for (const id of entries.keys()) if (!ids.has(id)) remove(id)
      group.updateWorldMatrix(true, false)
      inverse.copy(group.matrixWorld).invert()
      for (const id of ids) {
        const source = sources.get(id)
        let visible = Boolean(source)
        for (let parent = source; parent; parent = parent.parent ?? undefined)
          if (!parent.visible) visible = false
        if (!source || !visible) {
          remove(id)
          continue
        }
        let entry = entries.get(id)
        if (
          !entry ||
          entry.source !== source ||
          entry.revision !== revision ||
          entry.settled !== source.userData.itemModelSettled ||
          entry.children.length !== source.children.length ||
          entry.children.some((child, index) => child !== source.children[index])
        ) {
          remove(id)
          entry = {
            source,
            children: [...source.children],
            revision,
            settled: source.userData.itemModelSettled,
            snapshot: null,
            meshes: new Map(),
            container: new ClippingGroup(),
            section: null,
          }
          entry.container.layers.set(OVERLAY_LAYER)
          entry.container.enabled = false
          group.add(entry.container)
          source.traverseVisible((child) => {
            if (child instanceof ClippingGroup) entry!.section = child
            if (
              !(child instanceof Mesh) ||
              (!child.layers.isEnabled(SCENE_LAYER) && !child.layers.isEnabled(BATCHED_LAYER)) ||
              !child.geometry.getAttribute('position')?.count
            )
              return
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            if (!materials.some((value) => value.visible && value.opacity > 0)) return
            // Borrow geometry and skeletal pose; never recolor or dispose a catalog asset.
            const copies = feedbackMaterials.map((feedbackMaterial, index) => {
              const mesh = child.clone(false)
              mesh.name = `stage-contact:${id}`
              mesh.material = feedbackMaterial
              mesh.matrixAutoUpdate = false
              mesh.layers.set(OVERLAY_LAYER)
              mesh.renderOrder = 900 + (selection ? index + 1 : 0)
              mesh.castShadow = false
              mesh.receiveShadow = false
              mesh.raycast = () => {}
              entry!.container.add(mesh)
              return mesh
            })
            entry!.meshes.set(child, copies)
          })
          entries.set(id, entry)
        }
        entry.container.enabled = entry.section?.enabled ?? false
        entry.container.clippingPlanes = entry.section?.clippingPlanes ?? []
        if (entry.snapshot === snapshot && !source.userData.itemHasAnimations) continue
        entry.snapshot = snapshot
        source.updateWorldMatrix(true, true)
        for (const [original, copies] of entry.meshes)
          for (const mesh of copies) {
            mesh.geometry = original.geometry
            mesh.matrix.copy(inverse).multiply(original.matrixWorld)
            mesh.matrixWorldNeedsUpdate = true
          }
      }
      group.userData.contactIds = [...entries]
        .filter(([, entry]) => entry.meshes.size > 0)
        .map(([id]) => id)
    },
    dispose() {
      group.clear()
      entries.clear()
      material.dispose()
      if (selection) for (const outline of feedbackMaterials) outline.dispose()
    },
  }
}
