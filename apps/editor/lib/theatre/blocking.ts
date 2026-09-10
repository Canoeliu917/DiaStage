import {
  type Prop,
  pathDuration,
  type RehearsalScene,
  type Role,
  type StageMark,
  type Vec3,
  type Venue,
} from './schema'

export type RolePose = { roleId: string; position: Vec3; facing: number; paused: boolean }
export type PropPose = {
  propId: string
  nodeId?: string
  position: Vec3
  holderRoleId: string | null
}

function interpolate(a: Vec3, b: Vec3, amount: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]
}

export function sampleRole(scene: RehearsalScene, role: Role, time: number): RolePose {
  if (!Number.isFinite(time)) throw new Error('排演时间必须是有限数值')
  const result: RolePose = {
    roleId: role.id,
    position: [...role.position],
    facing: role.facing,
    paused: true,
  }
  const paths = scene.paths
    .filter((path) => path.roleId === role.id)
    .sort((a, b) => a.startTime - b.startTime)
  for (const path of paths) {
    if (time < path.startTime) break
    const points = path.markIds.map((markId) => {
      const mark = scene.marks.find((entry) => entry.id === markId)
      if (!mark) throw new Error('走位点不存在')
      return mark
    })
    let elapsed = Math.max(0, time - path.startTime)
    let previous: StageMark | undefined
    for (const point of points) {
      if (previous) {
        const distance = Math.hypot(
          ...point.position.map((value, axis) => value - previous!.position[axis]!),
        )
        const duration = distance / path.speed
        if (duration > 0 && elapsed < duration) {
          return {
            roleId: role.id,
            position: interpolate(previous.position, point.position, elapsed / duration),
            facing: Math.atan2(
              point.position[0] - previous.position[0],
              point.position[2] - previous.position[2],
            ),
            paused: false,
          }
        }
        elapsed -= duration
      }
      result.position = [...point.position]
      result.facing = point.facing
      if (elapsed < point.pause) return result
      elapsed -= point.pause
      previous = point
    }
  }
  return result
}

export function sampleProp(
  prop: Prop,
  roles: RolePose[],
  scene: RehearsalScene,
  time: number,
): PropPose {
  if (!Number.isFinite(time)) throw new Error('排演时间必须是有限数值')
  let holderRoleId = prop.initialHolderRoleId
  let position: Vec3 = [...prop.presetPosition]
  for (const transfer of prop.transfers) {
    if (time < transfer.time) break
    holderRoleId = transfer.toRoleId
    if (transfer.position) position = [...transfer.position]
  }
  if (holderRoleId) {
    const pose = roles.find((entry) => entry.roleId === holderRoleId)
    const role = scene.roles.find((entry) => entry.id === holderRoleId)
    if (!pose || !role) throw new Error('道具持有人不存在')
    position = [
      pose.position[0] + Math.sin(pose.facing) * 0.25,
      pose.position[1] + role.height * 0.6,
      pose.position[2] + Math.cos(pose.facing) * 0.25,
    ]
  }
  return { propId: prop.id, nodeId: prop.nodeId, position, holderRoleId }
}

export function sampleRehearsal(scene: RehearsalScene, time: number) {
  if (!Number.isFinite(time)) throw new Error('排演时间必须是有限数值')
  const resolvedTime = Math.max(0, Math.min(scene.duration, time))
  const roles = scene.roles.map((role) => sampleRole(scene, role, resolvedTime))
  return {
    time: resolvedTime,
    roles,
    props: scene.props.map((prop) => sampleProp(prop, roles, scene, resolvedTime)),
    actions: scene.actions.filter(
      (action) => action.start <= resolvedTime && resolvedTime < action.end,
    ),
    beats: scene.beats.filter((beat) => beat.start <= resolvedTime && resolvedTime < beat.end),
  }
}

export function stageDirection(position: Vec3, venue: Venue): string {
  const x = position[0] - venue.origin[0]
  const z = position[2] - venue.origin[2]
  const horizontal = Math.abs(x) < 0.1 ? '中线 CL' : x > 0 ? '台左 SL' : '台右 SR'
  const depth = Math.abs(z) < 0.1 ? '中区 C' : z > 0 ? '台前 DS' : '台后 US'
  return `${horizontal} · ${depth}`
}

export function rehearsalWarnings(scene: RehearsalScene, venue: Venue): string[] {
  const warnings: string[] = []
  for (const entry of [...scene.roles, ...scene.marks]) {
    const [x, y, z] = entry.position
    if (
      Math.abs(x - venue.origin[0]) > venue.width / 2 ||
      Math.abs(z - venue.origin[2]) > venue.depth / 2 ||
      y < venue.origin[1] ||
      y > venue.origin[1] + venue.height
    ) {
      warnings.push(
        `${'name' in entry ? entry.name : entry.label} 位于表演区边界之外，请确认是否为上下场口。`,
      )
    }
  }
  for (const path of scene.paths) {
    if (path.startTime + pathDuration(path, scene.marks) > scene.duration)
      warnings.push('走位与停顿超出场次时长。')
  }
  return warnings
}
