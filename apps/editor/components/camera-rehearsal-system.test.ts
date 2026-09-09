import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

if (!process.env.CAMERA_REHEARSAL_RUNTIME_TEST) {
  test('rehearsal restores its host, finishes Takes and cancels rendered-frame exports', () => {
    const child = spawnSync(process.execPath, ['run', fileURLToPath(import.meta.url)], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, CAMERA_REHEARSAL_RUNTIME_TEST: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(child.status, 0, child.error?.message ?? `${child.stdout}\n${child.stderr}`)
  })
} else {
  // Isolate React/R3F mocks from the other camera and recording tests.
  const { mock } = await import('bun:test')
  const React = await import('react')
  const { OrthographicCamera, PerspectiveCamera, Vector3 } = await import('three')
  const effects: Array<() => undefined | (() => void)> = []
  const layouts: Array<() => undefined | (() => void)> = []
  const frames: Array<{ callback: (state: unknown, delta: number) => void; priority: number }> = []
  const afterEffects = new Set<() => void>()
  const camera = new PerspectiveCamera(57)
  let activeCamera:
    | InstanceType<typeof PerspectiveCamera>
    | InstanceType<typeof OrthographicCamera> = camera
  const target = new Vector3(0, 1, 0)
  const controls = {
    enabled: true,
    smoothTime: 0.4,
    draggingSmoothTime: 0.3,
    maxSpeed: 17,
    getPosition: (out: InstanceType<typeof Vector3>) => out.copy(camera.position),
    getTarget: (out: InstanceType<typeof Vector3>) => out.copy(target),
    setLookAt: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      camera.position.set(x, y, z)
      target.set(tx, ty, tz)
      camera.lookAt(target)
      return Promise.resolve()
    },
    update: () => {},
  }
  const selection = { selectedIds: ['block_subject'] }
  const viewer = {
    selection,
    setSelection: (value: typeof selection) => {
      viewer.selection = value
    },
  }
  let cancellations = 0
  let rendered = false
  let downloads = 0
  let holdEncoding = false
  let failEncoderConstruction = false
  let actualMime = 'video/webm;codecs=vp9'
  const encoded: Array<(blob: Blob) => void> = []
  const copies: number[][] = []
  const copiedTargets: number[][] = []
  const copiedFovs: number[] = []
  const tracks: Array<{ stopped: boolean; stop: () => void }> = []
  class Canvas {
    width = 1280
    height = 720
    getContext() {
      return {
        drawImage: () => {
          assert.equal(rendered, true, 'GPU copy must happen synchronously after the render pass')
          copies.push(camera.position.toArray())
          copiedTargets.push(target.toArray())
          copiedFovs.push(camera.fov)
        },
        getImageData: () => ({}),
      }
    }
    toBlob(callback: (blob: Blob) => void) {
      if (holdEncoding) encoded.push(callback)
      else callback(new Blob(['png'], { type: 'image/png' }))
    }
    captureStream() {
      const track = {
        stopped: false,
        stop() {
          this.stopped = true
        },
      }
      tracks.push(track)
      return { getTracks: () => [track], getVideoTracks: () => [track] }
    }
  }
  const recorders: Recorder[] = []
  class Recorder {
    static isTypeSupported = (mime: string) => mime.startsWith('video/webm')
    state = 'inactive'
    mimeType = actualMime
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      if (failEncoderConstruction) throw new Error('encoder construction failed')
      recorders.push(this)
    }
    start() {
      assert.equal(rendered, true, 'encoding starts after the first real frame is copied')
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['webm'], { type: this.mimeType }) })
        this.onstop?.()
      })
    }
  }
  const storage = new Map<string, string>()
  Object.assign(globalThis, {
    HTMLCanvasElement: Canvas,
    MediaRecorder: Recorder,
    window: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      setTimeout,
      clearTimeout,
    },
    document: {
      createElement: (tag: string) =>
        tag === 'canvas'
          ? new Canvas()
          : {
              click: () => {
                downloads += 1
              },
            },
    },
  })
  const reactHooks = {
    ...React,
    useRef: <T>(value: T) => ({ current: value }),
    useCallback: <T>(callback: T) => callback,
    useEffect: (effect: () => undefined | (() => void)) => effects.push(effect),
    useLayoutEffect: (effect: () => undefined | (() => void)) => layouts.push(effect),
    useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  }
  mock.module('react', () => ({ ...reactHooks, default: reactHooks }))
  mock.module('@pascal-app/core', () => ({
    emitter: {
      emit: (name: string) => {
        if (name === 'camera-controls:cancel-pose') cancellations += 1
      },
    },
    sceneRegistry: { nodes: new Map() },
  }))
  mock.module('@pascal-app/viewer', () => ({
    GRID_LAYER: 2,
    useViewer: { getState: () => viewer },
  }))
  mock.module('@react-three/drei', () => ({ Html: () => null }))
  mock.module('@react-three/fiber', () => ({
    useThree: (select: (state: unknown) => unknown) =>
      select({
        camera: activeCamera,
        controls,
        gl: { domElement: new Canvas() },
        size: { width: 1280, height: 720 },
        invalidate: () => {},
      }),
    useFrame: (callback: (state: unknown, delta: number) => void, priority = 0) =>
      frames.push({ callback, priority }),
    addAfterEffect: (callback: () => void) => {
      afterEffects.add(callback)
      return () => afterEffects.delete(callback)
    },
  }))
  const director = await import('../lib/camera-director')
  mock.module('@/lib/camera-director', () => director)
  const { CameraRehearsalSystem } = await import('./camera-rehearsal-system')
  const flush = async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve()
  }
  let sceneIndex = 0
  const mount = (safeFrame = false) => {
    effects.length = 0
    layouts.length = 0
    frames.length = 0
    camera.position.set(4, 3, 6)
    target.set(0, 1, 0)
    camera.up.set(0, 0, 1)
    camera.lookAt(target)
    camera.fov = 57
    camera.layers.mask = 7
    controls.enabled = true
    controls.smoothTime = 0.4
    controls.draggingSmoothTime = 0.3
    controls.maxSpeed = 17
    const sceneId = `rehearsal-test-${++sceneIndex}`
    director.updateCameraDirector(sceneId, (state) => ({
      ...state,
      control: { ...state.control, positionLagSpeed: 0.1, rotationLagSpeed: 0.1 },
      sequence: {
        ...state.sequence,
        duration: 0.2,
        start: { position: [1, 2, 5], target: [0, 1, 0], focalLengthMm: 35, focusDistanceM: 4 },
        end: { position: [9, 3, 5], target: [1, 2, 0], focalLengthMm: 80, focusDistanceM: 3 },
      },
      output: { ...state.output, fps: 24, safeFrame },
    }))
    const quaternion = camera.quaternion.clone()
    const wrapper = CameraRehearsalSystem({ sceneId })
    assert.ok(wrapper)
    const element = wrapper.type(wrapper.props)
    const cleanLayouts = layouts.map((effect) => effect())
    const cleanEffects = effects.map((effect) => effect())
    assert.equal(frames[0]!.priority, 0.9)
    return {
      sceneId,
      element,
      quaternion,
      runtime: director.getCameraDirectorRuntime(sceneId)!,
      cleanup: () => {
        for (const dispose of cleanLayouts.reverse()) dispose?.()
        for (const dispose of cleanEffects.reverse()) dispose?.()
      },
    }
  }
  const tick = (delta = 0) => {
    for (const frame of frames) frame.callback({}, delta)
    rendered = true
    for (const callback of afterEffects) callback()
    rendered = false
  }

  const playback = mount()
  playback.runtime.play()
  tick(0.2)
  assert.deepEqual(
    camera.position.toArray(),
    [9, 3, 5],
    'damping must finish exactly at B without a React rerender',
  )
  assert.equal(camera.fov, director.focalLengthToVerticalFov(80, 20.25))
  assert.equal(director.getCameraDirectorState(playback.sceneId).transport.status, 'idle')
  playback.cleanup()
  assert.deepEqual(camera.position.toArray(), [4, 3, 6])
  assert.deepEqual(camera.up.toArray(), [0, 0, 1])
  assert.ok(camera.quaternion.equals(playback.quaternion))
  assert.equal(camera.fov, 57)
  assert.equal(camera.layers.mask, 7)
  assert.equal(controls.enabled, true)
  assert.equal(controls.smoothTime, 0.4)
  assert.equal(controls.draggingSmoothTime, 0.3)
  assert.equal(controls.maxSpeed, 17)
  assert.equal(director.getCameraDirectorRuntime(playback.sceneId), null)

  const lagged = mount()
  lagged.runtime.play()
  assert.deepEqual(
    camera.position.toArray(),
    [1, 2, 5],
    'Play starts at its sequence sample, not the previous editor view',
  )
  const playedPositions = [camera.position.toArray()]
  const playedTargets = [target.toArray()]
  const playedFovs = [camera.fov]
  for (let frame = 1; frame <= 5; frame += 1) {
    tick(1 / 24)
    playedPositions.push(camera.position.toArray())
    playedTargets.push(target.toArray())
    playedFovs.push(camera.fov)
  }
  assert.notDeepEqual(
    playedPositions[1],
    director.sampleDirectorPose(director.getCameraDirectorState(lagged.sceneId), 1 / 24)!.position,
    'the fixture must exercise actual lag',
  )
  lagged.cleanup()

  const take = mount()
  take.runtime.startRecording()
  camera.position.set(6, 2, 4)
  tick(0.12)
  take.cleanup()
  const savedTake = director.getCameraDirectorState(take.sceneId)
  assert.ok(savedTake.take.keys.length >= 2)
  assert.equal(savedTake.take.keys.at(-1)!.time, 0.12, 'unmount saves the final partial sample')
  assert.equal(savedTake.transport.status, 'idle')
  assert.match(savedTake.transport.message ?? '', /手动运镜已记录/)
  assert.ok(storage.get(`zhijiao.camera-sequence.v1:${take.sceneId}`)?.includes('rawSampleCount'))

  const png = mount()
  const pngExport = png.runtime.exportPngSequence()
  const before = copies.length
  tick()
  await flush()
  tick()
  await flush()
  assert.deepEqual(copies[before], [1, 2, 5])
  assert.deepEqual(
    copies[before + 1],
    playedPositions[1],
    'PNG must include the same lag as Play at the same frame time',
  )
  assert.deepEqual(copiedTargets[before + 1], playedTargets[1])
  assert.equal(copiedFovs[before + 1], playedFovs[1])
  png.runtime.stop()
  const replacement = png.runtime.exportPngSequence()
  await pngExport
  assert.equal(
    director.getCameraDirectorState(png.sceneId).transport.status,
    'exporting',
    'old finally cannot stop a replacement export',
  )
  png.cleanup()
  assert.equal(director.getCameraDirectorState(png.sceneId).transport.message, '导出已取消。')
  camera.position.set(100, 200, 300)
  await replacement
  assert.deepEqual(
    camera.position.toArray(),
    [100, 200, 300],
    'old finally cannot change the new mode camera',
  )
  assert.equal(afterEffects.size, 0)
  assert.equal(downloads, 0)

  const pendingPng = mount()
  holdEncoding = true
  const pendingExport = pendingPng.runtime.exportPngSequence()
  tick()
  await flush()
  assert.equal(encoded.length, 1)
  pendingPng.cleanup()
  camera.fov = 91
  await pendingExport
  encoded.pop()!(new Blob(['late png']))
  await flush()
  assert.equal(camera.fov, 91, 'a late PNG encoder callback cannot restore stale camera state')
  assert.equal(downloads, 0)
  holdEncoding = false

  const video = mount()
  const videoExport = video.runtime.exportVideo()
  tick()
  await flush()
  assert.equal(recorders.at(-1)!.state, 'recording')
  video.cleanup()
  assert.equal(tracks.at(-1)!.stopped, true, 'unmount releases tracks synchronously')
  assert.equal(recorders.at(-1)!.state, 'inactive')
  camera.position.set(8, 8, 8)
  await videoExport
  assert.deepEqual(camera.position.toArray(), [8, 8, 8])
  assert.equal(downloads, 0)

  const failedVideo = mount()
  failEncoderConstruction = true
  await failedVideo.runtime.exportVideo()
  assert.equal(tracks.at(-1)!.stopped, true, 'constructor failure must release its acquired stream')
  assert.match(
    director.getCameraDirectorState(failedVideo.sceneId).transport.error ?? '',
    /construction failed/,
  )
  failedVideo.cleanup()
  failEncoderConstruction = false
  actualMime = 'video/mp4'
  const wrongFormat = mount()
  const videoStart = copies.length
  const wrongFormatExport = wrongFormat.runtime.exportVideo()
  for (
    let frame = 0;
    frame < 200 &&
    director.getCameraDirectorState(wrongFormat.sceneId).transport.status === 'exporting';
    frame += 1
  ) {
    tick()
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  await wrongFormatExport
  assert.match(director.getCameraDirectorState(wrongFormat.sceneId).transport.error ?? '', /WebM/)
  assert.equal(downloads, 0, 'a non-WebM recorder result must not be mislabeled as .webm')
  assert.equal(tracks.at(-1)!.stopped, true)
  assert.deepEqual(
    copies.slice(videoStart),
    playedPositions,
    'WebM must follow the same lagged positions and exact final point as Play',
  )
  assert.deepEqual(copiedTargets.slice(videoStart), playedTargets)
  assert.deepEqual(copiedFovs.slice(videoStart), playedFovs)
  wrongFormat.cleanup()
  const framed = mount(true)
  assert.ok(framed.element)
  const frameStyle = framed.element.props.children.props.children.props.children.props.style
  assert.equal(frameStyle.width, `${(1080 / 1920 / (1280 / 720)) * 100}%`)
  assert.equal(
    frameStyle.height,
    '100%',
    'safe frame must match the full-height centered export crop',
  )
  framed.cleanup()
  frames.length = 0
  effects.length = 0
  layouts.length = 0
  const orthographic = new OrthographicCamera(-3, 3, 3, -3)
  orthographic.position.set(7, 8, 9)
  activeCamera = orthographic
  const controlsBefore = { enabled: controls.enabled, smoothTime: controls.smoothTime }
  assert.equal(CameraRehearsalSystem({ sceneId: 'orthographic' }), null)
  assert.equal(director.getCameraDirectorRuntime('orthographic'), null)
  assert.equal(
    effects.length + layouts.length + frames.length,
    0,
    'orthographic mode must not register any active runtime hooks',
  )
  assert.deepEqual(orthographic.position.toArray(), [7, 8, 9])
  assert.deepEqual({ enabled: controls.enabled, smoothTime: controls.smoothTime }, controlsBefore)
  activeCamera = camera
  assert.ok(cancellations >= 6, 'scripted camera actions cancel native camera pose transitions')
}
