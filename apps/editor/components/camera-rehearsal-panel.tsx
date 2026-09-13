'use client'

import { useScene } from '@pascal-app/core'
import {
  ActionButton,
  ActionGroup,
  PanelSection,
  SegmentedControl,
  SliderControl,
  ToggleControl,
  useIsMobile,
} from '@pascal-app/editor'
import {
  Aperture,
  CircleStop,
  Crosshair,
  Download,
  Film,
  LocateFixed,
  Play,
  Radio,
  Save,
  Video,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  type CameraControlSettings,
  type CameraEase,
  type CameraRigSettings,
  type CameraRigType,
  type CameraSequenceSettings,
  type CineCameraSettings,
  dimensionsForPreset,
  directorDuration,
  hydrateCameraDirector,
  type OutputPreset,
  type PlaybackSource,
  type RenderQueueSettings,
  type TakeRecorderSettings,
  updateCameraDirector,
  useCameraDirectorRuntime,
  useCameraDirectorState,
} from '@/lib/camera-director'
import { cameraFrameToDirectorKey } from './camera-studio/director-key'
import { useCameraStudio } from './camera-studio/store'
import './camera-studio/studio.css'

interface CameraRehearsalPanelProps {
  sceneId: string
}

const buttonIconClass = 'h-3.5 w-3.5'
const transportLabels = {
  idle: '准备就绪',
  playing: '预演中',
  recording: '记录运镜中',
  exporting: '导出中',
}

