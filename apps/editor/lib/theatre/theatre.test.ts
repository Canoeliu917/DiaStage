import { describe, expect, test } from 'bun:test'
import { sampleRehearsal, stageDirection } from './blocking'
import { createEmptyTableRehearsalScene } from './presets'
import { createTheatreDocument, pathDuration, TheatreDocumentSchema } from './schema'

function fixture() {
  const doc = createTheatreDocument('空桌')
  const scene = createEmptyTableRehearsalScene()
  return { doc: { ...doc, scenes: [scene], activeSceneId: scene.id }, scene }
}

describe('theatre domain', () => {
  test('the empty-table rehearsal is valid and generates independent IDs', () => {
    const { doc } = fixture()
    expect(TheatreDocumentSchema.parse(doc)).toEqual(doc)
    expect(createEmptyTableRehearsalScene().roles[0]!.id).not.toBe(doc.scenes[0]!.roles[0]!.id)
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
  })

  test('role motion honors initial hold, constant speed, arrival orientation and pause', () => {
    const { scene } = fixture()
    const path = scene.paths[0]!
    const start = scene.marks[0]!
    const end = scene.marks[1]!
    expect(sampleRehearsal(scene, 0.5).roles[0]!.position).toEqual(start.position)
    const half = 1 + (pathDuration(path, scene.marks) - start.pause - end.pause) / 2
    const moving = sampleRehearsal(scene, half).roles[0]!
    expect(moving.position[0]).toBeCloseTo((start.position[0] + end.position[0]) / 2)
    expect(moving.position[2]).toBeCloseTo((start.position[2] + end.position[2]) / 2)
    expect(moving.paused).toBe(false)
    const arrived = sampleRehearsal(scene, pathDuration(path, scene.marks) - 0.5).roles[0]!
    expect(arrived.position).toEqual(end.position)
    expect(arrived.facing).toBe(end.facing)
    expect(arrived.paused).toBe(true)
  })

  test('seeking and replaying is deterministic and does not mutate authored positions', () => {
    const { scene } = fixture()
    const before = JSON.stringify(scene)
    const mid = sampleRehearsal(scene, 12)
    sampleRehearsal(scene, 20)
    expect(sampleRehearsal(scene, 12)).toEqual(mid)
    expect(sampleRehearsal(scene, 0).roles[0]!.position).toEqual(scene.roles[0]!.position)
    expect(JSON.stringify(scene)).toBe(before)
    expect(sampleRehearsal(scene, 100).time).toBe(20)
    expect(sampleRehearsal(scene, -1).time).toBe(0)
  })

  test('prop preset, pickup, handoff and release have exactly one owner', () => {
    const { scene } = fixture()
    expect(sampleRehearsal(scene, 3).props[0]!.position).toEqual(scene.props[0]!.presetPosition)
    expect(sampleRehearsal(scene, 4).props[0]!.holderRoleId).toBe(scene.roles[0]!.id)
    expect(sampleRehearsal(scene, 6).props[0]!.holderRoleId).toBe(scene.roles[1]!.id)
    expect(sampleRehearsal(scene, 8).props[0]!.holderRoleId).toBeNull()
    expect(sampleRehearsal(scene, 8).props[0]!.position).toEqual(scene.props[0]!.presetPosition)
  })

  test('rejects non-finite geometry and time before sampling or saving', () => {
    const { doc, scene } = fixture()
    expect(() => sampleRehearsal(scene, Number.NaN)).toThrow()
    scene.roles[0]!.position[0] = Number.POSITIVE_INFINITY
    expect(TheatreDocumentSchema.safeParse(doc).success).toBe(false)
  })

  test('rejects missing role, mark, beat and prop references', () => {
    for (const field of ['role', 'mark', 'beat', 'prop']) {
      const { doc, scene } = fixture()
      if (field === 'role') scene.paths[0]!.roleId = 'missing'
      if (field === 'mark') scene.paths[0]!.markIds[0] = 'missing'
      if (field === 'beat') scene.actions[0]!.beatId = 'missing'
      if (field === 'prop') scene.actions[0]!.propId = 'missing'
      expect(TheatreDocumentSchema.safeParse(doc).success).toBe(false)
    }
  })

  test('rejects overlapping role paths and overflowing pauses', () => {
    const { doc, scene } = fixture()
    scene.paths.push({ ...scene.paths[0]!, id: 'overlap' })
    expect(TheatreDocumentSchema.safeParse(doc).success).toBe(false)
    scene.paths.pop()
    scene.marks[0]!.pause = 30
    expect(TheatreDocumentSchema.safeParse(doc).success).toBe(false)
  })

  test('rejects broken holder chains, duplicate handoff times and unpositioned releases', () => {
    for (const field of ['holder', 'time', 'position']) {
      const { doc, scene } = fixture()
      if (field === 'holder') scene.props[0]!.transfers[1]!.fromRoleId = null
      if (field === 'time') scene.props[0]!.transfers[1]!.time = 4
      if (field === 'position') delete scene.props[0]!.transfers[2]!.position
      expect(TheatreDocumentSchema.safeParse(doc).success).toBe(false)
    }
  })

  test('action and beat timing reads the rehearsal clock independently of camera state', () => {
    const { scene } = fixture()
    expect(sampleRehearsal(scene, 5).actions.map((action) => action.verb)).toEqual(['送达'])
    expect(sampleRehearsal(scene, 8).actions.map((action) => action.verb)).toEqual(['拒收'])
    expect(sampleRehearsal(scene, 12).beats[0]!.name).toBe('走向门')
  })

  test('stage left/right follows the actor facing the audience at positive Z', () => {
    const { doc } = fixture()
    expect(stageDirection([1, 0, 1], doc.venue)).toBe('台左 SL · 台前 DS')
    expect(stageDirection([-1, 0, -1], doc.venue)).toBe('台右 SR · 台后 US')
  })
})
