import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { migrateStageDocument } from './theatre/simulation'

export function sceneArtworkDimensions(graph: SceneGraph): string | null {
  const site = graph.rootNodeIds.map((id) => graph.nodes[id]).find((node) => node?.type === 'site')
  const raw = site?.metadata.diastageTheatre
  if (!raw) return null
  try {
    const { venue } = migrateStageDocument(raw)
    const number = (value: number) =>
      new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(value)
    const height = site?.metadata.stageHeightMeasured === false ? '—' : number(venue.height)
    return `${number(venue.width)} × ${number(venue.depth)} × ${height} m`
  } catch {
    return null
  }
}

export function artworkModifiedTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '时间未记录'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  return `${value('year')}.${value('month')}.${value('day')}  ${value('hour')}:${value('minute')}:${value('second')}`
}
