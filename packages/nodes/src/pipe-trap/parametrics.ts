import type { ParametricDescriptor } from '@pascal-app/core'
import type { PipeTrapNode } from './schema'

export const pipeTrapParametrics: ParametricDescriptor<PipeTrapNode> = {
  groups: [
    {
      label: '存水弯',
      fields: [
        { key: 'diameter', kind: 'number', unit: 'in', min: 1.25, max: 4, step: 0.25 },
        { key: 'pipeMaterial', kind: 'enum', options: ['pvc', 'abs', 'cast-iron'] },
        { key: 'armLengthM', kind: 'number', unit: 'm', min: 0, max: 4, step: 0.05 },
      ],
    },
    {
      label: '放置',
      fields: [{ key: 'position', kind: 'vec3' }],
    },
  ],
}
