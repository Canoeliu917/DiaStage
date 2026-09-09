import type { ParametricDescriptor } from '@pascal-app/core'
import type { LinesetNode } from './schema'

export const linesetParametrics: ParametricDescriptor<LinesetNode> = {
  groups: [
    {
      label: '管线',
      fields: [
        {
          key: 'suctionDiameter',
          kind: 'number',
          unit: 'in',
          min: 0.25,
          max: 1.5,
          step: 0.125,
        },
        {
          key: 'liquidDiameter',
          kind: 'number',
          unit: 'in',
          min: 0.125,
          max: 0.75,
          step: 0.125,
        },
      ],
    },
    {
      label: '保温层',
      fields: [
        {
          key: 'insulated',
          kind: 'boolean',
        },
      ],
    },
  ],
}
