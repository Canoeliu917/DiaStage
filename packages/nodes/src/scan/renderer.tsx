'use client'

import { releaseAssetUrl, type ScanNode, useRegistry } from '@pascal-app/core'
import { useAssetUrl, useGLTFKTX2, useViewer, ViewerErrorBoundary } from '@pascal-app/viewer'
import { Html, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, type Material, Mesh, Texture } from 'three'

const activeModels = new Map<string, number>()
export const ScanRenderer = ({ node }: { node: ScanNode }) => {
  const showScans = useViewer((s) => s.showScans)
  const ref = useRef<Group>(null!)
  useRegistry(node.id, 'scan', ref)
  return (
    <group
      ref={ref}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      visible={showScans && node.visible}
    >
      {showScans && node.visible && (node.layers?.model ?? true) && node.url && (
        <ViewerErrorBoundary
          scope="scan-reference"
          resetKey={node.url}
          fallback={
            <Html center>
              <span role="alert">扫描显示失败，场景仍可编辑。请隐藏或重新导入扫描。</span>
            </Html>
          }
        >
          <ScanAsset opacity={node.opacity} url={node.url} />
        </ViewerErrorBoundary>
      )}
    </group>
  )
}
function ScanAsset({ url, opacity }: { url: string; opacity: number }) {
  const resolved = useAssetUrl(url)
  return resolved ? (
    <Suspense fallback={null}>
      <ScanModel url={resolved} sourceUrl={url} opacity={opacity} />
    </Suspense>
  ) : null
}
function ScanModel({
  url,
  sourceUrl,
  opacity,
}: {
  url: string
  sourceUrl: string
  opacity: number
}) {
  const gltf = useGLTFKTX2(url)
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true)
    const materials: Material[] = []
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return
      const clone = (material: Material) => {
        const copy = material.clone()
        materials.push(copy)
        return copy
      }
      child.material = Array.isArray(child.material)
        ? child.material.map(clone)
        : clone(child.material)
      child.raycast = () => {}
    })
    return { scene, materials, users: 0 }
  }, [gltf.scene])
  useEffect(() => {
    for (const material of model.materials) {
      material.opacity = opacity / 100
      material.transparent = opacity < 100
      material.depthWrite = opacity === 100
      material.needsUpdate = true
    }
  }, [model, opacity])
  useEffect(() => {
    model.users++
    activeModels.set(url, (activeModels.get(url) ?? 0) + 1)
    return () => {
      model.users--
      activeModels.set(url, (activeModels.get(url) ?? 1) - 1)
      // Defer final disposal one task so StrictMode's cleanup/setup pair retains live resources.
      setTimeout(() => {
        if (!model.users) for (const material of model.materials) material.dispose()
        if (!activeModels.has(url) || activeModels.get(url)) return
        activeModels.delete(url)
        const materials = new Set<Material>(),
          textures = new Set<Texture>()
        gltf.scene.traverse((child) => {
          if (!(child instanceof Mesh)) return
          child.geometry.dispose()
          for (const material of Array.isArray(child.material) ? child.material : [child.material])
            materials.add(material)
        })
        for (const material of materials) {
          for (const value of Object.values(material))
            if (value instanceof Texture) textures.add(value)
          material.dispose()
        }
        for (const texture of textures) {
          texture.dispose()
          if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
            texture.image.close()
        }
        useGLTF.clear(url)
        releaseAssetUrl(sourceUrl)
      }, 0)
    }
  }, [gltf.scene, model, sourceUrl, url])
  return <primitive object={model.scene} dispose={null} />
}
export default ScanRenderer
