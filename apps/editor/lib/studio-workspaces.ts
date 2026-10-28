import { BETA_REMOUNT_ENABLED } from './beta-capabilities'

export type StudioGroup = 'set' | 'rehearse' | 'remount'
export function migrateStudioGroup(value: unknown): StudioGroup {
  return BETA_REMOUNT_ENABLED && value === 'remount' ? 'remount' : 'set'
}
export function migrateStudioPanel(panel: string): string {
  const aliases: Record<string, string> = {
    'theatre-roles': 'items',
    'theatre-paths': 'items',
    'theatre-scenes': 'items',
    'theatre-marks': 'theatre-venue',
    'theatre-props': 'items',
    'theatre-takes': 'versions',
    'theatre-observation': 'view',
    picture: 'display',
    'camera-studio': 'view',
    'camera-rehearsal': 'view',
    'stage-cameras': 'view',
    observe: 'view',
    record: 'view',
    'stage-command': 'items',
  }
  const next = aliases[panel] ?? panel
  if (!BETA_REMOUNT_ENABLED && next === 'remount') return 'items'
  return [
    'items',
    'build',
    'theatre-venue',
    'stage-overview',
    'versions',
    'remount',
    'display',
    'view',
  ].includes(next)
    ? next
    : 'items'
}
