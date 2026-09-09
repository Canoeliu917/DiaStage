import type { LeanToExtensionNode, ParametricDescriptor } from '@pascal-app/core'
import { leanToLowEdgeHeight, MIN_LEAN_TO_POST_HEIGHT, resolveLeanToLayout } from './layout'

const degrees = (rise: number, run: number) =>
  Math.max(1, Math.min(45, (Math.atan2(rise, Math.max(0.001, run)) * 180) / Math.PI))

const COVERING_MIN_PITCH: Record<LeanToExtensionNode['coveringType'], number | null> = {
  generic: null,
  shingle: 9.5,
  'metal-panel': 2,
}

export function deriveLeanToResizePatch(
  previous: LeanToExtensionNode,
  patch: Partial<LeanToExtensionNode>,
): Partial<LeanToExtensionNode> {
  const changesProjection = Object.hasOwn(patch, 'projection')
  const changesHigh = Object.hasOwn(patch, 'highEdgeHeight')
  const changesLow = Object.hasOwn(patch, 'lowEdgeHeight')
  const changesPitch = Object.hasOwn(patch, 'pitch')
  if (!(changesProjection || changesHigh || changesLow || changesPitch)) return {}

  const projection = patch.projection ?? previous.projection
  let highEdgeHeight = patch.highEdgeHeight ?? previous.highEdgeHeight
  let pitch = patch.pitch ?? previous.pitch
  let lowEdgeHeight = leanToLowEdgeHeight(previous)

  if (changesLow) {
    lowEdgeHeight = patch.lowEdgeHeight ?? lowEdgeHeight
    if (previous.resizeLock === 'preserve-pitch') {
      highEdgeHeight = lowEdgeHeight + projection * Math.tan((pitch * Math.PI) / 180)
    } else {
      pitch = degrees(highEdgeHeight - lowEdgeHeight, projection)
      lowEdgeHeight = highEdgeHeight - projection * Math.tan((pitch * Math.PI) / 180)
    }
  } else if (changesProjection && !changesHigh && !changesPitch) {
    if (previous.resizeLock === 'preserve-high-edge') {
      pitch = degrees(highEdgeHeight - lowEdgeHeight, projection)
    } else if (previous.resizeLock === 'preserve-low-edge') {
      highEdgeHeight = lowEdgeHeight + projection * Math.tan((pitch * Math.PI) / 180)
    } else {
      lowEdgeHeight = highEdgeHeight - projection * Math.tan((pitch * Math.PI) / 180)
    }
  } else if (changesPitch && !changesHigh) {
    if (previous.resizeLock === 'preserve-low-edge') {
      highEdgeHeight = lowEdgeHeight + projection * Math.tan((pitch * Math.PI) / 180)
    } else {
      lowEdgeHeight = highEdgeHeight - projection * Math.tan((pitch * Math.PI) / 180)
    }
  } else if (changesHigh && !changesPitch) {
    if (previous.resizeLock === 'preserve-low-edge') {
      pitch = degrees(highEdgeHeight - lowEdgeHeight, projection)
    }
    lowEdgeHeight = highEdgeHeight - projection * Math.tan((pitch * Math.PI) / 180)
  } else {
    lowEdgeHeight = highEdgeHeight - projection * Math.tan((pitch * Math.PI) / 180)
  }

  return { highEdgeHeight, lowEdgeHeight, pitch }
}

