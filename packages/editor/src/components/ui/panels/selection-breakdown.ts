import { getTypeDisplay } from './node-display'

export function formatSelectionBreakdown(types: Array<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const type of types) {
    if (!type) continue
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [type, count] of counts) {
    const label = getTypeDisplay(type).label
    parts.push(`${count} 个${label}`)
  }
  return parts.join(' · ')
}
