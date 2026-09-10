export type ContinuationContext = 'wall' | 'fence' | 'point' | 'cabinet' | 'canopy'
export type ContinuationMode = string

export const CONTINUATION_PROFILES: Record<
  ContinuationContext,
  {
    options: ContinuationMode[]
    default: ContinuationMode
    labels: Record<string, string>
    icons: Record<string, string>
  }
> = {
  wall: {
    options: ['room', 'single'],
    default: 'single',
    labels: { room: '闭合景片组', single: '单段景片' },
    icons: { room: 'lucide:square', single: 'lucide:minus' },
  },
  fence: {
    options: ['single', 'continuous', 'curved'],
    default: 'continuous',
    labels: {
      continuous: '连续',
      single: '单段栏杆',
      curved: '曲线栏杆',
    },
    icons: {
      continuous: 'lucide:waypoints',
      single: 'lucide:minus',
      curved: 'lucide:spline',
    },
  },
  point: {
    options: ['once', 'repeat'],
    default: 'once',
    labels: { once: '放置一次', repeat: '连续放置' },
    icons: { once: 'lucide:target', repeat: 'lucide:copy-plus' },
  },
  cabinet: {
    options: ['single', 'continuous'],
    default: 'single',
    labels: { single: '单个柜体', continuous: '连续柜组' },
    icons: { single: 'lucide:minus', continuous: 'lucide:waypoints' },
  },
  canopy: {
    options: ['single', 'continuous'],
    default: 'single',
    labels: { single: '单个雨棚', continuous: '连续雨棚' },
    icons: { single: 'lucide:minus', continuous: 'lucide:waypoints' },
  },
}

const POINT_KINDS = new Set(['item', 'door', 'window', 'shelf', 'column'])

export function nextContinuation(
  context: ContinuationContext,
  current: ContinuationMode,
): ContinuationMode {
  const profile = CONTINUATION_PROFILES[context]
  const index = profile.options.indexOf(current)
  if (index === -1) return profile.default
  return profile.options[(index + 1) % profile.options.length] ?? profile.default
}

export function continuationContextOf(kind: string): ContinuationContext | null {
  if (kind === 'wall') return 'wall'
  if (kind === 'fence') return 'fence'
  if (kind === 'cabinet') return 'cabinet'
  if (kind === 'lean-to-extension') return 'canopy'
  return POINT_KINDS.has(kind) ? 'point' : null
}
