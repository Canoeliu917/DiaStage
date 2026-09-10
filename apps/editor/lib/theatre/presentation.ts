import type { TheatreDocument, Vec3 } from './schema'

/** Place the observer just beyond the neutral actor's head so it cannot obscure its own view. */
export function actorObservationPose(position: Vec3, facing: number, height: number) {
  const forward = [Math.sin(facing), Math.cos(facing)]
  const offset = height * 0.11 + 0.05
  const eye: Vec3 = [
    position[0] + forward[0]! * offset,
    position[1] + height * 0.9,
    position[2] + forward[1]! * offset,
  ]
  const target: Vec3 = [eye[0] + forward[0]! * 3, eye[1], eye[2] + forward[1]! * 3]
  return { position: eye, target }
}

/** Fit every stage corner to the actual viewport rather than assuming a landscape canvas. */
export function audienceObservationPose(
  venue: TheatreDocument['venue'],
  fov: number,
  aspect: number,
) {
  const tangentY = Math.tan((fov * Math.PI) / 360)
  const tangentX = tangentY * aspect
  if (!(tangentX > 0 && Number.isFinite(tangentX) && tangentY > 0 && Number.isFinite(tangentY)))
    throw new Error('观察画布的透视参数无效')
  const length = Math.hypot(0.375, 1)
  const backY = 0.375 / length,
    backZ = 1 / length
  let distance = 1
  for (const x of [-venue.width / 2, venue.width / 2]) {
    for (const y of [-venue.height / 2, venue.height / 2]) {
      for (const z of [-venue.depth / 2, venue.depth / 2]) {
        const depth = y * backY + z * backZ
        const vertical = y * backZ - z * backY
        distance = Math.max(
          distance,
          depth + Math.abs(x) / tangentX,
          depth + Math.abs(vertical) / tangentY,
        )
      }
    }
  }
  distance *= 1.12
  const target: Vec3 = [venue.origin[0], venue.origin[1] + venue.height / 2, venue.origin[2]]
  const position: Vec3 = [target[0], target[1] + backY * distance, target[2] + backZ * distance]
  return { position, target }
}

/** Display-only filtering must never be mistaken for an unfinished scene edit. */
export function isTheatreVisibilityOverride(value: Record<string, unknown>) {
  return (
    value.theatreSceneVisibility === true &&
    value.visible === false &&
    Object.keys(value).every((key) => key === 'theatreSceneVisibility' || key === 'visible')
  )
}

export function venueAudiencePositions(venue: TheatreDocument['venue']): {
  id: string
  label: string
  position: Vec3
}[] {
  const [x, y, z] = venue.origin
  const seats = [
    {
      id: 'front',
      label: '观众 / 台口线',
      position: [x, y + 0.06, z + venue.depth / 2 + 0.4] as Vec3,
    },
  ]
  if (venue.type === 'thrust' || venue.type === 'arena') {
    seats.push(
      { id: 'left', label: '侧面观众', position: [x - venue.width / 2 - 0.65, y + 0.06, z] },
      { id: 'right', label: '侧面观众', position: [x + venue.width / 2 + 0.65, y + 0.06, z] },
    )
  }
  if (venue.type === 'arena')
    seats.push({
      id: 'rear',
      label: '后侧观众',
      position: [x, y + 0.06, z - venue.depth / 2 - 0.4],
    })
  return seats
}
