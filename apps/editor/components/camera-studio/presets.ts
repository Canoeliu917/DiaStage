import type { CameraProject, Shot, Vec3 } from './model'

const key = (time: number, position: Vec3, lookAt: Vec3, fov = 40) => ({
  id: crypto.randomUUID(),
  time,
  position,
  lookAt,
  fov,
})

export function newShot(): Shot {
  return {
    id: crypto.randomUUID(),
    name: '新机位',
    duration: 8,
    keyframes: [key(0, [4, 3, 6], [0, 1, 0]), key(8, [2, 2, 4], [0, 1, 0])],
    follow: null,
    motion: null,
  }
}

export function demoProject(): CameraProject {
  return {
    version: 1,
    shots: [
      {
        id: 'wide-push',
        name: '01 · 全景缓推',
        duration: 8,
        keyframes: [key(0, [0.12, 1.65, 5.3], [0, 1.1, 0]), key(8, [0.12, 1.5, 3.7], [0, 1, 0.05])],
        follow: null,
        motion: null,
      },
      {
        id: 'table-arc',
        name: '02 · 绕桌侧拍',
        duration: 10,
        keyframes: [
          key(0, [-2.8, 2, 3.4], [0, 0.9, 0.1]),
          key(5, [0, 2.2, 4.2], [0, 0.9, 0.1]),
          key(10, [2.8, 2, 3.4], [0, 0.9, 0.1]),
        ],
        follow: null,
        motion: null,
      },
      {
        id: 'follow-chair',
        name: '03 · 跟随行动线',
        duration: 8,
        keyframes: [key(0, [2.8, 2, 3.2], [0.82, 0.7, 0.08])],
        follow: {
          nodeId: 'block_stage_receiver',
          mode: 'offset',
          offset: [1.4, 1.6, 2.6],
          lookAtOffset: [0, 0.65, 0],
        },
        motion: {
          nodeId: 'block_stage_receiver',
          keyframes: [
            { time: 0, position: [0.752, 0, -0.314] },
            { time: 4, position: [1.18, 0, -0.65] },
            { time: 8, position: [1.6, 0, -1.5] },
          ],
        },
      },
    ],
  }
}
