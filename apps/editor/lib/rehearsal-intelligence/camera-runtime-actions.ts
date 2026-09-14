import type { CameraPose } from '@pascal-app/core'
import type { CameraIntentCommand } from './camera-intents'

export type CameraRuntimeAction =
  | { type: 'top' }
  | { type: 'elevate'; radians: number }
  | { type: 'raise'; fraction: number }
  | { type: 'pitch-down'; radians: number }

// Runtime defaults are deliberately separate from the frozen language taxonomy.
export function mapCameraIntent(command: CameraIntentCommand): CameraRuntimeAction[] | null {
  if (command.clarify || !command.intents.length) return null
  const actions: CameraRuntimeAction[] = []
  for (const intent of command.intents) {
    switch (intent) {
      case 'top_orthographic':
        actions.push({ type: 'top' })
        break
      case 'elevated_perspective':
        actions.push({ type: 'elevate', radians: Math.PI / 4 })
        break
      case 'raise_camera':
        actions.push({ type: 'raise', fraction: 0.1 })
        break
      case 'tilt_down':
        actions.push({ type: 'pitch-down', radians: Math.PI / 18 })
        break
      default:
        return null // An unsupported compound must never execute partially.
    }
  }
  return actions
}

export type CameraRuntimeTarget = { center: CameraPose['target']; radius: number; aspect: number }

export function applyCameraRuntimeActions(
  source: CameraPose,
  actions: CameraRuntimeAction[],
  target?: CameraRuntimeTarget,
): CameraPose {
  const pose: CameraPose = { ...source, position: [...source.position], target: [...source.target] }
  if (target) {
    const delta = target.center.map((v, i) => v - pose.target[i]!)
    pose.position = pose.position.map((v, i) => v + delta[i]!) as CameraPose['position']
    pose.target = [...target.center]
  }
  for (const action of actions) {
    const [x, y, z] = pose.position.map((v, i) => v - pose.target[i]!) as [number, number, number]
    const distance = Math.max(0.1, Math.hypot(x, y, z))
    const azimuth = Math.hypot(x, z) < distance * 0.001 ? 0 : Math.atan2(x, z)
    if (action.type === 'raise') {
      pose.position[1] += distance * action.fraction
      pose.target[1] += distance * action.fraction
    } else if (action.type === 'pitch-down') {
      const currentPitch = Math.asin(Math.max(-1, Math.min(1, y / distance)))
      const pitch = Math.max(
        currentPitch,
        Math.min(Math.PI / 2 - 0.001, currentPitch + action.radians),
      )
      pose.target = [
        pose.position[0] - Math.sin(azimuth) * Math.cos(pitch) * distance,
        pose.position[1] - Math.sin(pitch) * distance,
        pose.position[2] - Math.cos(azimuth) * Math.cos(pitch) * distance,
      ]
    } else {
      // Fit the rendered target's bounding sphere, including portrait/split viewports.
      const radius = target ? Math.max(0.1, target.radius) : null
      const aspect = target?.aspect ?? 1
      const halfFov = Math.atan(Math.tan(((pose.fov ?? 50) * Math.PI) / 360) * Math.min(1, aspect))
      const range = radius ? (radius * 1.2) / Math.sin(halfFov) : distance
      const pitch = action.type === 'top' ? Math.PI / 2 - 0.00001 : action.radians
      pose.position = [
        pose.target[0] + Math.sin(azimuth) * Math.cos(pitch) * range,
        pose.target[1] + Math.sin(pitch) * range,
        pose.target[2] + Math.cos(azimuth) * Math.cos(pitch) * range,
      ]
      if (action.type === 'top') {
        pose.projection = 'orthographic'
        if (radius) pose.viewWidth = radius * 2.4 * Math.max(1, aspect)
        continue
      }
    }
    pose.projection = 'perspective'
    // A stale orthographic width must not dolly the requested camera position.
    delete pose.viewWidth
  }
  return pose
}
