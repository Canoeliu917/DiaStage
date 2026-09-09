import type { ParametricDescriptor } from '@pascal-app/core'
import type { PipeSegmentNode } from './schema'

export const pipeSegmentParametrics: ParametricDescriptor<PipeSegmentNode> = {
  groups: [
    {
      label: '排水',
      fields: [
        {
          key: 'system',
          kind: 'enum',
          options: ['waste', 'vent'],
          display: 'segmented',
        },
        {
          key: 'diameter',
          kind: 'number',
          unit: 'in',
          min: 1.25,
          max: 6,
          step: 0.25,
        },
      ],
    },
    {
      label: '构造',
      fields: [
        {
          key: 'pipeMaterial',
          kind: 'enum',
          options: ['pvc', 'abs', 'cast-iron'],
        },
      ],
    },
  ],
}
