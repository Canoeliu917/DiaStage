import { expect, test } from 'bun:test'
import type { CameraPose } from '@pascal-app/core'
import {
  changeViewPose,
  executeViewCommand,
  parseViewCommand,
  type ViewCommand,
} from './view-commands'

const pose: CameraPose = {
  position: [0, 4, 10],
  target: [0, 1, 0],
  projection: 'perspective',
  viewWidth: 12,
  fov: 45,
}
test('view changes preserve the target for orbit/zoom and use one pose for save/recall, isolated by scene', () => {
  const data = new Map<string, string>()
  const before = structuredClone(pose)
  const applied: CameraPose[] = []
  const focused: string[] = []
  let reset = 0
  const ports = {
    sceneId: 'scene-a',
    pose,
    selectedIds: ['table'],
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
    },
    applyPose: (next: CameraPose) => {
      applied.push(next)
    },
    focus: (id: string) => {
      focused.push(id)
    },
    reset: () => {
      reset++
    },
  }
  for (const command of [
    { type: 'ORBIT_VIEW', direction: 'left', degrees: 15 },
    { type: 'ZOOM_VIEW', direction: 'in', factor: 0.85 },
    { type: 'PAN_VIEW', direction: 'right', meters: 0.3 },
    { type: 'SET_VIEW', view: 'top' },
    { type: 'SAVE_VIEW', name: '全景' },
    { type: 'RECALL_CAMERA', name: '全景' },
    { type: 'FRAME_SELECTION' },
    { type: 'RESET_VIEW' },
  ] as ViewCommand[])
    executeViewCommand(command, ports)
  expect(applied).toHaveLength(5)
  expect(applied[0]!.target).toEqual(pose.target)
  expect(applied[1]!.target).toEqual(pose.target)
  expect(applied[2]!.position[0]).toBeCloseTo(0.3)
  expect(applied[2]!.target[0]).toBeCloseTo(0.3)
  expect(applied[4]).toEqual(pose)
  expect(focused).toEqual(['table'])
  expect(reset).toBe(1)
  expect(
    executeViewCommand({ type: 'RECALL_CAMERA', name: '全景' }, { ...ports, sceneId: 'scene-b' }),
  ).toContain('没有保存')
  expect(pose).toEqual(before)
  expect([...data.keys()]).toEqual(['diastage:view-state:v1:scene-a'])
})

test('fixed views are idempotent; unqualified rotation/zoom does not guess view vs scenery', () => {
  const top = changeViewPose(pose, { type: 'SET_VIEW', view: 'top' })
  const repeated = changeViewPose(top, { type: 'SET_VIEW', view: 'top' })
  repeated.position.forEach((value, index) => {
    expect(value).toBeCloseTo(top.position[index]!, 7)
  })
  expect(parseViewCommand('转一下')).toBeNull()
  expect(parseViewCommand('放大')).toBeNull()
  expect(parseViewCommand('圆桌旋转45度')).toBeNull()
  expect(parseViewCommand('台左')).toBeNull()
  expect(parseViewCommand('切换到台右视角')).toEqual({ type: 'SET_VIEW', view: 'stage-right' })
})
