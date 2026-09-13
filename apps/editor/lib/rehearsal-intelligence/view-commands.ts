import type { CameraPose } from '@pascal-app/core'
import { parseStageLength, parseStageNumber } from '@pascal-app/core/stage'
import { z } from 'zod'

export type ViewCommand =
  | { type: 'ORBIT_VIEW'; direction: 'left' | 'right'; degrees: number }
  | { type: 'PAN_VIEW'; direction: 'left' | 'right' | 'up' | 'down'; meters: number | null }
  | { type: 'ZOOM_VIEW'; direction: 'in' | 'out'; factor: number }
  | { type: 'FRAME_SELECTION' }
  | { type: 'RESET_VIEW' }
  | { type: 'SET_VIEW'; view: 'top' | 'front' | 'back' | 'stage-left' | 'stage-right' }
  | { type: 'SAVE_VIEW'; name: string }
  | { type: 'RECALL_CAMERA'; name: string }

export function parseViewCommand(input: string): ViewCommand | null {
  const text = input
    .normalize('NFKC')
    .replace(/\s|[。！!]/g, '')
    .replace(/^请/, '')
    .replace(/^从(正面|后方|台左|台右)(?:侧面)?看(?:一下|看)?$/, '$1视角')
    .replace(
      /^(?:把)?视角(低|高)一点$/,
      (_, direction) => `视角向${direction === '低' ? '下' : '上'}平移一点`,
    )
  let match = text.match(/^(?:保存|记住)(?:当前|这个)?(?:视角|观察位)(?:为|叫|命名为)(.{1,40})$/)
  if (match) return { type: 'SAVE_VIEW', name: match[1]! }
  if (/^(?:聚焦|框选观察|看清)(?:当前)?选中(?:的)?(?:物品|对象|布景)?$/.test(text))
    return { type: 'FRAME_SELECTION' }
  if (/^(?:重置|复位)(?:视角|观察位)$|^(?:查看|看)(?:整个|全场)舞台$/.test(text))
    return { type: 'RESET_VIEW' }
  const views = {
    俯视: 'top',
    顶视: 'top',
    正面: 'front',
    后方: 'back',
    台左: 'stage-left',
    台右: 'stage-right',
  } as const
  match =
    text.match(
      /^(?:切换到|切回|切到|使用|看)?(俯视|顶视|正面|后方|台左|台右)(?:视角|观察位|图)$/,
    ) ?? text.match(/^(俯视|顶视)$/)
  if (match) return { type: 'SET_VIEW', view: views[match[1] as keyof typeof views] }
  match =
    text.match(/^(?:召回|恢复|切回|切换到)(?:保存的)?视角(.{1,40})$/) ??
    text.match(/^(?:召回|恢复|切回|切换到)(.{1,40})视角$/)
  if (match) return { type: 'RECALL_CAMERA', name: match[1]! }
  match = text.match(/^(?:把)?(?:视角|观察位|镜头)(?:往|向)?(左|右)(?:旋转|转动|转|绕)(.+)$/)
  if (match) {
    const amount = match[2]!.replace(/(?:度|°)$/, '')
    const degrees = /^(?:一点|一点点|稍微|小幅|一下)$/.test(amount) ? 15 : parseStageNumber(amount)
    if (degrees !== null && degrees > 0 && degrees <= 360)
      return { type: 'ORBIT_VIEW', direction: match[1] === '左' ? 'left' : 'right', degrees }
  }
  match = text.match(/^(?:把)?(?:视角|观察位)(?:往|向)?(左|右|上|下)(?:平移|移|挪)(.+)$/)
  if (match) {
    const meters = /^(?:一点|一点点|稍微|小幅)$/.test(match[2]!)
      ? null
      : parseStageLength(match[2]!)
    if (meters === null && !/^(?:一点|一点点|稍微|小幅)$/.test(match[2]!)) return null
    if (meters !== null && meters <= 0) return null
    return {
      type: 'PAN_VIEW',
      direction: ({ 左: 'left', 右: 'right', 上: 'up', 下: 'down' } as const)[match[1] as '左'],
      meters,
    }
  }
  match = text.match(
    /^(?:(?:把)?(?:视角|观察位|镜头))?(拉近|拉远|放大|缩小)(?:视角|观察位|镜头)?(?:一点|一点点|稍微|小幅)?$/,
  )
  if (match && /视角|观察位|镜头/.test(text))
    return {
      type: 'ZOOM_VIEW',
      direction: /拉近|放大/.test(match[1]!) ? 'in' : 'out',
      factor: 0.85,
    }
  return null
}

