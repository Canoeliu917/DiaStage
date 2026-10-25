import { expect, test } from 'bun:test'
import { useEditor } from '@pascal-app/editor'
import { cameraPoseStore } from '../../../../packages/editor/src/store/camera-pose-store'
import { readSavedViews } from './view-commands'
import { runViewCommand } from './view-runtime'

test('successful view saves notify the local list; failed saves preserve data and emit no update', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalPose = cameraPoseStore.getState().pose
  const { isCaptureMode, isFirstPersonMode } = useEditor.getState()
  const windowEvents = new EventTarget()
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  }
  let changes = 0
  windowEvents.addEventListener('diastage:views-changed', () => changes++)
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowEvents })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  useEditor.setState({ isCaptureMode: false, isFirstPersonMode: false })
  const pose = {
    position: [0, 4, 10] as [number, number, number],
    target: [0, 1, 0] as [number, number, number],
    projection: 'perspective' as const,
  }
  try {
    cameraPoseStore.setState({ pose })
    expect(runViewCommand('local-view-test', { type: 'SAVE_VIEW', name: '舞台全景' })).toContain('本机保存')
    expect(changes).toBe(1)
    expect(readSavedViews('local-view-test', storage)).toEqual([{ name: '舞台全景', pose }])
    entries.set('diastage:view-state:v1:local-view-test', 'damaged-data')
    expect(() => runViewCommand('local-view-test', { type: 'SAVE_VIEW', name: '新视角' })).toThrow()
    expect(entries.get('diastage:view-state:v1:local-view-test')).toBe('damaged-data')
    expect(changes).toBe(1)
    cameraPoseStore.setState({ pose: null })
    expect(runViewCommand('not-ready', { type: 'SAVE_VIEW', name: '全景' })).toContain('未准备好')
    expect(entries.has('diastage:view-state:v1:not-ready')).toBe(false)
    expect(changes).toBe(1)
  } finally {
    cameraPoseStore.setState({ pose: originalPose })
    useEditor.setState({ isCaptureMode, isFirstPersonMode })
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
