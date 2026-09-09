'use client'

import { useScene } from '@pascal-app/core'
import { useEffect, useRef } from 'react'
import { useCameraStudio } from '../camera-studio/store'
import { MAX_STAGE_LIGHTS, type StageLight, validateLightingProject } from './model'
import { useLighting } from './store'

const FIELD_CLASS = 'flex min-w-0 flex-col gap-2 text-xs text-muted-foreground'
const INPUT_CLASS =
  'min-w-0 w-full rounded border border-border bg-background px-2 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'
const BUTTON_CLASS = 'text-xs hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40'

function PositionFields({
  label,
  value,
  onChange,
}: {
  label: string
  value: StageLight['position']
  onChange: (position: StageLight['position']) => void
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-xs text-muted-foreground">{label}（米）</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <label className={FIELD_CLASS} key={axis}>
            {axis}
            <input
              className={INPUT_CLASS}
              aria-label={`${label} ${axis}`}
              type="number"
              step="0.05"
              value={Number(value[index]!.toFixed(3))}
              onChange={(event) => {
                if (!Number.isFinite(event.target.valueAsNumber)) return
                const next: StageLight['position'] = [...value]
                next[index] = event.target.valueAsNumber
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function LightingPanel({ sceneId }: { sceneId: string }) {
  const state = useLighting()
  const busy = useCameraStudio((camera) => camera.playing || camera.previewing || camera.recording)
  const readOnly = useScene((scene) => scene.readOnly)
  const inputRef = useRef<HTMLInputElement>(null)
  const importVersion = useRef(0)
  const light = state.project.lights.find((item) => item.id === state.selectedLightId)
  const locked = busy || readOnly || state.loadedSceneId !== sceneId || state.draft !== null

  // biome-ignore lint/correctness/useExhaustiveDependencies: A scene change cancels reads even when this panel stays mounted.
  useEffect(() => {
    return () => {
      importVersion.current += 1
    }
  }, [sceneId])

  const edit = (action: (current: ReturnType<typeof useLighting.getState>) => void) => {
    const camera = useCameraStudio.getState()
    const current = useLighting.getState()
    if (
      camera.playing ||
      camera.previewing ||
      camera.recording ||
      useScene.getState().readOnly ||
      current.draft ||
      current.loadedSceneId !== sceneId
    )
      return
    try {
      action(current)
    } catch (error) {
      current.setNotice(error instanceof Error ? error.message : '布光修改未完成，请检查参数。')
    }
  }
  const patch = (values: Partial<StageLight>) => {
    if (light) edit((current) => current.updateLight(light.id, values))
  }

  return (
    <section className="studio-picture-section" aria-label="布光">
      <h3>布光</h3>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        添加聚光灯，在舞台中调整灯位与照射点。
      </p>
      {busy && (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground" role="status">
          预演、取景或录制期间布光已锁定；停止并还原后可继续调整。
        </p>
      )}
      {state.loadedSceneId !== sceneId && (
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          正在读取当前场景的布光。
        </p>
      )}
      {state.notice && (
        <p className="mb-3 text-xs leading-relaxed" role="status">
          {state.notice}
        </p>
      )}
      <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0" disabled={locked}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={state.project.lights.length >= MAX_STAGE_LIGHTS}
            onClick={() => edit((current) => current.addLight())}
          >
            添加聚光灯
          </button>
          <span className="text-xs text-muted-foreground">
            {state.project.lights.length} / {MAX_STAGE_LIGHTS} 盏
          </span>
        </div>
        {state.project.lights.length === 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            尚未布光。添加第一盏灯，再设置它照向的位置。
          </p>
        )}
        {state.project.lights.length > 0 && (
          <label className={FIELD_CLASS}>
            当前灯光
            <select
              className={INPUT_CLASS}
              value={state.selectedLightId ?? ''}
              onChange={(event) => edit((current) => current.selectLight(event.target.value))}
            >
              {!light && <option value="">选择灯光</option>}
              {state.project.lights.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.enabled ? '' : '（已关闭）'}
                </option>
              ))}
            </select>
          </label>
        )}
        {light && (
          <>
            <label className={FIELD_CLASS}>
              灯光名称
              <input
                className={INPUT_CLASS}
                maxLength={100}
                value={light.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={light.enabled}
                  onChange={(event) => patch({ enabled: event.target.checked })}
                />
                启用灯光
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.showHelpers}
                  onChange={(event) =>
                    edit((current) => current.setShowHelpers(event.target.checked))
                  }
                />
                显示灯位
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['position', '编辑灯位'],
                  ['target', '编辑照射点'],
                ] as const
              ).map(([target, label]) => (
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  key={target}
                  aria-pressed={state.editTarget === target && state.showHelpers}
                  onClick={() =>
                    edit((current) => {
                      current.setShowHelpers(true)
                      current.setEditTarget(target)
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <PositionFields
              label="灯位"
              value={light.position}
              onChange={(position) => patch({ position })}
            />
            <PositionFields
              label="照射点"
              value={light.target}
              onChange={(target) => patch({ target })}
            />
            <label className={FIELD_CLASS}>
              强度
              <input
                className={INPUT_CLASS}
                type="number"
                min={0}
                max={1000}
                step={1}
                value={light.intensity}
                onChange={(event) => {
                  if (Number.isFinite(event.target.valueAsNumber))
                    patch({ intensity: event.target.valueAsNumber })
                }}
              />
            </label>
            <label className={FIELD_CLASS}>
              颜色
              <input
                className={`${INPUT_CLASS} h-9 p-1`}
                type="color"
                value={light.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={FIELD_CLASS}>
                光束角（度）
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={5}
                  max={90}
                  step={1}
                  value={light.angle}
                  onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber))
                      patch({ angle: event.target.valueAsNumber })
                  }}
                />
              </label>
              <label className={FIELD_CLASS}>
                柔边（0–1）
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={light.penumbra}
                  onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber))
                      patch({ penumbra: event.target.valueAsNumber })
                  }}
                />
              </label>
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={!state.past.length}
            onClick={() => edit((current) => current.undo())}
          >
            撤销布光修改
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={!state.future.length}
            onClick={() => edit((current) => current.redo())}
          >
            重做
          </button>
          {light && (
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => edit((current) => current.removeLight(light.id))}
            >
              删除灯光
            </button>
          )}
        </div>
        <details className="border-t border-border pt-3 text-xs">
          <summary className="cursor-pointer py-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-foreground">
            布光工程
          </summary>
          <p className="my-3 leading-relaxed text-muted-foreground">
            布光按当前场景保存在本浏览器。工程仅包含灯光，请与舞台场景分别备份；导入会替换当前布光。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() =>
                edit((current) => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(current.project, null, 2)], {
                      type: 'application/json',
                    }),
                  )
                  const link = document.createElement('a')
                  link.href = url
                  link.download = '咫台-布光工程.json'
                  link.click()
                  setTimeout(() => URL.revokeObjectURL(url), 30_000)
                })
              }
            >
              导出布光工程
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => edit(() => inputRef.current?.click())}
            >
              导入布光工程
            </button>
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file || locked) return
              const version = ++importVersion.current
              const previous = useLighting.getState().project
              try {
                if (file.size > 2_000_000) throw new Error('布光工程不能超过 2 MB。')
                const project = validateLightingProject(JSON.parse(await file.text()))
                const current = useLighting.getState()
                if (version !== importVersion.current || current.loadedSceneId !== sceneId) return
                const camera = useCameraStudio.getState()
                if (camera.playing || camera.previewing || camera.recording)
                  throw new Error('请停止并还原预演或录制后，再导入布光工程。')
                if (current.project !== previous || current.draft)
                  throw new Error('布光已有新的修改，请重新选择工程文件。')
                edit((latest) => latest.setProject(project))
              } catch (error) {
                if (
                  version === importVersion.current &&
                  useLighting.getState().loadedSceneId === sceneId
                ) {
                  useLighting
                    .getState()
                    .setNotice(
                      error instanceof Error
                        ? error.message
                        : '布光工程读取失败，请检查 JSON 文件。',
                    )
                }
              }
            }}
          />
        </details>
      </fieldset>
    </section>
  )
}
