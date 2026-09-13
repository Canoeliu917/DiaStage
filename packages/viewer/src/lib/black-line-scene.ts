import {
  type BufferGeometry,
  Color,
  EdgesGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  type Object3D,
  Scene,
} from 'three'
import { OVERLAY_LAYER, SCENE_LAYER } from './layers'

type Style = 'white' | 'colored' | 'hidden' | undefined

/** Detached display geometry: never replace asset materials or attach exportable helpers. */
export function createBlackLineScene() {
  const scene = new Scene()
  scene.background = new Color('#000000')
  const entries = new Map<
    Mesh | Line,
    {
      geometry: BufferGeometry
      copies: Object3D[]
      edges?: EdgesGeometry
      material?: LineBasicMaterial
    }
  >()
  const remove = (source: Mesh | Line) => {
    const entry = entries.get(source)!
    scene.remove(...entry.copies)
    entry.edges?.dispose()
    entry.material?.dispose()
    entries.delete(source)
  }
  return {
    scene,
    sync(
      root: Object3D,
      selected: ReadonlySet<Object3D>,
      previews: ReadonlySet<Object3D> = new Set(),
    ) {
      root.updateMatrixWorld(true)
      const current = new Set<Mesh | Line>()
      const visit = (
        object: Object3D,
        inherited: Style,
        highlighted: boolean,
        previewing: boolean,
      ) => {
        if (!object.visible) return
        const style: Style =
          object.userData.viewerLineStyle ??
          (object.name === 'scene-renderer' ? 'white' : inherited)
        if (style === 'hidden') return
        const active = highlighted || selected.has(object)
        const preview = previewing || previews.has(object)
        const overlay = object.layers.isEnabled(OVERLAY_LAYER)
        if (
          (object instanceof Mesh || object instanceof Line) &&
          (style || overlay) &&
          (object.layers.isEnabled(SCENE_LAYER) || overlay) &&
          object.geometry.getAttribute('position')?.count
        ) {
          const materials: Material[] = Array.isArray(object.material)
            ? object.material
            : [object.material]
          const original = materials.find((material) => material.visible && material.opacity > 0)
          if (original) {
            const isLine = object instanceof Line || 'isLineSegments2' in object
            current.add(object)
            let entry = entries.get(object)
            const count = object instanceof InstancedMesh ? object.count : 1
            if (entry && (entry.geometry !== object.geometry || entry.copies.length !== count)) {
              remove(object)
              entry = undefined
            }
            if (!entry) {
              const edges = isLine ? undefined : new EdgesGeometry(object.geometry, 20)
              const material = edges
                ? new LineBasicMaterial({ color: '#ffffff', toneMapped: false, depthTest: false })
                : undefined
              const copies = Array.from({ length: count }, () => {
                const copy =
                  edges && material ? new LineSegments(edges, material) : object.clone(false)
                copy.matrixAutoUpdate = false
                copy.frustumCulled = false
                copy.layers.set(SCENE_LAYER)
                copy.raycast = () => {}
                scene.add(copy)
                return copy
              })
              entry = { geometry: object.geometry, copies, edges, material }
              entries.set(object, entry)
            }
            if (entry.material) {
              const colored = style === 'colored' || overlay
              const color = (original as Material & { color?: Color }).color
              entry.material.color.set(
                colored && color ? color : preview ? '#60a5fa' : active ? '#a8d8ff' : '#ffffff',
              )
              entry.material.transparent = colored || preview
              entry.material.opacity = colored || preview ? 0.85 : 1
            }
            for (const [index, copy] of entry.copies.entries()) {
              if (object instanceof InstancedMesh) {
                object.getMatrixAt(index, copy.matrix)
                copy.matrix.premultiply(object.matrixWorld)
              } else {
                copy.matrix.copy(object.matrixWorld)
              }
              if (isLine) (copy as Line).material = object.material
              copy.matrixWorldNeedsUpdate = true
              copy.renderOrder = overlay || style === 'colored' ? 1 : 0
            }
          }
        }
        for (const child of object.children) visit(child, style, active, preview)
      }
      visit(root, undefined, false, false)
      for (const source of entries.keys()) if (!current.has(source)) remove(source)
    },
    dispose() {
      for (const source of entries.keys()) remove(source)
    },
  }
}