export const leanToExtensionParametrics: ParametricDescriptor<LeanToExtensionNode> = {
  derive: (next, patch, previous = next) => {
    return {
      ...(patch.canopyForm === 'gable' || patch.canopyForm === 'butterfly'
        ? { highSideMode: 'independent-high-beam' as const, autoSpan: false }
        : {}),
      ...(patch.connectionMode === 'manual'
        ? {
            hostRoofId: undefined,
            hostRoofSegmentId: undefined,
            hostRoofEdge: undefined,
            hostRoofEdgeRange: undefined,
            connectionInset: 0,
          }
        : {}),
      ...('roofThickness' in patch || 'shingleThickness' in patch
        ? { matchHostRoofStructure: false }
        : {}),
      ...('span' in patch ? { autoSpan: false } : {}),
      ...(previous.hostKind === 'slab-edge' && typeof patch.highEdgeHeight === 'number'
        ? {
            hostHeightOffset:
              previous.hostHeightOffset + patch.highEdgeHeight - previous.highEdgeHeight,
          }
        : {}),
      ...deriveLeanToResizePatch(previous, patch),
    }
  },
  groups: [
    {
      label: '尺寸',
      fields: [
        {
          key: 'canopyForm',
          label: '屋顶形式',
          kind: 'enum',
          options: ['mono', 'gable', 'butterfly'],
          display: 'segmented',
          visibleIf: (node) => node.hostKind === 'freestanding',
        },
        {
          key: 'autoSpan',
          label: '匹配主体宽度',
          kind: 'boolean',
          visibleIf: (node) => node.hostKind !== 'freestanding',
        },
        {
          key: 'span',
          label: '宽度',
          kind: 'number',
          unit: 'm',
          min: 0.5,
          max: 1000,
          step: 0.1,
        },
        {
          key: 'projection',
          label: '挑出长度',
          kind: 'number',
          unit: 'm',
          min: 0.5,
          max: 1000,
          step: 0.1,
        },
        {
          key: 'highEdgeHeight',
          label: '高边高度',
          kind: 'number',
          unit: 'm',
          min: 0.8,
          max: 1000,
          step: 0.05,
          visibleIf: (node) => node.connectionMode === 'manual' || !node.hostRoofSegmentId,
        },
        {
          key: 'pitch',
          label: '坡度',
          kind: 'number',
          unit: '°',
          min: 1,
          max: 45,
          step: 1,
        },
      ],
    },
    {
      label: '连接',
      fields: [
        {
          key: 'connectionMode',
          label: '屋顶连接',
          kind: 'enum',
          options: ['auto', 'manual'],
          display: 'segmented',
          visibleIf: (node) => node.hostKind === 'wall',
        },
        {
          key: 'highSideMode',
          label: '高侧支撑',
          kind: 'enum',
          options: ['wall-ledger', 'independent-high-beam'],
          visibleIf: (node) => node.hostKind === 'wall',
        },
        {
          key: 'connectionOffset',
          label: '连接偏移',
          kind: 'number',
          unit: 'm',
          min: -1,
          max: 1,
          step: 0.01,
          visibleIf: (node) => node.connectionMode === 'auto' && Boolean(node.hostRoofSegmentId),
        },
        {
          key: 'matchHostRoofMaterial',
          label: '匹配主体屋顶材质',
          kind: 'boolean',
          visibleIf: (node) => node.connectionMode === 'auto' && Boolean(node.hostRoofId),
        },
        {
          key: 'matchHostRoofStructure',
          label: '匹配主体屋顶结构',
          kind: 'boolean',
          visibleIf: (node) => node.connectionMode === 'auto' && Boolean(node.hostRoofId),
        },
      ],
    },
    {
      label: '结构',
      fields: [
        {
          key: 'postLayoutMode',
          label: '立柱布局',
          kind: 'enum',
          options: ['count', 'target-spacing'],
        },
        {
          key: 'postCount',
          label: '立柱数量',
          kind: 'number',
          min: 2,
          max: 20,
          step: 1,
          visibleIf: (node) => node.postLayoutMode === 'count',
        },
        {
          key: 'postSpacing',
          label: '立柱间距',
          kind: 'number',
          unit: 'm',
          min: 0.3,
          max: 1000,
          step: 0.1,
          visibleIf: (node) => node.postLayoutMode === 'target-spacing',
        },
        {
          key: 'postWidth',
          label: '立柱宽度',
          kind: 'number',
          unit: 'm',
          min: 0.05,
          max: 0.6,
          step: 0.01,
        },
        {
          key: 'postDepth',
          label: '立柱深度',
          kind: 'number',
          unit: 'm',
          min: 0.05,
          max: 0.6,
          step: 0.01,
        },
        {
          key: 'beamHeight',
          label: '梁高',
          kind: 'number',
          unit: 'm',
          min: 0.05,
          max: 0.8,
          step: 0.01,
        },
        {
          key: 'beamWidth',
          label: '梁宽',
          kind: 'number',
          unit: 'm',
          min: 0.05,
          max: 0.6,
          step: 0.01,
        },
        {
          key: 'framingStrategy',
          label: '构架',
          kind: 'enum',
          options: ['hidden', 'rafters', 'purlins', 'covering-specific'],
        },
        {
          key: 'autoMiterCorners',
          label: '自动斜接转角',
          kind: 'boolean',
        },
      ],
    },
    {
      label: '排水',
      fields: [
        { key: 'gutterEnabled', label: '檐沟', kind: 'boolean' },
        {
          key: 'gutterProfile',
          label: '檐沟截面',
          kind: 'enum',
          options: ['k-style', 'half-round', 'box'],
          visibleIf: (node) => node.gutterEnabled,
        },
        {
          key: 'gutterSize',
          label: '檐沟尺寸',
          kind: 'number',
          unit: 'm',
          min: 0.04,
          max: 0.3,
          step: 0.01,
          visibleIf: (node) => node.gutterEnabled,
        },
        {
          key: 'downspoutEnabled',
          label: '落水管',
          kind: 'boolean',
          visibleIf: (node) => node.gutterEnabled,
        },
        {
          key: 'downspoutPosition',
          label: '落水管位置',
          kind: 'number',
          min: -1,
          max: 1,
          step: 0.05,
          visibleIf: (node) => node.gutterEnabled && node.downspoutEnabled,
        },
      ],
    },
    {
      label: '高级',
      fields: [
        {
          key: 'resizeLock',
          label: '调整尺寸时',
          kind: 'enum',
          options: ['preserve-high-edge', 'preserve-low-edge', 'preserve-pitch'],
        },
        {
          key: 'lowEdgeHeight',
          label: '外侧边缘高度',
          kind: 'number',
          unit: 'm',
          min: 0.2,
          max: 1000,
          step: 0.05,
          visibleIf: (node) => node.connectionMode === 'manual' || !node.hostRoofSegmentId,
        },
        {
          key: 'roofThickness',
          label: '屋顶厚度',
          kind: 'number',
          unit: 'm',
          min: 0.02,
          max: 0.5,
          step: 0.01,
        },
        {
          key: 'shingleThickness',
          label: '屋面瓦厚度',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 0.5,
          step: 0.005,
        },
        {
          key: 'coveringType',
          label: '屋面覆盖层',
          kind: 'enum',
          options: ['generic', 'shingle', 'metal-panel'],
        },
        {
          key: 'highOverhang',
          label: '高侧挑檐',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 1.5,
          step: 0.05,
        },
        {
          key: 'lowOverhang',
          label: '外侧挑檐',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 1.5,
          step: 0.05,
        },
        {
          key: 'leftOverhang',
          label: '左侧挑檐',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 1.5,
          step: 0.05,
        },
        {
          key: 'rightOverhang',
          label: '右侧挑檐',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 1.5,
          step: 0.05,
        },
        { key: 'sideFlashing', label: '侧边泛水', kind: 'boolean' },
        {
          key: 'flashingProjection',
          label: '泛水挑出',
          kind: 'number',
          unit: 'm',
          min: 0.01,
          max: 0.5,
          step: 0.005,
          visibleIf: (node) => node.sideFlashing,
        },
        {
          key: 'flashingHeight',
          label: '泛水高度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.5,
          step: 0.01,
          visibleIf: (node) => node.sideFlashing,
        },
        {
          key: 'leftEndCondition',
          label: '左端',
          kind: 'enum',
          options: ['open', 'wall-abutment', 'joined'],
        },
        {
          key: 'rightEndCondition',
          label: '右端',
          kind: 'enum',
          options: ['open', 'wall-abutment', 'joined'],
        },
        {
          key: 'ledgerVerticalOffset',
          label: '高位梁偏移',
          kind: 'number',
          unit: 'm',
          min: -1,
          max: 1,
          step: 0.01,
          visibleIf: (node) => node.highSideMode === 'independent-high-beam',
        },
        {
          key: 'ledgerDepth',
          label: '高位梁深度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.5,
          step: 0.01,
          visibleIf: (node) => node.highSideMode === 'independent-high-beam',
        },
        {
          key: 'ledgerHeight',
          label: '高位梁高度',
          kind: 'number',
          unit: 'm',
          min: 0.05,
          max: 0.8,
          step: 0.01,
          visibleIf: (node) => node.highSideMode === 'independent-high-beam',
        },
        {
          key: 'lowBeamInset',
          label: '梁退距',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 2,
          step: 0.05,
        },
        {
          key: 'postInset',
          label: '立柱内缩',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 3,
          step: 0.05,
        },
        {
          key: 'rafterWidth',
          label: '椽条宽度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.4,
          step: 0.01,
          visibleIf: (node) => node.framingStrategy === 'rafters',
        },
        {
          key: 'rafterHeight',
          label: '椽条高度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.5,
          step: 0.01,
        },
        {
          key: 'rafterSpacing',
          label: '椽条间距',
          kind: 'number',
          unit: 'm',
          min: 0.2,
          max: 3,
          step: 0.05,
          visibleIf: (node) => node.framingStrategy === 'rafters',
        },
        {
          key: 'rafterEndInset',
          label: '椽条端部内缩',
          kind: 'number',
          unit: 'm',
          min: 0,
          max: 3,
          step: 0.05,
          visibleIf: (node) => node.framingStrategy === 'rafters',
        },
        {
          key: 'purlinWidth',
          label: '檩条宽度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.4,
          step: 0.01,
          visibleIf: (node) =>
            node.framingStrategy === 'purlins' || node.framingStrategy === 'covering-specific',
        },
        {
          key: 'purlinHeight',
          label: '檩条高度',
          kind: 'number',
          unit: 'm',
          min: 0.03,
          max: 0.5,
          step: 0.01,
          visibleIf: (node) =>
            node.framingStrategy === 'purlins' || node.framingStrategy === 'covering-specific',
        },
        {
          key: 'purlinSpacing',
          label: '檩条间距',
          kind: 'number',
          unit: 'm',
          min: 0.2,
          max: 3,
          step: 0.05,
          visibleIf: (node) =>
            node.framingStrategy === 'purlins' || node.framingStrategy === 'covering-specific',
        },
        {
          key: 'postBracing',
          label: '立柱支撑',
          kind: 'enum',
          options: ['none', 'knee'],
        },
        {
          key: 'footingStyle',
          label: '基础墩',
          kind: 'enum',
          options: ['none', 'base-plate', 'concrete-pad'],
        },
      ],
    },
  ],
  invariants: [
    (node) => {
      const layout = resolveLeanToLayout(node)
      return layout.effectivePitchDegrees + 1e-6 < node.pitch
        ? [
            {
              field: 'pitch',
              msg: `所选高度与挑出长度对应的坡度过陡，请保留至少 ${MIN_LEAN_TO_POST_HEIGHT} 米的立柱高度。`,
              severity: 'error' as const,
            },
          ]
        : []
    },
    (node) => {
      const minimum = COVERING_MIN_PITCH[node.coveringType]
      return minimum !== null && node.pitch + 1e-6 < minimum
        ? [
            {
              field: 'pitch',
              msg: `所选屋面覆盖层通常要求坡度不小于 ${minimum}°，请核实具体产品和当地要求。`,
              severity: 'warning' as const,
            },
          ]
        : []
    },
  ],
}
