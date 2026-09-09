import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.LIGHTING_PANEL_TEST) {
  test('lighting controls protect recordings and scene ownership, including pending file imports', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      env: { ...process.env, LIGHTING_PANEL_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  const { mock } = await import('bun:test')
  const React = await import('react')
  const core = await import('@pascal-app/core')
  const { useCameraStudio: camera } = await import('../camera-studio/store')
  const { useLighting: store } = await import('./store')
  const { createStageLight, MAX_STAGE_LIGHTS } = await import('./model')
  const effects: Array<() => undefined | (() => void)> = []
  mock.module('react', () => ({
    ...React,
    useRef: <T,>(value: T) => ({ current: value }),
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
  }))
  mock.module('@pascal-app/core', () => ({
    ...core,
    useScene: Object.assign(
      (select: (state: ReturnType<typeof core.useScene.getState>) => unknown) =>
        select(core.useScene.getState()),
      core.useScene,
    ),
  }))
  mock.module('../camera-studio/store', () => ({
    useCameraStudio: Object.assign(
      (select: (state: ReturnType<typeof camera.getState>) => unknown) => select(camera.getState()),
      camera,
    ),
  }))
  mock.module('./store', () => ({ useLighting: Object.assign(() => store.getState(), store) }))
  const { LightingPanel } = await import('./panel')
  type Element = { type: unknown; props: Record<string, unknown> }
  function elements(node: unknown): Element[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    const element = node as Element
    if (typeof element.type === 'function') return elements(element.type(element.props))
    return [element, ...elements(element.props?.children)]
  }
  function label(node: unknown): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(label).join('')
    if (node && typeof node === 'object') return label((node as Element).props?.children)
    return ''
  }
  function render(sceneId = 'scene-a') {
    effects.length = 0
    const nodes = elements(LightingPanel({ sceneId }))
    const cleanups = effects.map((effect) => effect())
    return {
      nodes,
      dispose: () => {
        for (const cleanup of cleanups) cleanup?.()
      },
      button(text: string) {
        const found = nodes.find((node) => node.type === 'button' && label(node) === text)
        assert.ok(found, `missing button: ${text}`)
        return found.props as { disabled?: boolean; onClick: () => void }
      },
      input(text: string) {
        const found = nodes.find(
          (node) => node.type === 'input' && node.props['aria-label'] === text,
        )
        assert.ok(found, `missing input: ${text}`)
        return found.props as { onChange: (event: { target: { valueAsNumber: number } }) => void }
      },
      get locked() {
        return nodes.some((node) => node.type === 'fieldset' && node.props.disabled === true)
      },
      importFile(text: () => Promise<string>) {
        const input = nodes.find((node) => node.type === 'input' && node.props.type === 'file')
        assert.ok(input)
        const change = input.props.onChange as (event: {
          target: { files: Array<{ size: number; text: () => Promise<string> }>; value: string }
        }) => Promise<void>
        return change({ target: { files: [{ size: 300, text }], value: 'file.json' } })
      },
    }
  }
  const initial = { version: 1 as const, lights: [createStageLight('light-a', 0)] }
  function reset() {
    camera.setState({ playing: false, previewing: false, recording: false })
    core.useScene.setState({ readOnly: false })
    store.getState().setProject(initial)
    store.setState({ loadedSceneId: 'scene-a', showHelpers: true, editTarget: 'position' })
  }
  reset()
  let view = render()
  view.input('灯位 X').onChange({ target: { valueAsNumber: 5 } })
  assert.deepEqual(store.getState().project.lights[0]!.position, [5, 4, 2])
  assert.deepEqual(store.getState().project.lights[0]!.target, [0, 0, 0])
  assert.equal(store.getState().past.length, 1)
  view.button('撤销布光修改').onClick()
  assert.deepEqual(store.getState().project, initial)
  view.button('编辑照射点').onClick()
  assert.equal(store.getState().editTarget, 'target')
  assert.equal(store.getState().showHelpers, true)
  for (let i = 1; i < MAX_STAGE_LIGHTS; i++) view.button('添加聚光灯').onClick()
  view.dispose()
  view = render()
  assert.equal(view.button('添加聚光灯').disabled, true)
  view.dispose()

  for (const mode of ['playing', 'previewing', 'recording'] as const) {
    reset()
    view = render()
    const before = store.getState().project
    camera.setState({ [mode]: true })
    view.button('添加聚光灯').onClick()
    view.button('删除灯光').onClick()
    view.input('灯位 X').onChange({ target: { valueAsNumber: 9 } })
    assert.equal(store.getState().project, before, `${mode}: stale handler cannot mutate`)
    assert.equal(camera.getState()[mode], true, 'editing never stops camera work')
    view.dispose()
    view = render()
    assert.equal(view.locked, true)
    view.dispose()
  }
  reset()
  core.useScene.setState({ readOnly: true })
  view = render()
  assert.equal(view.locked, true)
  const readOnlyProject = store.getState().project
  view.button('删除灯光').onClick()
  assert.equal(store.getState().project, readOnlyProject)
  view.dispose()
  reset()
  view = render('scene-b')
  assert.equal(view.locked, true, 'the previous scene cannot be edited while the next loads')
  view.button('添加聚光灯').onClick()
  assert.equal(store.getState().project.lights.length, 1)
  view.dispose()

  const imported = { version: 1, lights: [{ ...initial.lights[0]!, name: '导入灯光' }] }
  for (const interruption of ['recording', 'scene', 'edit', 'unmount'] as const) {
    reset()
    view = render()
    let complete: (text: string) => void = () => {}
    const read = new Promise<string>((resolve) => {
      complete = resolve
    })
    const pending = view.importFile(() => read)
    if (interruption === 'recording') camera.setState({ recording: true })
    if (interruption === 'scene') store.setState({ loadedSceneId: 'scene-b', notice: '新场景提示' })
    if (interruption === 'edit') store.getState().updateLight('light-a', { name: '新修改' })
    if (interruption === 'unmount') view.dispose()
    const before = store.getState().project
    complete(JSON.stringify(imported))
    await pending
    assert.equal(store.getState().project, before, `pending import after ${interruption}`)
    if (interruption === 'scene') assert.equal(store.getState().notice, '新场景提示')
    if (interruption === 'recording') assert.match(store.getState().notice, /停止/)
    if (interruption === 'edit') assert.match(store.getState().notice, /新的修改/)
    view.dispose()
  }
  reset()
  store.setState({ persistenceBlocked: true })
  view = render()
  assert.equal(view.locked, false, 'a damaged cache can be repaired by an explicit valid import')
  await view.importFile(async () => JSON.stringify(imported))
  assert.equal(store.getState().project.lights[0]!.name, '导入灯光')
  assert.equal(store.getState().persistenceBlocked, false)
  const valid = store.getState().project
  await view.importFile(async () =>
    JSON.stringify({ ...imported, lights: [{ ...imported.lights[0], intensity: -1 }] }),
  )
  assert.equal(store.getState().project, valid)
  assert.notEqual(store.getState().notice, '')
  view.dispose()
}
