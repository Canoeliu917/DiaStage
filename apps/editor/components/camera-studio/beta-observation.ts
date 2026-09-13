import { BETA_EXPERT_MEDIA_ENABLED } from '@/lib/beta-capabilities'
import type { Shot } from './model'

// Keep legacy tracks intact in storage; Beta observes only their first saved pose.
export function cameraObservationShot(shot: Shot): Shot {
  return BETA_EXPERT_MEDIA_ENABLED
    ? shot
    : { ...shot, keyframes: shot.keyframes.slice(0, 1), follow: null, motion: null }
}
