import type { SceneContextObject, SceneContextSummary } from '@pascal-app/core/stage'

export const MAX_DETAILED_OBJECTS = 100

export function buildRelevantSceneContext(context: SceneContextSummary, input: string) {
  const text = input.normalize('NFKC')
  const selected = new Set(context.selectedObjectIds)
  const priority = (object: SceneContextObject) =>
    selected.has(object.id)
      ? 0
      : text.includes(object.name.normalize('NFKC'))
        ? 1
        : object.kind === 'door-flat'
          ? 2
          : 3
  const ordered = [...context.objects].sort(
    (a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id),
  )
  const required = ordered.filter((object) => priority(object) < 3)
  if (required.length > MAX_DETAILED_OBJECTS)
    throw new Error('相关对象超过100个，请缩小选区或指定具体对象。')
  const distance = (object: SceneContextObject) => {
    const p = object.transform.position
    const targets = required.length
      ? required
      : [
          {
            transform: { position: { x: 0, y: 0, z: (context.venue?.depthMeters ?? 0) / 2 } },
            dimensionsMeters: { width: 0, depth: 0, height: 0 },
          },
        ]
    return Math.min(
      ...targets.map((target) => {
        const q = target.transform.position
        return (
          Math.hypot(p.x - q.x, p.z - q.z) -
          Math.hypot(object.dimensionsMeters.width, object.dimensionsMeters.depth) / 2 -
          Math.hypot(target.dimensionsMeters.width, target.dimensionsMeters.depth) / 2
        )
      }),
    )
  }
  const neighbours = ordered
    .filter((object) => priority(object) === 3)
    .map((object) => ({ object, distance: distance(object) }))
    .filter((entry) => entry.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.object.id.localeCompare(b.object.id))
  const objects = [
    ...required,
    ...neighbours.slice(0, MAX_DETAILED_OBJECTS - required.length).map((entry) => entry.object),
  ]
  const detailed = new Set(objects.map((object) => object.id))
  return {
    ...context,
    objects,
    objectIndex: ordered
      .filter((object) => !detailed.has(object.id))
      .map(({ id, name, kind }) => ({ id, name, kind })),
  }
}
