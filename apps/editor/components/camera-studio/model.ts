import { z } from 'zod'

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
const identifier = z.string().min(1)
const cameraKeyframe = z.object({
  id: identifier,
  time: z.number().finite().nonnegative(),
  position: vector,
  lookAt: vector,
  fov: z.number().finite().min(5).max(150),
})
const motionKeyframe = z.object({ time: z.number().finite().nonnegative(), position: vector })
const shotSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  stageLocked: z.boolean().optional(),
  duration: z.number().finite().positive(),
  keyframes: z.array(cameraKeyframe).min(1),
  follow: z
    .object({
      nodeId: identifier,
      mode: z.enum(['lookAt', 'offset']),
      offset: vector,
      lookAtOffset: vector,
    })
    .nullable()
    .default(null),
  motion: z
    .object({ nodeId: identifier, keyframes: z.array(motionKeyframe).min(1) })
    .nullable()
    .default(null),
})
const projectSchema = z.object({ version: z.literal(1), shots: z.array(shotSchema) })

export type Vec3 = z.infer<typeof vector>
export type CameraKeyframe = z.infer<typeof cameraKeyframe>
export type MotionKeyframe = z.infer<typeof motionKeyframe>
export type Shot = z.infer<typeof shotSchema>
export type CameraProject = z.infer<typeof projectSchema>
export type MotionTrack = NonNullable<Shot['motion']>
export type CameraPose = Pick<CameraKeyframe, 'position' | 'lookAt' | 'fov'>

export function changedLockedShot(previous: CameraProject, next: CameraProject): Shot | undefined {
  return previous.shots.find((shot) => {
    if (!shot.stageLocked) return false
    const updated = next.shots.find((entry) => entry.id === shot.id)
    return (
      !updated ||
      JSON.stringify({ ...shot, stageLocked: undefined }) !==
        JSON.stringify({ ...updated, stageLocked: undefined })
    )
  })
}

export function validateCameraProject(input: unknown): CameraProject {
  const project = projectSchema.parse(input)
  if (new Set(project.shots.map((shot) => shot.id)).size !== project.shots.length) {
    throw new Error('机位 ID 不可重复')
  }
  for (const shot of project.shots) {
    if (new Set(shot.keyframes.map((frame) => frame.id)).size !== shot.keyframes.length) {
      throw new Error(`${shot.name} 的关键帧 ID 不可重复`)
    }
    for (const frames of [shot.keyframes, shot.motion?.keyframes ?? []]) {
      frames.sort((a, b) => a.time - b.time)
      for (let i = 0; i < frames.length; i++) {
        if (frames[i]!.time > shot.duration || (i > 0 && frames[i]!.time === frames[i - 1]!.time)) {
          throw new Error(`${shot.name} 的关键帧时间须互不相同，且位于机位时长以内`)
        }
      }
    }
    for (const frame of shot.keyframes) {
      if (frame.position.every((value, i) => Math.abs(value - frame.lookAt[i]!) < 0.0001)) {
        throw new Error(`${shot.name} 的相机位置不能与注视点重合`)
      }
    }
  }
  return project
}

// Monotone Hermite tangents preserve smooth motion without spline overshoot
// carrying the camera through a wall beyond the authored control points.
function sampleScalar(times: number[], values: number[], time: number): number {
  const last = times.length - 1
  if (time <= times[0]! || last === 0) return values[0]!
  if (time >= times[last]!) return values[last]!
  let segment = 0
  while (times[segment + 1]! < time) segment++
  const slope = (i: number) => (values[i + 1]! - values[i]!) / (times[i + 1]! - times[i]!)
  const tangent = (i: number) => {
    if (i === 0) return slope(0)
    if (i === last) return slope(last - 1)
    const before = slope(i - 1),
      after = slope(i)
    if (before * after <= 0) return 0
    const left = times[i]! - times[i - 1]!,
      right = times[i + 1]! - times[i]!
    const w1 = 2 * right + left,
      w2 = right + 2 * left
    return (w1 + w2) / (w1 / before + w2 / after)
  }
  const width = times[segment + 1]! - times[segment]!
  const t = (time - times[segment]!) / width
  const a = values[segment]!,
    b = values[segment + 1]!
  const result =
    (2 * t ** 3 - 3 * t ** 2 + 1) * a +
    (t ** 3 - 2 * t ** 2 + t) * width * tangent(segment) +
    (-2 * t ** 3 + 3 * t ** 2) * b +
    (t ** 3 - t ** 2) * width * tangent(segment + 1)
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), result))
}

function sampleVector(times: number[], vectors: Vec3[], time: number): Vec3 {
  return [0, 1, 2].map((axis) =>
    sampleScalar(
      times,
      vectors.map((vector) => vector[axis]!),
      time,
    ),
  ) as Vec3
}

export function sampleMotion(motion: MotionTrack, time: number): Vec3 {
  return sampleVector(
    motion.keyframes.map((frame) => frame.time),
    motion.keyframes.map((frame) => frame.position),
    time,
  )
}

export function sampleShot(shot: Shot, time: number, targetPosition?: Vec3): CameraPose {
  const times = shot.keyframes.map((frame) => frame.time)
  let position = sampleVector(
    times,
    shot.keyframes.map((frame) => frame.position),
    time,
  )
  let lookAt = sampleVector(
    times,
    shot.keyframes.map((frame) => frame.lookAt),
    time,
  )
  if (shot.follow && targetPosition) {
    lookAt = targetPosition.map((value, i) => value + shot.follow!.lookAtOffset[i]!) as Vec3
    if (shot.follow.mode === 'offset') {
      position = targetPosition.map((value, i) => value + shot.follow!.offset[i]!) as Vec3
    }
  }
  return {
    position,
    lookAt,
    fov: sampleScalar(
      times,
      shot.keyframes.map((frame) => frame.fov),
      time,
    ),
  }
}