export function CameraRehearsalPanel({ sceneId }: CameraRehearsalPanelProps) {
  const mobile = useIsMobile()
  const [advanced, setAdvanced] = useState(false)
  const state = useCameraDirectorState(sceneId)
  const controller = useCameraDirectorRuntime(sceneId)
  const nodes = useScene((scene) => scene.nodes)
  const cameraStudio = useCameraStudio()
  const selectedShot = cameraStudio.project.shots.find(
    (shot) => shot.id === cameraStudio.selectedShotId,
  )
  const selectedFrame = selectedShot?.keyframes.find(
    (frame) => frame.id === cameraStudio.selectedKeyframeId,
  )
  const duration = Math.max(directorDuration(state), 0.01)
  const busy = state.transport.status !== 'idle'

  useEffect(() => hydrateCameraDirector(sceneId), [sceneId])

  const patchControl = (patch: Partial<CameraControlSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      control: { ...current.control, ...patch },
    }))
  const patchRig = (patch: Partial<CameraRigSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      rig: { ...current.rig, ...patch },
    }))
  const patchSequence = (patch: Partial<CameraSequenceSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      sequence: { ...current.sequence, ...patch },
    }))
  const patchLens = (patch: Partial<CineCameraSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      lens: { ...current.lens, ...patch },
    }))
  const patchTake = (patch: Partial<TakeRecorderSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      take: { ...current.take, ...patch },
    }))
  const patchOutput = (patch: Partial<RenderQueueSettings>) =>
    updateCameraDirector(sceneId, (current) => ({
      ...current,
      output: { ...current.output, ...patch },
    }))

  const callRuntime = (action: (runtime: NonNullable<typeof controller>) => void) => {
    if (controller) action(controller)
    else {
      updateCameraDirector(
        sceneId,
        (current) => ({
          ...current,
          transport: {
            ...current.transport,
            error: '三维画面仍在加载，请稍后再试。',
          },
        }),
        { persist: false },
      )
    }
  }

  const setOutputPreset = (preset: OutputPreset) => {
    const dimensions = dimensionsForPreset(preset)
    const scale = advanced ? 1 : 2 / 3
    patchOutput({ preset, width: dimensions.width * scale, height: dimensions.height * scale })
  }

  const copySelectedFrame = (slot: 'start' | 'end') => {
    const studio = useCameraStudio.getState()
    const shot = studio.project.shots.find((item) => item.id === studio.selectedShotId)
    const frame = shot?.keyframes.find((item) => item.id === studio.selectedKeyframeId)
    if (busy || studio.playing || studio.recording || shot?.follow || !frame) return
    try {
      updateCameraDirector(sceneId, (current) => ({
        ...current,
        sequence: {
          ...current.sequence,
          [slot]: cameraFrameToDirectorKey(
            frame,
            current.lens.sensorHeightMm,
            current.lens.focusDistanceM,
          ),
        },
        transport: {
          ...current.transport,
          error: null,
          message: `已用当前机位关键帧设置${slot === 'start' ? '起点 A' : '终点 B'}。`,
        },
      }))
    } catch (error) {
      updateCameraDirector(
        sceneId,
        (current) => ({
          ...current,
          transport: {
            ...current.transport,
            error: error instanceof Error ? error.message : '机位关键帧读取失败。',
            message: null,
          },
        }),
        { persist: false },
      )
    }
  }

  return (
    <div className="ds-rehearsal-panel flex h-full min-h-0 flex-col bg-background">
      <div className="ds-rehearsal-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2>编排</h2>
            <p className="mt-1 text-xs text-muted-foreground">镜头序列：安排起止、节奏与输出。</p>
          </div>
          <span className="ds-rehearsal-status" data-state={state.transport.status} role="status">
            {transportLabels[state.transport.status]}
          </span>
        </div>
        {!controller && (
          <p className="mt-3 text-xs text-muted-foreground">请切换到三维透视画面后播放或录制。</p>
        )}
        {busy && (
          <ActionButton
            className="mt-2 w-full"
            label="停止当前操作"
            onClick={() => callRuntime((runtime) => runtime.stop())}
          />
        )}
        {(state.transport.message || state.transport.error) && (
          <p
            className={`mt-3 text-xs leading-relaxed ${
              state.transport.error
                ? 'border-l-2 border-foreground pl-2 text-foreground'
                : 'text-muted-foreground'
            }`}
            role={state.transport.error ? 'alert' : 'status'}
          >
            {state.transport.error && '操作未完成：'}
            {state.transport.error ?? state.transport.message}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6" inert={busy}>
        <PanelSection className="ds-rehearsal-section" title="01 运动路径">
          <SegmentedControl<CameraRigType>
            onChange={(type) => patchRig({ type })}
            options={[
              { label: '固定', value: 'fixed' },
              { label: '两点移动', value: 'rail' },
              { label: '环绕', value: 'orbit' },
            ]}
            value={state.rig.type}
          />
          {state.rig.type === 'orbit' && (
            <SliderControl
              label="环绕角度"
              max={360}
              min={-360}
              onChange={(orbitDegrees) => patchRig({ orbitDegrees })}
              precision={0}
              step={5}
              unit="°"
              value={state.rig.orbitDegrees}
            />
          )}
          {state.rig.type === 'rail' && (
            <ToggleControl
              checked={state.rig.lockOrientationToRail}
              label="朝向沿移动方向"
              onChange={(lockOrientationToRail) => patchRig({ lockOrientationToRail })}
            />
          )}
          <ActionGroup>
            <ActionButton
              disabled={busy || !controller}
              icon={<Save className={buttonIconClass} />}
              label={state.sequence.start ? '更新起点 A' : '设为起点 A'}
              onClick={() => callRuntime((controller) => controller.captureKey('start'))}
            />
            <ActionButton
              disabled={busy || !controller}
              icon={<Save className={buttonIconClass} />}
              label={state.sequence.end ? '更新终点 B' : '设为终点 B'}
              onClick={() => callRuntime((controller) => controller.captureKey('end'))}
            />
          </ActionGroup>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedShot && selectedFrame
                ? `当前机位：${selectedShot.name} · ${selectedFrame.time.toFixed(1)} 秒`
                : '先在“机位”中选中一个关键帧，再带入编排。'}
            </p>
            <ActionButton
              disabled={
                busy ||
                cameraStudio.playing ||
                cameraStudio.recording ||
                !selectedFrame ||
                !!selectedShot?.follow
              }
              label="用当前关键帧设置起点 A"
              onClick={() => copySelectedFrame('start')}
            />
            <ActionButton
              disabled={
                busy ||
                cameraStudio.playing ||
                cameraStudio.recording ||
                !selectedFrame ||
                !!selectedShot?.follow
              }
              label="用当前关键帧设置终点 B"
              onClick={() => copySelectedFrame('end')}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedShot?.follow
                ? '当前机位正在跟随对象；请先关闭目标跟随，或从主画面设置起止。'
                : '只复制所选关键帧，整条运镜与此处的序列分别保存。'}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            摄像机看向
            <select
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-foreground"
              value={state.lens.focusTargetId ?? ''}
              onChange={(event) => patchLens({ focusTargetId: event.target.value || null })}
            >
              <option value="">使用当前注视点</option>
              {Object.values(nodes).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name || node.id}
                </option>
              ))}
            </select>
          </label>
          <ActionButton
            disabled={busy || !controller}
            icon={<Crosshair className={buttonIconClass} />}
            label="看向所选对象"
            onClick={() => callRuntime((controller) => controller.focusSelection())}
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            从当前视角设置起点和终点。固定保持位置，两点移动连接 A/B，环绕围绕注视点转动。
          </p>
        </PanelSection>

        <PanelSection className="ds-rehearsal-section" title="02 播放预演">
          <SegmentedControl<PlaybackSource>
            onChange={(source) => patchSequence({ source })}
            options={[
              { label: '起点到终点', value: 'sequence' },
              { label: `手动运镜（${state.take.keys.length} 帧）`, value: 'take' },
            ]}
            value={state.sequence.source}
          />
          <SegmentedControl<CameraEase>
            onChange={(easing) => patchSequence({ easing })}
            options={[
              { label: '匀速', value: 'linear' },
              { label: '平滑起止', value: 'auto' },
              { label: '逐渐加速', value: 'ease-in' },
              { label: '逐渐减速', value: 'ease-out' },
            ]}
            value={state.sequence.easing}
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            选择移动节奏，再拖动时间线或播放查看。
          </p>
          <SliderControl
            label="序列时长"
            max={30}
            min={0.5}
            onChange={(durationValue) => patchSequence({ duration: durationValue })}
            precision={1}
            step={0.5}
            unit="秒"
            value={state.sequence.duration}
          />
          <label className="flex flex-col gap-1.5 px-1 py-1 text-xs text-muted-foreground">
            <span className="flex items-center justify-between">
              <span>当前时间</span>
              <span className="font-mono tabular-nums">
                {state.transport.currentTime.toFixed(2)} / {duration.toFixed(2)} 秒
              </span>
            </span>
            <input
              aria-label="预演时间线"
              className="accent-primary"
              disabled={
                !controller ||
                state.transport.status === 'recording' ||
                state.transport.status === 'exporting'
              }
              max={duration}
              min={0}
              onChange={(event) =>
                callRuntime((controller) => controller.seek(Number(event.currentTarget.value)))
              }
              step={1 / state.output.fps}
              type="range"
              value={Math.min(state.transport.currentTime, duration)}
            />
          </label>
          <ActionGroup>
            <ActionButton
              disabled={
                !controller ||
                state.transport.status === 'recording' ||
                state.transport.status === 'exporting'
              }
              icon={<Play className={buttonIconClass} />}
              label="播放预演"
              onClick={() => callRuntime((controller) => controller.play())}
            />
            <ActionButton
              disabled={!controller || state.transport.status === 'idle'}
              icon={<CircleStop className={buttonIconClass} />}
              label="停止预演"
              onClick={() => callRuntime((controller) => controller.stop())}
            />
          </ActionGroup>
        </PanelSection>

        <PanelSection className="ds-rehearsal-section" title="03 运动平滑" defaultExpanded={false}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            让摄像机逐渐跟上目标位置和朝向，减轻突然转向。
          </p>
          <ToggleControl
            checked={state.control.enabled}
            label="启用平滑运动"
            onChange={(enabled) => patchControl({ enabled })}
          />
          <SliderControl
            label="位置跟进速度"
            max={30}
            min={0}
            onChange={(positionLagSpeed) => patchControl({ positionLagSpeed })}
            precision={1}
            step={0.5}
            value={state.control.positionLagSpeed}
          />
          <SliderControl
            label="朝向跟进速度"
            max={30}
            min={0}
            onChange={(rotationLagSpeed) => patchControl({ rotationLagSpeed })}
            precision={1}
            step={0.5}
            value={state.control.rotationLagSpeed}
          />
          <SliderControl
            label="最大移动速度"
            max={100}
            min={0.5}
            onChange={(maxSpeed) => patchControl({ maxSpeed })}
            precision={1}
            step={0.5}
            unit="米/秒"
            value={state.control.maxSpeed}
          />
          <SliderControl
            label="允许落后距离"
            max={1000}
            min={0}
            onChange={(maxDistance) => patchControl({ maxDistance })}
            precision={2}
            step={0.05}
            unit="米"
            value={state.control.maxDistance}
          />
          <ToggleControl
            checked={state.control.useSubstepping}
            label="提高平滑计算精度"
            onChange={(useSubstepping) => patchControl({ useSubstepping })}
          />
          {state.control.useSubstepping && (
            <SliderControl
              label="每步计算间隔"
              max={1 / 24}
              min={1 / 240}
              onChange={(maxTimeStep) => patchControl({ maxTimeStep })}
              precision={4}
              step={0.001}
              unit="秒"
              value={state.control.maxTimeStep}
            />
          )}
        </PanelSection>

        <PanelSection className="ds-rehearsal-section" title="04 镜头参数" defaultExpanded={false}>
          <SliderControl
            label="传感器宽度"
            max={70}
            min={8}
            onChange={(sensorWidthMm) => patchLens({ sensorWidthMm })}
            precision={2}
            step={0.5}
            unit="毫米"
            value={state.lens.sensorWidthMm}
          />
          <SliderControl
            label="传感器高度"
            max={50}
            min={4}
            onChange={(sensorHeightMm) => patchLens({ sensorHeightMm })}
            precision={2}
            step={0.25}
            unit="毫米"
            value={state.lens.sensorHeightMm}
          />
          <SliderControl
            label="焦距"
            max={200}
            min={8}
            onChange={(focalLengthMm) => patchLens({ focalLengthMm })}
            precision={1}
            step={1}
            unit="毫米"
            value={state.lens.focalLengthMm}
          />
          <SliderControl
            label="光圈"
            max={22}
            min={1.2}
            onChange={(aperture) => patchLens({ aperture })}
            precision={1}
            step={0.1}
            unit="f/"
            value={state.lens.aperture}
          />
          <SliderControl
            label="手动对焦距离"
            max={1000}
            min={0.1}
            onChange={(focusDistanceM) => patchLens({ focusDistanceM, focusTargetId: null })}
            precision={2}
            step={0.1}
            unit="米"
            value={state.lens.focusDistanceM}
          />
          <ToggleControl
            checked={state.lens.smoothFocusChanges}
            label="平滑对焦变化"
            onChange={(smoothFocusChanges) => patchLens({ smoothFocusChanges })}
          />
          {state.lens.smoothFocusChanges && (
            <SliderControl
              label="焦点跟进速度"
              max={30}
              min={0}
              onChange={(focusSmoothingSpeed) => patchLens({ focusSmoothingSpeed })}
              precision={1}
              step={0.5}
              value={state.lens.focusSmoothingSpeed}
            />
          )}
          <div className="flex items-center gap-2 rounded border border-border bg-white/[0.025] px-3 py-3 text-xs text-muted-foreground leading-relaxed">
            <Aperture className="h-3.5 w-3.5 shrink-0" />
            <span>传感器高度与焦距控制视场。宽度、光圈与对焦保存为参数，当前不产生景深虚化。</span>
          </div>
        </PanelSection>

        <PanelSection
          className="ds-rehearsal-section"
          title="05 记录手动运镜"
          defaultExpanded={false}
        >
          <p className="text-xs text-muted-foreground leading-relaxed">
            记录你拖动视角的过程，保存后可在“播放预演”中重复播放。
          </p>
          <SegmentedControl<'24' | '30' | '60'>
            onChange={(sampleRate) =>
              patchTake({ sampleRate: Number(sampleRate) as TakeRecorderSettings['sampleRate'] })
            }
            options={[
              { label: '24 帧/秒', value: '24' },
              { label: '30 帧/秒', value: '30' },
              { label: '60 帧/秒', value: '60' },
            ]}
            value={String(state.take.sampleRate) as '24' | '30' | '60'}
          />
          <ToggleControl
            checked={state.take.reduceKeys}
            label="精简重复关键帧"
            onChange={(reduceKeys) => patchTake({ reduceKeys })}
          />
          {state.take.reduceKeys && (
            <SliderControl
              label="允许的位置误差"
              max={0.5}
              min={0.001}
              onChange={(tolerance) => patchTake({ tolerance })}
              precision={3}
              step={0.005}
              unit="米"
              value={state.take.tolerance}
            />
          )}
          <ActionGroup>
            <ActionButton
              disabled={busy || !controller}
              icon={<Radio className={buttonIconClass} />}
              label="开始记录运镜"
              onClick={() => callRuntime((controller) => controller.startRecording())}
            />
            <ActionButton
              disabled={state.transport.status !== 'recording'}
              icon={<CircleStop className={buttonIconClass} />}
              label="结束记录运镜"
              onClick={() => callRuntime((controller) => controller.stopRecording())}
            />
          </ActionGroup>
          <p className="px-1 font-mono text-xs text-muted-foreground">
            已采样 {state.take.rawSampleCount} 帧，保存 {state.take.keys.length} 个关键帧
          </p>
        </PanelSection>

        <PanelSection className="ds-rehearsal-section" title="06 输出视频" defaultExpanded={false}>
          <ToggleControl
            checked={advanced}
            label="高级设置 · 1080p 与编码参数"
            onChange={(enabled) => {
              setAdvanced(enabled)
              const size = dimensionsForPreset(state.output.preset)
              const scale = enabled ? 1 : 2 / 3
              patchOutput({
                width: size.width * scale,
                height: size.height * scale,
                ...(!enabled ? { fps: 24, bitrateMbps: 4 } : {}),
              })
            }}
          />
          <SegmentedControl<OutputPreset>
            onChange={setOutputPreset}
            options={[
              { label: '竖屏 9:16', value: 'vertical' },
              { label: '横屏 16:9', value: 'landscape' },
              { label: '方形 1:1', value: 'square' },
            ]}
            value={state.output.preset}
          />
          {advanced && (
            <>
              <SegmentedControl<'24' | '25' | '30' | '50' | '60'>
                onChange={(fps) => patchOutput({ fps: Number(fps) as RenderQueueSettings['fps'] })}
                options={[
                  { label: '24', value: '24' },
                  { label: '25', value: '25' },
                  { label: '30', value: '30' },
                  { label: '50', value: '50' },
                  { label: '60', value: '60' },
                ]}
                value={String(state.output.fps) as '24' | '25' | '30' | '50' | '60'}
              />
              <SliderControl
                label="视频码率"
                max={40}
                min={2}
                onChange={(bitrateMbps) => patchOutput({ bitrateMbps })}
                precision={0}
                step={1}
                unit="Mbps"
                value={state.output.bitrateMbps}
              />
            </>
          )}
          <ToggleControl
            checked={state.output.safeFrame}
            label="显示输出范围"
            onChange={(safeFrame) => patchOutput({ safeFrame })}
          />
          <div className="flex items-center justify-between gap-2 rounded border border-border bg-white/[0.025] px-3 py-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              输出分辨率
            </span>
            <span className="font-mono text-foreground/70">
              {state.output.width}×{state.output.height} · {state.output.fps} 帧/秒
            </span>
          </div>
          <ActionButton
            disabled={busy || !controller}
            icon={<Video className={buttonIconClass} />}
            label="录制视频（WebM）"
            onClick={() => callRuntime((controller) => void controller.exportVideo())}
          />
          {!mobile && (
            <ActionButton
              disabled={busy || !controller}
              icon={<Download className={buttonIconClass} />}
              label="导出逐帧图片（PNG）"
              onClick={() => callRuntime((controller) => void controller.exportPngSequence())}
            />
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            视频可直接回放；逐帧图片打包下载，适合后期合成。
          </p>
        </PanelSection>
      </div>

      <div className="ds-rehearsal-footer">
        <span className="flex items-center gap-1.5">
          <LocateFixed className="h-3 w-3" />
          起点 {state.sequence.start ? '已设置' : '未设置'} · 终点{' '}
          {state.sequence.end ? '已设置' : '未设置'}
        </span>
        <span>镜头序列</span>
      </div>
    </div>
  )
}
