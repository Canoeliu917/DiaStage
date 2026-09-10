export type StudioGroup = 'set' | 'rehearse' | 'remount'
export function migrateStudioGroup(value: unknown): StudioGroup {
  if (value === 'director' || value === 'rehearse') return 'rehearse'
  return value === 'remount' ? 'remount' : 'set'
}
export function migrateStudioPanel(panel: string): string {
  const aliases: Record<string, string> = {
    'theatre-roles': 'simulation',
    'theatre-paths': 'simulation',
    'theatre-scenes': 'simulation',
    'theatre-marks': 'theatre-venue',
    'theatre-props': 'items',
    'theatre-takes': 'versions',
    'theatre-observation': 'observe',
    picture: 'display',
    'camera-studio': 'stage-cameras',
  }
  return aliases[panel] ?? panel
}
