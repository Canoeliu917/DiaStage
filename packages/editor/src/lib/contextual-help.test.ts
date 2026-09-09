import { describe, expect, test } from 'bun:test'
import { resolveSelectModeHelpHints } from './contextual-help'

describe('resolveSelectModeHelpHints', () => {
  test('stays hidden in idle select mode with no selection', () => {
    expect(
      resolveSelectModeHelpHints({
        selectedCount: 0,
        hasMovableSelection: false,
        hasRotatableSelection: false,
        commandPressed: false,
        shiftPressed: false,
      }),
    ).toEqual([])
  })

  test('shows multi-select guidance when a modifier is held without selection', () => {
    expect(
      resolveSelectModeHelpHints({
        selectedCount: 0,
        hasMovableSelection: false,
        hasRotatableSelection: false,
        commandPressed: true,
        shiftPressed: false,
      }),
    ).toEqual([
      {
        keys: [['Cmd/Ctrl', 'Shift'], 'Left click'],
        label: '将物体加入选择或移出选择',
        active: true,
      },
    ])
  })

  test('shows direct manipulation tips for selected movable and rotatable nodes', () => {
    const hints = resolveSelectModeHelpHints({
      selectedCount: 1,
      hasMovableSelection: true,
      hasRotatableSelection: true,
      commandPressed: false,
      shiftPressed: false,
    })

    expect(hints).toContainEqual({
      keys: ['Left click'],
      label: '拖动选中的可移动物体',
    })
    expect(hints).toContainEqual({
      keys: ['Cmd/Ctrl', 'Right click'],
      label: '左右拖动以旋转选中物体',
    })
    // Cmd/Ctrl and Shift click both toggle selection membership (3D selection
    // manager and 2D floorplan alike) — advertised as a single or-group row.
    expect(hints).toContainEqual({
      keys: [['Cmd/Ctrl', 'Shift'], 'Left click'],
      label: '将物体加入选择或移出选择',
      active: false,
    })
  })

  test('multi-selection advertises the group move + rotate gestures', () => {
    const hints = resolveSelectModeHelpHints({
      selectedCount: 3,
      hasMovableSelection: true,
      hasRotatableSelection: true,
      commandPressed: false,
      shiftPressed: false,
    })

    expect(hints).toEqual([
      {
        keys: ['Left click'],
        label: '点击或拖动选中物体以整体移动',
      },
      { keys: ['R / T'], label: '旋转选中物体 ±45°' },
      {
        keys: ['Cmd/Ctrl', 'G'],
        label: '编组选中物体（仅当前会话）',
      },
      {
        keys: ['Cmd/Ctrl', 'Shift', 'G'],
        label: '取消当前会话编组',
      },
      {
        keys: [['Cmd/Ctrl', 'Shift'], 'Left click'],
        label: '将物体加入选择或移出选择',
        active: false,
      },
      { keys: ['Esc'], label: '取消选择（或点击空白处）' },
    ])
  })

  test('holding a modifier keeps the same rows and only lights the selection one', () => {
    // Guides/snapping are governed by the snapping mode (Shift toggles it),
    // so no modifier-specific "freely / with guides / bypass" variants exist.
    const hints = resolveSelectModeHelpHints({
      selectedCount: 1,
      hasMovableSelection: true,
      hasRotatableSelection: true,
      commandPressed: true,
      shiftPressed: true,
    })

    expect(hints).toEqual([
      {
        keys: ['Left click'],
        label: '拖动选中的可移动物体',
      },
      {
        keys: ['Cmd/Ctrl', 'Right click'],
        label: '左右拖动以旋转选中物体',
      },
      {
        keys: [['Cmd/Ctrl', 'Shift'], 'Left click'],
        label: '将物体加入选择或移出选择',
        active: true,
      },
    ])
  })
})
