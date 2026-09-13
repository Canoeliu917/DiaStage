'use client'

import { ItemSystem } from '@pascal-app/viewer'
import { NodeBatchSystem } from '../shared/node-batch/system'

/**
 * Registry-driven item system bundle.
 *
 *  - **`ItemSystem`** — applies item transforms.
 *  - **`NodeBatchSystem`** — once nodes stop changing, draws items, columns
 *    and wall-hosted openings through per-material BatchedMeshes; lit or
 *    edited nodes draw themselves (see ../shared/node-batch/types.ts).
 *    Mounted from the item bundle because it must mount exactly once and
 *    every registered kind's system mounts scene-wide.
 */
const ItemSystems = () => {
  return (
    <>
      <ItemSystem />
      <NodeBatchSystem />
    </>
  )
}

export default ItemSystems
