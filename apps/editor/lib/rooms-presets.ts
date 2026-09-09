import { SceneMaterial, ZoneNode } from '@pascal-app/core'
import { z } from 'zod'
import { type BuildSnapshot, validateBuildSnapshot } from './build-presets'
import savedRooms from './rooms-presets.json'

const point = z.tuple([z.number().finite(), z.number().finite()])
const nodeRecord = z.record(z.string(), z.unknown())
export const RoomPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbnailUrl: z.url(),
  source: z.enum(['library', 'community']),
  status: z.literal('published'),
  roomTags: z.array(z.string()),
  roomData: z.object({
    zone: z.object({ name: z.string(), color: z.string().nullable() }),
    roots: z.array(nodeRecord).min(1),
    descendants: z.array(nodeRecord),
    materials: z.record(z.string(), SceneMaterial).optional(),
    anchor: point,
    footprint: z.array(point).min(3),
  }),
})

export type RoomPreset = z.infer<typeof RoomPresetSchema>
export const ROOM_PRESETS = z.array(RoomPresetSchema).parse(savedRooms as unknown)

const LIBRARY_NAMES: Record<string, string> = {
  'Chill Office Mezzanine': '休闲办公夹层',
  Bathroom: '卫浴间',
  'Bedroom with closet': '带衣帽间的卧室',
  'Living Room #1': '客厅 1',
  Offifce: '办公室',
}
const TAG_NAMES: Record<string, string> = {
  bathroom: '卫浴间 浴室',
  bedroom: '卧室',
  living: '客厅',
  office: '办公室',
}

export function roomPresetName(room: RoomPreset): string {
  return room.source === 'library' ? (LIBRARY_NAMES[room.name] ?? room.name) : room.name
}

export function filterRoomPresets(source: RoomPreset['source'], query: string): RoomPreset[] {
  const search = query.trim().toLocaleLowerCase()
  return ROOM_PRESETS.filter((room) => {
    if (room.source !== source) return false
    const words = [
      room.name,
      roomPresetName(room),
      ...room.roomTags.flatMap((tag) => [tag, TAG_NAMES[tag] ?? '']),
    ]
    return words.join(' ').toLocaleLowerCase().includes(search)
  })
}

export function roomPresetSnapshot(room: RoomPreset): BuildSnapshot {
  const zone = ZoneNode.parse({
    name: room.source === 'library' ? roomPresetName(room) : room.roomData.zone.name,
    color: room.roomData.zone.color ?? undefined,
    polygon: room.roomData.footprint,
    spaceRole: 'room',
  })
  return {
    roots: [...room.roomData.roots, zone],
    descendants: room.roomData.descendants,
    materials: room.roomData.materials,
  }
}

export function roomPresetIssue(room: RoomPreset): string | null {
  try {
    validateBuildSnapshot(roomPresetSnapshot(room))
    return null
  } catch (error) {
    return error instanceof Error ? error.message : '房间数据与当前版本不兼容。'
  }
}