export function changeViewPose(
  pose: CameraPose,
  command: Exclude<
    ViewCommand,
    { type: 'FRAME_SELECTION' | 'RESET_VIEW' | 'SAVE_VIEW' | 'RECALL_CAMERA' }
  >,
): CameraPose {
  const result = structuredClone(pose)
  const offset = pose.position.map((value, index) => value - pose.target[index]!)
  const distance = Math.max(0.1, Math.hypot(...offset))
  if (command.type === 'ORBIT_VIEW') {
    const angle = ((command.degrees * Math.PI) / 180) * (command.direction === 'left' ? -1 : 1)
    result.position = [
      pose.target[0] + offset[0]! * Math.cos(angle) + offset[2]! * Math.sin(angle),
      pose.position[1],
      pose.target[2] - offset[0]! * Math.sin(angle) + offset[2]! * Math.cos(angle),
    ]
  } else if (command.type === 'ZOOM_VIEW') {
    const factor = command.direction === 'in' ? command.factor : 1 / command.factor
    result.position = pose.target.map(
      (value, index) => value + offset[index]! * factor,
    ) as CameraPose['position']
    if (pose.viewWidth !== undefined) result.viewWidth = pose.viewWidth * factor
  } else if (command.type === 'SET_VIEW') {
    const vectors = {
      top: [0, 1, 0.00001],
      front: [0, 0, 1],
      back: [0, 0, -1],
      'stage-left': [1, 0, 0],
      'stage-right': [-1, 0, 0],
    }
    result.position = pose.target.map(
      (value, index) => value + vectors[command.view][index]! * distance,
    ) as CameraPose['position']
    result.projection = 'orthographic'
  } else {
    const horizontal = Math.hypot(offset[0]!, offset[2]!) || 1
    const right = [offset[2]! / horizontal, 0, -offset[0]! / horizontal]
    const up = [
      (-offset[0]! * offset[1]!) / (horizontal * distance),
      horizontal / distance,
      (-offset[2]! * offset[1]!) / (horizontal * distance),
    ]
    const basis = ['left', 'right'].includes(command.direction) ? right : up
    const sign = ['left', 'down'].includes(command.direction) ? -1 : 1
    const meters = command.meters ?? (pose.viewWidth ?? distance) * 0.05
    result.position = pose.position.map(
      (value, index) => value + basis[index]! * meters * sign,
    ) as CameraPose['position']
    result.target = pose.target.map(
      (value, index) => value + basis[index]! * meters * sign,
    ) as CameraPose['target']
  }
  return result
}

const PoseSchema = z.object({
  position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  target: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  projection: z.enum(['perspective', 'orthographic']),
  viewWidth: z.number().positive().optional(),
  fov: z.number().positive().optional(),
})
const SavedViewsSchema = z
  .array(z.object({ name: z.string().min(1).max(40), pose: PoseSchema }))
  .max(100)

export function executeViewCommand(
  command: ViewCommand,
  ports: {
    sceneId: string
    pose: CameraPose | null
    selectedIds: string[]
    storage: Pick<Storage, 'getItem' | 'setItem'>
    applyPose: (pose: CameraPose) => void
    focus: (id: string) => void
    reset: () => void
  },
): string {
  if (command.type === 'FRAME_SELECTION') {
    if (ports.selectedIds.length !== 1) return '请先选中一个要观察的物品。'
    ports.focus(ports.selectedIds[0]!)
    return '已聚焦选中的物品。'
  }
  if (command.type === 'RESET_VIEW') {
    ports.reset()
    return '已回到舞台总览。'
  }
  if (command.type === 'SAVE_VIEW' || command.type === 'RECALL_CAMERA') {
    const key = `diastage:view-state:v1:${ports.sceneId}`
    const saved = SavedViewsSchema.parse(JSON.parse(ports.storage.getItem(key) ?? '[]'))
    if (command.type === 'RECALL_CAMERA') {
      const view = saved.find((entry) => entry.name === command.name)
      if (!view) return `没有保存的「${command.name}」视角，请明确视角名称。`
      ports.applyPose(view.pose)
      return `已召回「${command.name}」视角。`
    }
    if (!ports.pose) return '观察视图还未准备好，请稍后保存。'
    const next = [
      ...saved.filter((entry) => entry.name !== command.name),
      { name: command.name, pose: ports.pose },
    ]
    ports.storage.setItem(key, JSON.stringify(SavedViewsSchema.parse(next)))
    return `已在本机保存「${command.name}」视角。`
  }
  if (!ports.pose) return '观察视图还未准备好，请稍后再试。'
  ports.applyPose(changeViewPose(ports.pose, command))
  return '已调整观察视角，舞台物品保持原位。'
}
