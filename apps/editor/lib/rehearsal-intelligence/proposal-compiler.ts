import type { Vec3 } from '../theatre/schema'
import { type RehearsalSimulation, RehearsalSimulationSchema } from '../theatre/simulation'
import { type RehearsalContext, type RehearsalProposal, SuggestionSchema } from './schema'

function intersects(a: Vec3, b: Vec3, min: Vec3, max: Vec3) {
  let enter = 0,
    exit = 1
  for (const axis of [0, 1, 2]) {
    const delta = b[axis]! - a[axis]!
    if (Math.abs(delta) < 1e-9) {
      if (a[axis]! < min[axis]! || a[axis]! > max[axis]!) return false
    } else {
      const t1 = (min[axis]! - a[axis]!) / delta,
        t2 = (max[axis]! - a[axis]!) / delta
      enter = Math.max(enter, Math.min(t1, t2))
      exit = Math.min(exit, Math.max(t1, t2))
      if (enter > exit) return false
    }
  }
  return true
}

export function compileProposal(
  context: RehearsalContext,
  proposal: RehearsalProposal,
): RehearsalSimulation {
  const result = RehearsalSimulationSchema.parse({
    version: 1,
    performers: context.performers,
    paths: context.paths,
    durationSeconds: context.durationSeconds,
  })
  const seen = new Set<string>()
  for (const raw of proposal.suggestions) {
    const suggestion = SuggestionSchema.parse(raw)
    const performer = result.performers.find((p) => p.id === suggestion.performerId)
    if (!performer?.visible || seen.has(performer.id)) throw new Error('建议必须引用不同的可见人物')
    seen.add(performer.id)
    result.paths = result.paths.filter((p) => p.performerId !== performer.id)
    if (suggestion.movement === 'hold') {
      if (suggestion.targetPerformerId || suggestion.zone)
        throw new Error('保持位置不能包含移动目标')
      continue
    }
    const start: Vec3 = [...performer.position]
    let direction: Vec3
    let limit = Infinity
    if (suggestion.movement === 'toward-zone') {
      if (!suggestion.zone || suggestion.targetPerformerId)
        throw new Error('请指定一个明确舞台区域')
      const v = context.venue
      const target: Vec3 = [...v.origin]
      if (suggestion.zone === 'stage-left') target[0] += v.width / 3
      if (suggestion.zone === 'stage-right') target[0] -= v.width / 3
      if (suggestion.zone === 'downstage') target[2] += v.depth / 3
      if (suggestion.zone === 'upstage') target[2] -= v.depth / 3
      direction = [target[0] - start[0], 0, target[2] - start[2]]
      limit = Math.hypot(...direction)
    } else {
      const other = context.performers.find(
        (p) => p.id === suggestion.targetPerformerId && p.visible,
      )
      if (!other || other.id === performer.id || suggestion.zone)
        throw new Error('靠近或退开需要另一位可见人物')
      direction = [other.position[0] - start[0], 0, other.position[2] - start[2]]
      if (suggestion.movement === 'withdraw') direction = direction.map((x) => -x) as Vec3
      else limit = Math.max(0, Math.hypot(...direction) - 0.8)
    }
    const distance = Math.hypot(...direction)
    const step = Math.min(limit, suggestion.extent === 'small' ? 0.6 : 1.2)
    if (distance < 1e-6 || step < 0.01)
      throw new Error('人物距离不足以执行这次移动；请调整站位或改为保持位置')
    const end: Vec3 = [
      start[0] + (direction[0] / distance) * step,
      start[1],
      start[2] + (direction[2] / distance) * step,
    ]
    const v = context.venue
    for (const point of [start, end]) {
      if (
        !point.every(Number.isFinite) ||
        Math.abs(point[0] - v.origin[0]) + 0.25 > v.width / 2 ||
        Math.abs(point[2] - v.origin[2]) + 0.25 > v.depth / 2 ||
        point[1] < v.origin[1] ||
        point[1] + 1.7 > v.origin[1] + v.height
      )
        throw new Error('建议路线超出舞台边界，请调整建议；系统不会缩放舞台')
    }
    for (const obstacle of context.obstacles) {
      const min: Vec3 = [
        obstacle.min[0] - 0.25,
        obstacle.min[1] - 1.7 + 0.01,
        obstacle.min[2] - 0.25,
      ]
      const max: Vec3 = [obstacle.max[0] + 0.25, obstacle.max[1] - 0.01, obstacle.max[2] + 0.25]
      if (intersects(start, end, min, max))
        throw new Error(`路线可能穿过「${obstacle.name}」，请手动调整路线`)
    }
    const durationSeconds = step / (suggestion.pace === 'slow' ? 0.2 : 0.5)
    result.paths.push({
      id: `${proposal.proposalId}:${suggestion.id}`,
      performerId: performer.id,
      points: [start, end],
      durationSeconds,
      visible: true,
    })
    result.durationSeconds = Math.max(result.durationSeconds, durationSeconds)
  }
  // Linear, simultaneous V0.1 paths: check closest approach on every time segment.
  const pathFor = (id: string) => result.paths.find((p) => p.performerId === id)
  const at = (id: string, t: number): Vec3 => {
    const p = result.performers.find((p) => p.id === id)!,
      path = pathFor(id)
    if (!path) return p.position
    const lengths = path.points
      .slice(1)
      .map((point, i) => Math.hypot(...point.map((x, a) => x - path.points[i]![a]!)))
    let remaining = Math.min(1, t / path.durationSeconds) * lengths.reduce((a, b) => a + b, 0)
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i]! && lengths[i]! > 0)
        return path.points[i]!.map(
          (x, a) => x + ((path.points[i + 1]![a]! - x) * remaining) / lengths[i]!,
        ) as Vec3
      remaining -= lengths[i]!
    }
    return path.points.at(-1)!
  }
  const times = new Set([0, result.durationSeconds])
  for (const path of result.paths) {
    const lengths = path.points
      .slice(1)
      .map((p, i) => Math.hypot(...p.map((v, a) => v - path.points[i]![a]!)))
    const total = lengths.reduce((a, b) => a + b, 0)
    let accumulated = 0
    for (const length of lengths) {
      accumulated += length
      if (total) times.add((accumulated / total) * path.durationSeconds)
    }
  }
  const sorted = [...times].sort((a, b) => a - b)
  const visible = result.performers.filter((p) => p.visible)
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i]!,
        b = visible[j]!
      if (!seen.has(a.id) && !seen.has(b.id)) continue
      for (let k = 1; k < sorted.length; k++) {
        const a0 = at(a.id, sorted[k - 1]!),
          b0 = at(b.id, sorted[k - 1]!)
        const a1 = at(a.id, sorted[k]!),
          b1 = at(b.id, sorted[k]!)
        const r = a0.map((v, axis) => v - b0[axis]!)
        const d = a1.map((v, axis) => v - b1[axis]! - r[axis]!)
        const denominator = d.reduce((s, v) => s + v * v, 0)
        const t = denominator
          ? Math.max(0, Math.min(1, -r.reduce((s, v, axis) => s + v * d[axis]!, 0) / denominator))
          : 0
        if (Math.hypot(...r.map((v, axis) => v + d[axis]! * t)) < 0.5 - 1e-8)
          throw new Error(`「${a.name}」与「${b.name}」的路线距离不足，请调整后再预览`)
      }
    }
  return RehearsalSimulationSchema.parse(result)
}
