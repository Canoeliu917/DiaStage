'use client'

import { type AnyNodeId, type SiteNode, useRegistry } from '@pascal-app/core'
import { NodeRenderer } from '@pascal-app/viewer'
import { useRef } from 'react'
import type { Group } from 'three'

export default function SiteRenderer({ node }: { node: SiteNode }) {
  const ref = useRef<Group>(null!)
  useRegistry(node.id, node.type, ref)

  return (
    <group ref={ref} visible={node.visible}>
      {node.children.map((childId) => (
        <NodeRenderer key={childId} nodeId={childId as AnyNodeId} />
      ))}
    </group>
  )
}
