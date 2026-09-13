import { afterEach, beforeEach, expect, test } from 'bun:test'
import { configureEditorScope } from '../lib/editor-scope'
import useEditor, { normalizePersistedEditorUiState } from './use-editor'

beforeEach(() => {
  configureEditorScope({
    creationTools: ['item', 'measurement', 'construction-dimension'],
    materialEditing: false,
    firstPerson: false,
    capture: false,
  })
  useEditor.getState().armToolMode({ mode: 'select' })
})

afterEach(() => {
  configureEditorScope(null)
  useEditor.getState().armToolMode({ mode: 'select' })
})

test('legacy shortcuts/API and persisted preferences cannot re-enter hidden creation tools', () => {
  for (const tool of ['wall', 'stair', 'zone', 'fence', 'door', 'window']) {
    useEditor.getState().setTool(tool)
    expect(useEditor.getState().toolMode).toEqual({ mode: 'select' })
    const restored = normalizePersistedEditorUiState({
      phase: 'structure',
      toolMode: { mode: 'build', tool },
    })
    expect(restored.toolMode).toEqual({ mode: 'select' })
    expect(restored.mode).toBe('select')
    expect(restored.tool).toBeNull()
  }
})

test('paint, walkthrough and legacy capture cannot be activated', () => {
  useEditor.getState().armMaterialPaint()
  useEditor.getState().setFirstPersonMode(true)
  useEditor.getState().setCaptureMode(true)
  expect(useEditor.getState().mode).toBe('select')
  expect(useEditor.getState().isFirstPersonMode).toBe(false)
  expect(useEditor.getState().isCaptureMode).toBe(false)
  expect(
    normalizePersistedEditorUiState({
      phase: 'structure',
      toolMode: { mode: 'material-paint' },
    }).mode,
  ).toBe('select')
})

test('native placement, measurement, dimensions and view changes remain available', () => {
  for (const tool of ['item', 'measurement', 'construction-dimension']) {
    useEditor.getState().setTool(tool)
    expect(useEditor.getState().toolMode).toEqual({ mode: 'build', tool })
  }
  for (const view of ['2d', 'split', '3d'] as const) {
    useEditor.getState().setViewMode(view)
    expect(useEditor.getState().viewMode).toBe(view)
  }
})
