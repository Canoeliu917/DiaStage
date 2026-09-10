'use client'

import { type AnyNodeId, sceneRegistry, useScene } from '@pascal-app/core'
import { ItemsPanel, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Vector3 } from 'three'
import { ZodError } from 'zod'
import { rehearsalWarnings, stageDirection } from '@/lib/theatre/blocking'
import { addEmptyTableExample } from '@/lib/theatre/new-production'
import {
  readTheatreDocument,
  restoreRehearsalTake,
  saveRehearsalTake,
  writeTheatreDocument,
} from '@/lib/theatre/scene-adapter'
import {
  activeRehearsalScene,
  createRehearsalScene,
  createTheatreDocument,
  type RehearsalScene,
  type TheatreDocument,
  theatreId,
  VENUE_TEMPLATES,
  type Vec3,
} from '@/lib/theatre/schema'
import { getStageNodeSelection } from '../stage-overview-data'
import { openStudioPanel } from '../studio-navigation'
import { useRehearsalPlayback, useTheatreDocument } from './state'
import './theatre.css'

type Section = 'venue' | 'roles' | 'marks' | 'paths' | 'props' | 'scenes' | 'takes' | 'observation'
const TITLES: Record<Section, string> = {
  venue: '演出空间',
  roles: '人物与行动',
  marks: '舞台标记',
  paths: '走位与调度',
  props: '道具与交接',
  scenes: '场次与节拍',
  takes: '排演版本',
  observation: '观察与记录',
}
const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
const num = (data: FormData, key: string) => {
  const raw = text(data, key),
    value = Number(raw)
  if (!raw || !Number.isFinite(value)) throw new Error('请填写有效数值')
  return value
}
const position = (data: FormData): Vec3 => [num(data, 'x'), num(data, 'y'), num(data, 'z')]
const angle = (data: FormData) => (num(data, 'facing') * Math.PI) / 180

function focusScene(document: TheatreDocument) {
  const nodes = useScene.getState().nodes
  const scene = activeRehearsalScene(document)
  const object =
    Object.values(nodes).find((node) => node.metadata.rehearsalSceneId === scene.id) ??
    Object.values(nodes).find((node) => node.type === 'level')
  if (object)
    useViewer
      .getState()
      .setSelection({ ...getStageNodeSelection(nodes, object.id), selectedIds: [] })
  useRehearsalPlayback.setState({ observation: 'audience' })
}

function Field({
  label,
  name,
  value = '',
  numeric = false,
  required = false,
}: {
  label: string
  name: string
  value?: string | number
  numeric?: boolean
  required?: boolean
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        type={numeric ? 'number' : 'text'}
        step={numeric ? 'any' : undefined}
        required={required || numeric}
      />
    </label>
  )
}
function Position({ value = [0, 0, 0] }: { value?: Vec3 }) {
  return (
    <div className="th-grid">
      {['X · 左右（米）', 'Y · 高度（米）', 'Z · 前后（米）'].map((label, i) => (
        <Field key={label} label={label} name={['x', 'y', 'z'][i]!} value={value[i]} numeric />
      ))}
    </div>
  )
}
function Choice({
  label,
  name,
  options,
  value = '',
  optional = false,
}: {
  label: string
  name: string
  options: { id: string; name: string }[]
  value?: string
  optional?: boolean
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} required={!optional}>
        {optional && <option value="">无 / 已放下</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}
function Form({
  title,
  children,
  submit,
  run,
  onDelete,
}: {
  title: string
  children: ReactNode
  submit: (data: FormData) => void
  run: (action: () => void) => void
  onDelete?: () => void
}) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    run(() => submit(data))
  }
  return (
    <details className="th-card">
      <summary>{title}</summary>
      <form onSubmit={onSubmit}>
        {children}
        <div className="th-buttons">
          <button type="submit">保存</button>
          {onDelete && (
            <button type="button" onClick={() => run(onDelete)}>
              删除
            </button>
          )}
        </div>
      </form>
    </details>
  )
}

