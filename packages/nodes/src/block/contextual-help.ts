import type { ContextualHelpNodeExtension, ContextualShortcutHint } from '@pascal-app/editor'
import useBlockEditSession from './edit-session'
import type { BlockComponentMode } from './selection-model'

const MODE_LABELS: Record<BlockComponentMode, string> = {
  vertex: '顶点',
  edge: '边',
  face: '面',
}

const MODE_OPERATIONS: Record<BlockComponentMode, ContextualShortcutHint[]> = {
  vertex: [{ keys: ['M'], label: '合并选中顶点' }],
  edge: [
    { keys: ['Cmd/Ctrl', 'B'], label: '对选中边倒角' },
    { keys: ['D'], label: '融并选中边' },
  ],
  face: [
    { keys: ['E'], label: '挤出选中面' },
    { keys: ['I'], label: '内插选中面' },
  ],
}

const HINTS_BY_MODE = Object.fromEntries(
  (Object.keys(MODE_LABELS) as BlockComponentMode[]).map((mode) => [
    mode,
    [
      {
        keys: [['1', '2', '3']],
        label: `${MODE_LABELS[mode]}模式`,
        subtitle: '顶点／边／面',
      },
      { keys: [['G', 'R', 'S']], label: '移动／旋转／缩放选中元素' },
      ...MODE_OPERATIONS[mode],
      { keys: ['Tab'], label: '退出网格编辑' },
    ],
  ]),
) as Record<BlockComponentMode, ContextualShortcutHint[]>

const EMPTY_HINTS: ContextualShortcutHint[] = []

export const blockContextualHelp: ContextualHelpNodeExtension = {
  subscribe: useBlockEditSession.subscribe,
  getHints: (nodeId) => {
    const session = useBlockEditSession.getState()
    return session.nodeId === nodeId ? HINTS_BY_MODE[session.selection.mode] : EMPTY_HINTS
  },
}
