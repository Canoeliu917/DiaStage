import { expect, test } from 'bun:test'
import type { SceneContextSummary } from '@pascal-app/core/stage'
import { VERTICAL_VIEW_QUESTION } from './camera-intents'
import { groundLanguage } from './language-grounding'
import { executeViewCommand, parseViewCommand } from './view-commands'

test('camera paraphrases preserve mode/orientation boundaries and do not consume scenery edits', () => {
  for (const [input, intent] of [
    ['请从上面看看。', 'elevated_perspective'],
    ['从高一点看看', 'elevated_perspective'],
    ['正上方视图', 'top_orthographic'],
    ['请看一下顶视图！', 'top_orthographic'],
    ['视角往下转一点', 'tilt_down'],
    ['视角向下看一点', 'tilt_down'],
    ['高度加一点', 'raise_camera'],
    ['相机升高一点', 'raise_camera'],
    ['切到观众视角', 'audience_view'],
    ['从左侧看看', 'orbit_left'],
    ['看上面', 'clarify_vertical_view'],
    ['往上看看', 'clarify_vertical_view'],
  ])
    expect(parseViewCommand(input!)).toMatchObject({ intents: [intent] })
  for (const input of [
    '抬高桌子',
    '把桌子抬高一点看看',
    '把景片往下压一点',
    '不要切到俯视图',
    '先从观众席看，再删除桌子',
    '从正上方看，但不要切平面图',
  ])
    expect(parseViewCommand(input)).toBeNull()
})

test('grounding routes vertical ambiguity to a question without changing formal context', () => {
  const context: SceneContextSummary = {
    documentVersion: 1,
    venue: null,
    objects: [],
    selectedObjectIds: [],
  }
  const before = structuredClone(context)
  const result = groundLanguage('俯视一下', context)
  expect(result).toMatchObject({
    capability: 'clarify',
    clarificationRequired: true,
    clarification: VERTICAL_VIEW_QUESTION,
  })
  expect(groundLanguage('从上面看看这张桌子', context)).toMatchObject({
    capability: 'view',
    target: ['selected_or_table'],
    view: { intents: ['elevated_perspective'], projection: 'perspective' },
  })
  expect(context).toEqual(before)
})

test('recognized but unimplemented camera actions cannot silently move the view or write data', () => {
  const forbidden = () => {
    throw new Error('unexpected view or storage mutation')
  }
  const ports = {
    sceneId: 'camera-intent-test',
    pose: null,
    selectedIds: [],
    storage: { getItem: forbidden, setItem: forbidden },
    applyPose: forbidden,
    focus: forbidden,
    reset: forbidden,
  }
  for (const input of ['从上面看一下', '镜头高一点，再往下看一点', '从桌子右侧看看']) {
    expect(executeViewCommand(parseViewCommand(input)!, ports)).toContain('当前视图未改变')
  }
  expect(executeViewCommand(parseViewCommand('上面看看')!, ports)).toBe(VERTICAL_VIEW_QUESTION)
  expect(executeViewCommand(parseViewCommand('聚焦这个物件')!, ports)).toContain('请先选中')
})

test('new phrasing reuses existing top, front, orbit and selection actions', () => {
  const pose = {
    position: [0, 4, 10] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    projection: 'perspective' as const,
  }
  const poses: unknown[] = []
  const focused: string[] = []
  const ports = {
    sceneId: 'camera-alias-test',
    pose,
    selectedIds: ['selected-table'],
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('unexpected storage write')
      },
    },
    applyPose: (next: unknown) => {
      poses.push(next)
    },
    focus: (id: string) => {
      focused.push(id)
    },
    reset: () => {
      throw new Error('unexpected reset')
    },
  }
  for (const [phrase, original] of [
    ['top view', '切到俯视图'],
    ['从台口正面看看', '从正面看'],
    ['绕到左边看看', '视角向左旋转15度'],
  ]) {
    executeViewCommand(parseViewCommand(phrase!)!, ports)
    executeViewCommand(parseViewCommand(original!)!, ports)
    expect(poses.at(-2)).toEqual(poses.at(-1))
  }
  executeViewCommand(parseViewCommand('对准我选中的景片')!, ports)
  expect(focused).toEqual(['selected-table'])
})