export function TheatrePanel({ section }: { section: Section }) {
  const { document, error: loadError } = useTheatreDocument()
  const readOnly = useScene((s) => s.readOnly)
  const exclusive = useEditor((s) => s.isCaptureMode || s.isFirstPersonMode || s.isPreviewMode)
  const playing = useRehearsalPlayback((s) => s.playing)
  const [notice, setNotice] = useState('')
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const scene = document ? activeRehearsalScene(document) : null
  const run = (action: () => void) => {
    try {
      action()
      setNotice('已提交，随剧目自动保存。')
    } catch (error) {
      setNotice(
        error instanceof ZodError
          ? [...new Set(error.issues.map((issue) => issue.message))].join('；')
          : error instanceof Error
            ? error.message
            : '操作失败，请重试',
      )
    }
  }
  const update = (change: (doc: TheatreDocument) => void) => {
    useRehearsalPlayback.getState().stop()
    const current = readTheatreDocument()
    if (!current) throw new Error('请先建立排演')
    const next = structuredClone(current)
    change(next)
    writeTheatreDocument(next)
    if (next.activeSceneId !== current.activeSceneId) focusScene(next)
  }
  const editScene = (change: (scene: RehearsalScene) => void) =>
    update((doc) => change(activeRehearsalScene(doc)))
  const count = scene
    ? `${scene.roles.length} 位人物 · ${scene.paths.length} 条走位 · ${scene.actions.length} 个行动`
    : '从人物目标开始组织一场戏'
  return (
    <section className="theatre-panel" aria-label={TITLES[section]}>
      <header>
        <span className="th-eyebrow">DIASTAGE / REHEARSAL</span>
        <h2>{TITLES[section]}</h2>
        <p>{count}</p>
      </header>
      {(loadError || notice) && (
        <p className="th-notice" role="status">
          {notice || loadError}
        </p>
      )}
      <fieldset disabled={section !== 'observation' && (readOnly || exclusive || playing)}>
        {!document && !loadError && (
          <>
            <p>为这个舞台建立剧目、人物和行动记录。已有布景将保留。</p>
            <button
              type="button"
              onClick={() =>
                run(() => {
                  writeTheatreDocument(createTheatreDocument())
                })
              }
            >
              建立戏剧排演
            </button>
          </>
        )}
        {document && scene && (
          <>
            <label>
              当前场次
              <select
                aria-label="当前场次"
                disabled={readOnly || exclusive || playing}
                value={document.activeSceneId}
                onChange={(event) =>
                  run(() =>
                    update((doc) => {
                      doc.activeSceneId = event.target.value
                    }),
                  )
                }
              >
                {document.scenes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.number} · {entry.name}
                  </option>
                ))}
              </select>
            </label>
            {section === 'venue' && (
              <>
                <p>
                  台左 / 台右以演员面向观众为准。X 正向台左，Z 正向台前；台口 PL 在表演区前沿，中线
                  CL 经过场地原点（当前 X = {document.venue.origin[0]} 米）。
                </p>
                <div className="th-templates">
                  {VENUE_TEMPLATES.map((template) => (
                    <button
                      key={template.type}
                      type="button"
                      aria-pressed={document.venue.type === template.type}
                      onClick={() =>
                        run(() =>
                          update((doc) => {
                            doc.venue = {
                              ...template,
                              id: doc.venue.id,
                              origin: [...template.origin],
                            }
                          }),
                        )
                      }
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
                <Form
                  key={JSON.stringify(document.venue)}
                  title={`空间尺寸 · ${document.venue.name}`}
                  run={run}
                  submit={(data) =>
                    update((doc) => {
                      doc.venue = {
                        ...doc.venue,
                        name: text(data, 'name'),
                        width: num(data, 'width'),
                        depth: num(data, 'depth'),
                        height: num(data, 'height'),
                        origin: position(data),
                      }
                    })
                  }
                >
                  <Field label="空间名称" name="name" value={document.venue.name} required />
                  <div className="th-grid">
                    {(['width', 'depth', 'height'] as const).map((key, i) => (
                      <Field
                        key={key}
                        label={['宽（米）', '深（米）', '净高（米）'][i]!}
                        name={key}
                        value={document.venue[key]}
                        numeric
                      />
                    ))}
                  </div>
                  <Position value={document.venue.origin} />
                  <p>同步表演区边界与新建舞台地面；已有布景保持原位置与尺寸。</p>
                </Form>
              </>
            )}
            {section === 'roles' && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    run(() => {
                      focusScene(addEmptyTableExample())
                    })
                  }
                >
                  添加《空桌》排演范例
                </button>
                <p>为人物写下“想改变谁的什么”，再用走位和道具留下行动的证据。</p>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      editScene((s) => {
                        s.roles.push({
                          id: theatreId('role'),
                          name: `人物 ${s.roles.length + 1}`,
                          color: ['#79a8be', '#d1ad67', '#af9abd'][s.roles.length % 3]!,
                          height: 1.7,
                          position: [
                            document.venue.origin[0] +
                              Math.min(s.roles.length * 0.6, document.venue.width / 2 - 0.3),
                            document.venue.origin[1],
                            document.venue.origin[2],
                          ],
                          facing: 0,
                          objective: '',
                          entry: '台右侧',
                          exit: '台左侧',
                        })
                      }),
                    )
                  }
                >
                  添加人物替身
                </button>
                {scene.roles.map((role) => (
                  <Form
                    key={`${role.id}:${JSON.stringify(role)}`}
                    title={`${role.name} · ${stageDirection(role.position, document.venue)}`}
                    run={run}
                    onDelete={() =>
                      editScene((s) => {
                        s.roles = s.roles.filter((r) => r.id !== role.id)
                      })
                    }
                    submit={(data) =>
                      editScene((s) => {
                        const r = s.roles.find((r) => r.id === role.id)!
                        Object.assign(r, {
                          name: text(data, 'name'),
                          color: text(data, 'color'),
                          height: num(data, 'height'),
                          position: position(data),
                          facing: angle(data),
                          objective: text(data, 'objective'),
                          entry: text(data, 'entry'),
                          exit: text(data, 'exit'),
                        })
                      })
                    }
                  >
                    <Field label="人物名称" name="name" value={role.name} required />
                    <label>
                      人物颜色
                      <input type="color" name="color" defaultValue={role.color} />
                    </label>
                    <Field label="身高（米）" name="height" value={role.height} numeric />
                    <Position value={role.position} />
                    <Field
                      label="面向（度；0 面向观众）"
                      name="facing"
                      value={(role.facing * 180) / Math.PI}
                      numeric
                    />
                    <Field label="人物目标" name="objective" value={role.objective} />
                    <div className="th-grid">
                      <Field label="上场口" name="entry" value={role.entry} />
                      <Field label="下场口" name="exit" value={role.exit} />
                    </div>
                  </Form>
                ))}
                <h3>行动与阻力</h3>
                {scene.beats.length === 0 && (
                  <button type="button" onClick={() => openStudioPanel('theatre-scenes')}>
                    先建立一个节拍
                  </button>
                )}
                {scene.roles.length > 0 && scene.beats.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      run(() =>
                        editScene((s) => {
                          const b = s.beats[0]!
                          s.actions.push({
                            id: theatreId('action'),
                            beatId: b.id,
                            actorId: s.roles[0]!.id,
                            verb: '递出',
                            desiredChange: '让对方接收',
                            resistance: '对方拒绝',
                            start: b.start,
                            end: b.end,
                          })
                        }),
                      )
                    }
                  >
                    添加行动
                  </button>
                )}
                {scene.actions.map((action) => (
                  <Form
                    key={`${action.id}:${JSON.stringify(action)}`}
                    title={`${scene.roles.find((r) => r.id === action.actorId)?.name} · ${action.verb}`}
                    run={run}
                    onDelete={() =>
                      editScene((s) => {
                        s.actions = s.actions.filter((a) => a.id !== action.id)
                      })
                    }
                    submit={(data) =>
                      editScene((s) => {
                        Object.assign(s.actions.find((a) => a.id === action.id)!, {
                          beatId: text(data, 'beatId'),
                          actorId: text(data, 'actorId'),
                          targetRoleId: text(data, 'targetRoleId') || undefined,
                          verb: text(data, 'verb'),
                          desiredChange: text(data, 'desiredChange'),
                          resistance: text(data, 'resistance'),
                          propId: text(data, 'propId') || undefined,
                          start: num(data, 'start'),
                          end: num(data, 'end'),
                        })
                      })
                    }
                  >
                    <Choice
                      label="所属节拍"
                      name="beatId"
                      options={scene.beats}
                      value={action.beatId}
                    />
                    <Choice
                      label="行动人物"
                      name="actorId"
                      options={scene.roles}
                      value={action.actorId}
                    />
                    <Choice
                      label="行动对象"
                      name="targetRoleId"
                      options={scene.roles}
                      value={action.targetRoleId}
                      optional
                    />
                    <Field label="可执行动词" name="verb" value={action.verb} required />
                    <Field
                      label="希望对方发生的变化"
                      name="desiredChange"
                      value={action.desiredChange}
                    />
                    <Field label="遭遇的阻力" name="resistance" value={action.resistance} />
                    <Choice
                      label="使用道具"
                      name="propId"
                      options={scene.props}
                      value={action.propId}
                      optional
                    />
                    <div className="th-grid">
                      <Field label="开始（秒）" name="start" value={action.start} numeric />
                      <Field label="结束（秒）" name="end" value={action.end} numeric />
                    </div>
                  </Form>
                ))}
                <button type="button" onClick={() => openStudioPanel('theatre-paths')}>
                  安排走位 →
                </button>
              </>
            )}
            {section === 'marks' && (
              <>
                <p>标记是人物走位的落点。位置使用米，方向以演员面向观众为基准。</p>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      editScene((s) => {
                        s.marks.push({
                          id: theatreId('mark'),
                          label: `点 ${s.marks.length + 1}`,
                          position: [...document.venue.origin],
                          facing: 0,
                          pause: 0,
                        })
                      }),
                    )
                  }
                >
                  添加走位点
                </button>
                {scene.marks.map((mark) => (
                  <Form
                    key={`${mark.id}:${JSON.stringify(mark)}`}
                    title={`${mark.label} · ${stageDirection(mark.position, document.venue)}`}
                    run={run}
                    onDelete={() =>
                      editScene((s) => {
                        s.marks = s.marks.filter((m) => m.id !== mark.id)
                      })
                    }
                    submit={(data) =>
                      editScene((s) => {
                        Object.assign(s.marks.find((m) => m.id === mark.id)!, {
                          label: text(data, 'label'),
                          position: position(data),
                          facing: angle(data),
                          pause: num(data, 'pause'),
                        })
                      })
                    }
                  >
                    <Field label="标记名称" name="label" value={mark.label} required />
                    <Position value={mark.position} />
                    <Field
                      label="停留朝向（度）"
                      name="facing"
                      value={(mark.facing * 180) / Math.PI}
                      numeric
                    />
                    <Field label="停顿（秒）" name="pause" value={mark.pause} numeric />
                  </Form>
                ))}
              </>
            )}
            {section === 'paths' && (
              <>
                <p>按顺序串联走位点，设置速度、停顿和移动原因。播放只改变预演位置。</p>
                <button type="button" onClick={() => openStudioPanel('theatre-marks')}>
                  编辑舞台标记
                </button>
                {scene.roles.length > 0 && scene.marks.length >= 2 ? (
                  <Form
                    title="新建走位"
                    run={run}
                    submit={(data) =>
                      editScene((s) => {
                        const ordered = text(data, 'order')
                          .split(',')
                          .map((v) => Number(v.trim()))
                        const markIds = ordered.map((i) => {
                          const m = s.marks[i - 1]
                          if (!Number.isInteger(i) || !m) throw new Error('走位点序号无效')
                          return m.id
                        })
                        s.paths.push({
                          id: theatreId('path'),
                          roleId: text(data, 'role'),
                          markIds,
                          startTime: num(data, 'start'),
                          speed: num(data, 'speed'),
                          reason: text(data, 'reason'),
                        })
                      })
                    }
                  >
                    <Choice label="人物" name="role" options={scene.roles} />
                    <p>{scene.marks.map((m, i) => `${i + 1}=${m.label}`).join('；')}</p>
                    <Field label="走位点顺序（英文逗号分隔）" name="order" value="1,2" required />
                    <Field label="开始（秒）" name="start" value={0} numeric />
                    <Field label="速度（米 / 秒）" name="speed" value={1} numeric />
                    <Field label="为什么移动" name="reason" required />
                  </Form>
                ) : (
                  <p>先添加人物和至少两个走位点。</p>
                )}
                {scene.paths.map((path) => (
                  <Form
                    key={`${path.id}:${JSON.stringify(path)}`}
                    title={`${scene.roles.find((r) => r.id === path.roleId)?.name} · 走位`}
                    run={run}
                    onDelete={() =>
                      editScene((s) => {
                        s.paths = s.paths.filter((p) => p.id !== path.id)
                      })
                    }
                    submit={(data) =>
                      editScene((s) => {
                        const markIds = text(data, 'order')
                          .split(',')
                          .map((raw) => {
                            const index = Number(raw.trim()),
                              mark = s.marks[index - 1]
                            if (!Number.isInteger(index) || !mark) throw new Error('走位点序号无效')
                            return mark.id
                          })
                        Object.assign(s.paths.find((p) => p.id === path.id)!, {
                          roleId: text(data, 'role'),
                          markIds,
                          startTime: num(data, 'start'),
                          speed: num(data, 'speed'),
                          reason: text(data, 'reason'),
                        })
                      })
                    }
                  >
                    <p>
                      {path.markIds
                        .map((id) => scene.marks.find((m) => m.id === id)?.label)
                        .join(' → ')}
                    </p>
                    <Choice label="人物" name="role" options={scene.roles} value={path.roleId} />
                    <p>
                      {scene.marks.map((mark, index) => `${index + 1}=${mark.label}`).join('；')}
                    </p>
                    <Field
                      label="走位点顺序（英文逗号分隔）"
                      name="order"
                      value={path.markIds
                        .map((id) => scene.marks.findIndex((mark) => mark.id === id) + 1)
                        .join(',')}
                      required
                    />
                    <Field label="开始（秒）" name="start" value={path.startTime} numeric />
                    <Field label="速度（米 / 秒）" name="speed" value={path.speed} numeric />
                    <Field label="为什么移动" name="reason" value={path.reason} required />
                  </Form>
                ))}
              </>
            )}
            {section === 'props' && (
              <>
                <details className="th-card">
                  <summary>从道具库放置物件</summary>
                  <div className="h-96">
                    <ItemsPanel
                      initialCategory="props"
                      showSourceFilter={false}
                      showTagFilters={false}
                    />
                  </div>
                </details>
                <p>
                  道具预置、持有与交接属于人物排演。可关联选中的舞台物件；未关联时用简洁替身表示。
                </p>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      editScene((s) => {
                        const selected = useViewer.getState().selection.selectedIds[0]
                        const node = selected
                          ? useScene.getState().nodes[selected as AnyNodeId]
                          : null
                        const bound = node && 'position' in node ? node : null
                        const worldPosition = bound
                          ? sceneRegistry.nodes.get(bound.id)?.getWorldPosition(new Vector3())
                          : null
                        if (bound && !worldPosition)
                          throw new Error('该物件尚未载入，请等待舞台显示后重试')
                        s.props.push({
                          id: theatreId('prop'),
                          name: node?.name || `道具 ${s.props.length + 1}`,
                          nodeId: bound?.id,
                          presetPosition: worldPosition
                            ? worldPosition.toArray()
                            : [
                                document.venue.origin[0],
                                document.venue.origin[1] + 0.8,
                                document.venue.origin[2],
                              ],
                          initialHolderRoleId: null,
                          transfers: [],
                          resetNote: '回到预置位置',
                        })
                      }),
                    )
                  }
                >
                  添加道具（可关联选中物件）
                </button>
                {scene.props.map((prop) => (
                  <div key={prop.id}>
                    <Form
                      key={JSON.stringify(prop)}
                      title={prop.name}
                      run={run}
                      onDelete={() =>
                        editScene((s) => {
                          s.props = s.props.filter((p) => p.id !== prop.id)
                        })
                      }
                      submit={(data) =>
                        editScene((s) => {
                          Object.assign(s.props.find((p) => p.id === prop.id)!, {
                            name: text(data, 'name'),
                            presetPosition: position(data),
                            initialHolderRoleId: text(data, 'holder') || null,
                            resetNote: text(data, 'resetNote'),
                          })
                        })
                      }
                    >
                      <Field label="道具名称" name="name" value={prop.name} required />
                      <Position value={prop.presetPosition} />
                      <Choice
                        label="开场持有人"
                        name="holder"
                        options={scene.roles}
                        value={prop.initialHolderRoleId ?? ''}
                        optional
                      />
                      <Field label="复位说明" name="resetNote" value={prop.resetNote} />
                    </Form>
                    <Form
                      title={`安排 ${prop.name} 的交接`}
                      run={run}
                      submit={(data) =>
                        editScene((s) => {
                          const p = s.props.find((p) => p.id === prop.id)!
                          const to = text(data, 'to') || null
                          p.transfers.push({
                            id: theatreId('transfer'),
                            time: num(data, 'time'),
                            fromRoleId:
                              p.transfers.at(-1)?.toRoleId ??
                              (p.transfers.length ? null : p.initialHolderRoleId),
                            toRoleId: to,
                            ...(to ? {} : { position: position(data) }),
                          })
                        })
                      }
                    >
                      <Field
                        label="发生时间（秒）"
                        name="time"
                        value={Math.min(scene.duration, (prop.transfers.at(-1)?.time ?? 0) + 1)}
                        numeric
                      />
                      <Choice label="接收人（无即放下）" name="to" options={scene.roles} optional />
                      <Position value={prop.presetPosition} />
                      <p>由当前持有人交出；放下时使用以上落位坐标。</p>
                    </Form>
                    {prop.transfers.map((transfer) => (
                      <p key={transfer.id}>
                        {transfer.time} 秒：
                        {scene.roles.find((r) => r.id === transfer.fromRoleId)?.name ?? '预置处'} →{' '}
                        {scene.roles.find((r) => r.id === transfer.toRoleId)?.name ?? '放下'}
                      </p>
                    ))}
                    {prop.transfers.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          run(() =>
                            editScene((s) => {
                              s.props.find((p) => p.id === prop.id)!.transfers.pop()
                            }),
                          )
                        }
                      >
                        撤去最后一次交接
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
            {section === 'scenes' && (
              <>
                <Form
                  key={JSON.stringify(document.production)}
                  title="剧目资料"
                  run={run}
                  submit={(data) =>
                    update((doc) => {
                      doc.production = {
                        ...doc.production,
                        name: text(data, 'name'),
                        scriptVersion: text(data, 'scriptVersion'),
                        notes: text(data, 'notes'),
                      }
                    })
                  }
                >
                  <Field label="剧目名称" name="name" value={document.production.name} required />
                  <Field
                    label="剧本版本"
                    name="scriptVersion"
                    value={document.production.scriptVersion}
                  />
                  <Field label="排演备注" name="notes" value={document.production.notes} />
                </Form>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      update((doc) => {
                        const added = createRehearsalScene(`第 ${doc.scenes.length + 1} 场`)
                        added.number = String(doc.scenes.length + 1)
                        doc.scenes.push(added)
                        doc.activeSceneId = added.id
                      }),
                    )
                  }
                >
                  添加场次
                </button>
                <Form
                  key={`${scene.id}:${scene.name}:${scene.number}:${scene.duration}:${scene.script}`}
                  title="场次资料与剧本文本"
                  run={run}
                  submit={(data) =>
                    editScene((s) => {
                      s.name = text(data, 'name')
                      s.number = text(data, 'number')
                      s.duration = num(data, 'duration')
                      s.script = text(data, 'script')
                    })
                  }
                >
                  <Field label="场次名称" name="name" value={scene.name} required />
                  <Field label="场次编号" name="number" value={scene.number} />
                  <Field label="时长（秒）" name="duration" value={scene.duration} numeric />
                  <label>
                    剧本文本
                    <textarea name="script" defaultValue={scene.script} rows={8} />
                  </label>
                </Form>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      editScene((s) => {
                        s.beats.push({
                          id: theatreId('beat'),
                          name: `节拍 ${s.beats.length + 1}`,
                          start: 0,
                          end: s.duration,
                          objective: '',
                          resistance: '',
                        })
                      }),
                    )
                  }
                >
                  添加节拍
                </button>
                {scene.beats.map((beat) => (
                  <Form
                    key={`${beat.id}:${JSON.stringify(beat)}`}
                    title={beat.name}
                    run={run}
                    onDelete={() =>
                      editScene((s) => {
                        s.beats = s.beats.filter((b) => b.id !== beat.id)
                      })
                    }
                    submit={(data) =>
                      editScene((s) => {
                        Object.assign(s.beats.find((b) => b.id === beat.id)!, {
                          name: text(data, 'name'),
                          start: num(data, 'start'),
                          end: num(data, 'end'),
                          objective: text(data, 'objective'),
                          resistance: text(data, 'resistance'),
                        })
                      })
                    }
                  >
                    <Field label="节拍名称" name="name" value={beat.name} required />
                    <div className="th-grid">
                      <Field label="开始（秒）" name="start" value={beat.start} numeric />
                      <Field label="结束（秒）" name="end" value={beat.end} numeric />
                    </div>
                    <Field label="目标" name="objective" value={beat.objective} />
                    <Field label="阻力" name="resistance" value={beat.resistance} />
                  </Form>
                ))}
              </>
            )}
            {section === 'takes' && (
              <>
                <p>保存人物、调度、道具和布景的当前版本，恢复后可以一次撤销。</p>
                <Form
                  title="保存排演版本"
                  run={run}
                  submit={(data) => {
                    saveRehearsalTake(text(data, 'name'), text(data, 'note'))
                  }}
                >
                  <Field
                    label="版本名称"
                    name="name"
                    value={`排演 ${document.takes.length + 1}`}
                    required
                  />
                  <Field label="导演笔记" name="note" />
                </Form>
                {document.takes.map((take) => (
                  <article className="th-card" key={take.id}>
                    <h3>{take.name}</h3>
                    <p>
                      {new Date(take.createdAt).toLocaleString('zh-CN')} · {take.note}
                    </p>
                    <button type="button" onClick={() => setRestoreId(take.id)}>
                      恢复此版本
                    </button>
                    {restoreId === take.id && (
                      <div role="alert">
                        <p>将恢复此版本的排演和布景。当前内容可通过撤销取回。</p>
                        <button
                          type="button"
                          onClick={() =>
                            run(() => {
                              useRehearsalPlayback.getState().stop()
                              restoreRehearsalTake(take.id)
                              setRestoreId(null)
                            })
                          }
                        >
                          确认恢复
                        </button>
                        <button type="button" onClick={() => setRestoreId(null)}>
                          取消
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </>
            )}
            {section === 'observation' && (
              <>
                <p>观察人物关系与行动线。切换视角不会改变排演数据。</p>
                <div className="th-templates">
                  {(
                    [
                      ['director', '导演视角'],
                      ['audience', '观众全景'],
                      ['plan', '俯视调度'],
                      ['actor', '演员视角（当前落点）'],
                      ['side', '侧台观察'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => {
                        useEditor.getState().setViewMode(id === 'plan' ? '2d' : '3d')
                        useRehearsalPlayback.setState({ observation: id })
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => openStudioPanel('picture')}>
                  灯光与显示
                </button>
                <details className="th-card">
                  <summary>高级记录 · 原有摄影机资料</summary>
                  <p>保留已有摄影机和缓存。人物行动由排演系统管理。</p>
                  <button type="button" onClick={() => openStudioPanel('camera-studio')}>
                    机位与录像
                  </button>
                  <button type="button" onClick={() => openStudioPanel('camera-rehearsal')}>
                    原有镜头序列
                  </button>
                </details>
              </>
            )}
            {rehearsalWarnings(scene, document.venue).map((warning) => (
              <p className="th-notice" key={warning}>
                {warning}
              </p>
            ))}
          </>
        )}
      </fieldset>
      {(readOnly || exclusive || playing) && <p>当前为只读或预演状态。点击“复位”后可以编辑。</p>}
    </section>
  )
}
