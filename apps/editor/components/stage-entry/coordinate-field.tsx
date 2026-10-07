'use client'

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import './coordinate-field.css'

export type HomeSpaceAction = 'dialogue' | 'voice' | 'script' | 'manual' | 'archive-info'
type SpaceGroup = 'dialogue' | 'diagonal' | 'diagram' | 'diary'
type SpaceNode = {
  title: string
  label?: string
  group?: SpaceGroup
  action?: HomeSpaceAction
  href?: string
  light?: boolean
  compose?: boolean
  noteId?: string
  x: number
  y: number
  z: number
}

export const HOME_SPACE_NODES: SpaceNode[] = [
  { title: '一句想法', group: 'dialogue', x: 22, y: 32, z: 160 },
  { title: '光', light: true, x: 58, y: 13, z: 90 },
  { title: '舞台', group: 'diagonal', x: 51, y: 55, z: 175 },
  { title: '空间', group: 'diagonal', x: 75, y: 28, z: -190 },
  { title: '距离', group: 'diagonal', x: 13, y: 61, z: -30 },
  { title: '幕', group: 'diagonal', x: 42, y: 26, z: -260 },
  { title: '观众', group: 'diagram', x: 69, y: 77, z: 110 },
  { title: '方向', group: 'diagonal', x: 86, y: 57, z: -260 },
  { title: '置景', group: 'diagonal', x: 33, y: 83, z: 90 },
  { title: '留存', group: 'diary', x: 88, y: 90, z: -180 },
  { title: '比例', group: 'diagonal', x: 46, y: 91, z: -300 },
  { title: '预演', group: 'diagram', x: 62, y: 40, z: -60 },
  { title: '台词', compose: true, x: 26, y: 49, z: 10 },
]

export const HOME_SPACE_GROUPS: Record<
  SpaceGroup,
  { title: string; english: string; options: SpaceNode[] }
> = {
  dialogue: {
    title: '构思',
    english: 'Dialogue',
    options: [
      { title: '对话构思', label: 'Dialogue', action: 'dialogue', x: 20, y: 35, z: 30 },
      { title: '语音搭台', label: 'Voice', action: 'voice', x: 42, y: 64, z: 50 },
      { title: '剧本搭台', label: 'Script', action: 'script', x: 63, y: 31, z: -20 },
      { title: '连接手机', label: 'Connect', href: '/remote-voice', x: 83, y: 66, z: 5 },
    ],
  },
  diagonal: {
    title: '置景',
    english: 'Diagonal',
    options: [
      { title: '新建舞台', label: 'New stage', action: 'manual', x: 24, y: 30, z: 30 },
      { title: '照片复原', label: 'From photo', href: '/photo-stage', x: 50, y: 52, z: 20 },
      { title: '继续置景', label: 'Continue', href: '/scenes', x: 76, y: 74, z: 10 },
    ],
  },
  diagram: {
    title: '预演',
    english: 'Diagram',
    options: [
      { title: '观众视角', label: 'Audience view', href: '/scenes', x: 33, y: 60, z: 40 },
      {
        title: '复台预览',
        label: 'Remount',
        href: '/scenes?workspace=remount',
        x: 67,
        y: 34,
        z: 5,
      },
    ],
  },
  diary: {
    title: '剧目',
    english: 'Diary',
    options: [
      { title: '我的剧目', label: 'My stages', href: '/scenes', x: 33, y: 34, z: 20 },
      { title: '作品留存', label: 'Archive', action: 'archive-info', x: 67, y: 62, z: 35 },
    ],
  },
}

type Bounds = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
type Offset = { x: number; y: number }

type SpaceNote = { id: string; text: string; x: number; y: number }
const NOTES_STORAGE_KEY = 'diastage:home-notes'

export function parseSpaceNotes(raw: string | null): SpaceNote[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const ids = new Set<string>()
    return value.filter((note): note is SpaceNote => {
      if (
        !note ||
        typeof note.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(note.id) ||
        ids.has(note.id) ||
        typeof note.text !== 'string' ||
        !note.text.trim() ||
        note.text.length > 80 ||
        !Number.isFinite(note.x) ||
        !Number.isFinite(note.y) ||
        Math.abs(note.x) > 200 ||
        Math.abs(note.y) > 200
      )
        return false
      ids.add(note.id)
      return true
    })
  } catch {
    return []
  }
}

export function clampSpaceMove(x: number, y: number, node: Bounds, field: Bounds): Offset {
  return {
    x: Math.max(field.left + 24 - node.left, Math.min(x, field.right - 24 - node.right)),
    y: Math.max(field.top + 24 - node.top, Math.min(y, field.bottom - 24 - node.bottom)),
  }
}

export function CoordinateField({
  onSelect,
  illuminated,
  onToggleLight,
}: {
  onSelect: (action: HomeSpaceAction) => void
  illuminated: boolean
  onToggleLight: () => void
}) {
  const field = useRef<HTMLElement>(null)
  const space = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const returnFocus = useRef<string | null>(null)
  const suppressClick = useRef<string | null>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const noteOpener = useRef<HTMLElement | null>(null)
  const [group, setGroup] = useState<SpaceGroup | null>(null)
  const revealed = illuminated
  const [gathered, setGathered] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [offsets, setOffsets] = useState<Record<string, Offset>>({})
  const [notes, setNotes] = useState<SpaceNote[]>([])
  const [noteDraft, setNoteDraft] = useState<{ id?: string; text: string } | null>(null)
  const noteEditorKey = noteDraft ? (noteDraft.id ?? 'new') : null
  const [noteError, setNoteError] = useState('')
  const drag = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    offset: Offset
    left: number
    top: number
    bounds: DOMRect
    fieldBounds: DOMRect
    scale: number
    moved: boolean
  } | null>(null)
  const light = HOME_SPACE_NODES.find((node) => node.light)!
  const options: SpaceNode[] = !revealed
    ? [light]
    : group
      ? [light, ...HOME_SPACE_GROUPS[group].options]
      : [
          ...HOME_SPACE_NODES,
          ...notes.map((note) => ({
            title: note.text,
            noteId: note.id,
            x: note.x,
            y: note.y,
            z: 0,
          })),
        ]
  const gridOptions = options.filter((node) => !node.light && !node.noteId)

  useEffect(() => {
    try {
      setNotes(parseSpaceNotes(localStorage.getItem(NOTES_STORAGE_KEY)))
    } catch {
      setNoteError('浏览器未允许本地保存，台词仅保留在本次打开中。')
    }
    const syncNotes = (event: StorageEvent) => {
      if (event.key === NOTES_STORAGE_KEY || event.key === null)
        setNotes(parseSpaceNotes(event.newValue))
    }
    window.addEventListener('storage', syncNotes)
    return () => window.removeEventListener('storage', syncNotes)
  }, [])

  useEffect(() => {
    if (revealed && noteEditorKey !== null) noteInput.current?.focus({ preventScroll: true })
  }, [noteEditorKey, revealed])

  function saveNotes(next: SpaceNote[]) {
    setNotes(next)
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next))
      setNoteError('')
    } catch {
      setNoteError('未能保存到浏览器；请先保留文字，刷新后本次修改可能丢失。')
    }
  }

  function closeNoteEditor() {
    setNoteDraft(null)
    requestAnimationFrame(() => {
      if (noteOpener.current?.isConnected) noteOpener.current.focus({ preventScroll: true })
      else field.current?.querySelector<HTMLElement>('[data-compose=true]')?.focus()
    })
  }

  function saveNotePosition(node: HTMLElement, id: string) {
    if (!id.startsWith('note-') || !space.current) return
    const x = (Number.parseFloat(node.style.left) / space.current.clientWidth) * 100
    const y = (Number.parseFloat(node.style.top) / space.current.clientHeight) * 100
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    saveNotes(notes.map((note) => (note.id === id ? { ...note, x, y } : note)))
    setOffset(id, { x: 0, y: 0 })
  }

  useEffect(() => {
    if (firstRender.current) firstRender.current = false
    else {
      const destination =
        !group && returnFocus.current
          ? field.current?.querySelector<HTMLElement>(`[data-node-id="${returnFocus.current}"]`)
          : title.current
      destination?.focus({ preventScroll: true })
    }
  }, [group])

  function setOffset(id: string, offset: Offset) {
    setOffsets((current) => ({ ...current, [id]: offset }))
  }

  function settle(node: HTMLElement, id: string) {
    const computed = getComputedStyle(node)
    const left = Number.parseFloat(computed.left)
    const top = Number.parseFloat(computed.top)
    const offset = {
      x:
        left -
        (Number.parseFloat(node.style.getPropertyValue('--node-x')) / 100) *
          space.current!.clientWidth,
      y:
        top -
        (Number.parseFloat(node.style.getPropertyValue('--node-y')) / 100) *
          space.current!.clientHeight,
    }
    const transform = computed.transform
    node.style.transition = 'none'
    node.style.left = `${left}px`
    node.style.top = `${top}px`
    node.style.transform = transform
    setOffset(id, offset)
    return { left, top, offset }
  }

  function release(node: HTMLElement) {
    for (const property of ['left', 'top', 'transform', 'transition'])
      node.style.removeProperty(property)
  }

  function startDrag(event: PointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary || !space.current || !field.current) return
    event.currentTarget.dataset.pointerFocus = 'true'
    const snapshot = settle(event.currentTarget, id)
    const bounds = event.currentTarget.getBoundingClientRect()
    drag.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ...snapshot,
      bounds,
      fieldBounds: field.current.getBoundingClientRect(),
      scale: bounds.width / event.currentTarget.offsetWidth,
      moved: false,
    }
    suppressClick.current = null
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(id)
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      active.id !== event.currentTarget.dataset.nodeId
    )
      return
    const x = event.clientX - active.startX
    const y = event.clientY - active.startY
    if (!active.moved && Math.hypot(x, y) < 5) return
    active.moved = true
    const delta = clampSpaceMove(x, y, active.bounds, active.fieldBounds)
    const dx = delta.x / active.scale
    const dy = delta.y / active.scale
    event.currentTarget.style.left = `${active.left + dx}px`
    event.currentTarget.style.top = `${active.top + dy}px`
    setOffset(active.id, { x: active.offset.x + dx, y: active.offset.y + dy })
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current
    if (
      !active ||
      active.pointerId !== event.pointerId ||
      active.id !== event.currentTarget.dataset.nodeId
    )
      return
    if (active.moved) {
      if (event.type === 'pointerup') moveDrag(event)
      suppressClick.current = active.id
      saveNotePosition(event.currentTarget, active.id)
    }
    drag.current = null
    setDragging(null)
    release(event.currentTarget)
    if (field.current && !field.current.matches(':hover')) {
      field.current.style.setProperty('--coordinate-x', '0px')
      field.current.style.setProperty('--coordinate-y', '0px')
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLElement>, id: string) {
    delete event.currentTarget.dataset.pointerFocus
    const step = event.shiftKey ? 24 : 8
    const direction: Record<string, Offset> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const delta = direction[event.key]
    if (!delta || !space.current || !field.current) return
    event.preventDefault()
    const snapshot = settle(event.currentTarget, id)
    const bounds = event.currentTarget.getBoundingClientRect()
    const limited = clampSpaceMove(delta.x, delta.y, bounds, field.current.getBoundingClientRect())
    const scale = bounds.width / event.currentTarget.offsetWidth
    event.currentTarget.style.left = `${snapshot.left + limited.x / scale}px`
    event.currentTarget.style.top = `${snapshot.top + limited.y / scale}px`
    setOffset(id, {
      x: snapshot.offset.x + limited.x / scale,
      y: snapshot.offset.y + limited.y / scale,
    })
  }

  function enter(next: SpaceGroup | null) {
    setOffsets({})
    setGroup(next)
  }

  function renderNode(option: SpaceNode, index: number) {
    const id = option.light ? 'all-光' : (option.noteId ?? `${group ?? 'all'}-${option.title}`)
    const offset = offsets[id] ?? { x: 0, y: 0 }
    const columns = group === 'diagonal' ? 1 : group ? gridOptions.length : 4
    const gridIndex = gridOptions.indexOf(option)
    const inGrid = gathered && gridIndex >= 0
    const props = {
      className: 'dia-coordinate-node',
      'data-node-id': id,
      'aria-describedby': 'dia-coordinate-instructions',
      'data-dragging': dragging === id,
      'data-primary': !!group && !option.light,
      'data-light': !!option.light,
      'data-compose': !!option.compose,
      'data-note': !!option.noteId,
      'aria-pressed': option.light ? illuminated : undefined,
      'aria-label': option.light
        ? revealed
          ? '光 · 收起舞台'
          : '光 · 点亮舞台'
        : option.noteId
          ? `编辑台词：${option.title}`
          : undefined,
      draggable: false,
      style: {
        '--node-x': `${inGrid ? 50 + ((gridIndex % columns) - (columns - 1) / 2) * (group ? 19 : 22) : option.x}%`,
        '--node-y': `${inGrid ? (group === 'diagonal' ? 25 + gridIndex * 27 : group ? 50 : 20 + Math.floor(gridIndex / columns) * 30) : option.y}%`,
        '--node-z': `${inGrid ? (group ? 0 : ((gridIndex % 3) - 1) * 24) : option.z}px`,
        '--node-offset-x': `${offset.x}px`,
        '--node-offset-y': `${offset.y}px`,
        '--node-depth': `${1 + option.z / 500}`,
        '--node-delay': `${index * -1.2}s`,
        '--node-reveal-delay': `${Math.min(index, 12) * 35}ms`,
      } as CSSProperties,
      onDragStart: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
      onPointerDown: (event: PointerEvent<HTMLElement>) => startDrag(event, id),
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => moveWithKeyboard(event, id),
      onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key.startsWith('Arrow')) {
          saveNotePosition(event.currentTarget, id)
          release(event.currentTarget)
        }
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        delete event.currentTarget.dataset.pointerFocus
        if (!drag.current) {
          saveNotePosition(event.currentTarget, id)
          release(event.currentTarget)
        }
      },
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (event.detail > 0 && suppressClick.current === id) {
          event.preventDefault()
          suppressClick.current = null
          return
        }
        if (option.light) {
          if (illuminated) setGroup(null)
          onToggleLight()
        } else if (option.compose || option.noteId) {
          noteOpener.current = event.currentTarget
          setNoteDraft({ id: option.noteId, text: option.noteId ? option.title : '' })
        } else if (option.group) {
          returnFocus.current = id
          enter(option.group)
        } else if (option.action) {
          event.currentTarget.focus()
          onSelect(option.action)
        }
      },
    }
    const content = (
      <span key={id} className="dia-coordinate-node-content">
        <span className="dia-coordinate-node-title">{option.title}</span>
        {option.label && <span className="dia-coordinate-node-label">{option.label}</span>}
      </span>
    )
    return option.href ? (
      <a key={id} {...props} href={option.href}>
        {content}
      </a>
    ) : (
      <button key={id} {...props} type="button">
        {content}
      </button>
    )
  }

  return (
    <section
      ref={field}
      className="dia-coordinate-field"
      aria-label="Dia 舞台创作空间"
      data-gathered={gathered}
      data-dragging={dragging !== null}
      data-layer={group ?? 'all'}
      data-illuminated={illuminated}
      data-revealed={revealed}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse' || drag.current || (revealed && noteDraft)) return
        const bounds = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty(
          '--coordinate-x',
          `${((event.clientX - bounds.left) / bounds.width - 0.5) * 36}px`,
        )
        event.currentTarget.style.setProperty(
          '--coordinate-y',
          `${((event.clientY - bounds.top) / bounds.height - 0.5) * 24}px`,
        )
      }}
      onPointerLeave={(event) => {
        if (drag.current) return
        event.currentTarget.style.setProperty('--coordinate-x', '0px')
        event.currentTarget.style.setProperty('--coordinate-y', '0px')
      }}
    >
      {!revealed && <p className="dia-coordinate-light-prompt">先从点亮舞台开始吧</p>}
      <div className="dia-coordinate-welcome" hidden={!revealed}>
        {group && (
          <nav className="dia-coordinate-breadcrumb" aria-label="空间路径">
            <button type="button" onClick={() => enter(null)}>
              ← 返回全部
            </button>
            <span aria-hidden="true"> / </span>
            <span>{HOME_SPACE_GROUPS[group].english}</span>
          </nav>
        )}
        <h1 ref={title} tabIndex={-1} aria-live="polite">
          {group ? HOME_SPACE_GROUPS[group].title : '这一幕，与 Dia，从哪里开始？'}
        </h1>
      </div>
      <div ref={space} className="dia-coordinate-space">
        <div className="dia-coordinate-world" aria-hidden="true">
          <div className="dia-coordinate-wall dia-coordinate-wall-back" />
          <div className="dia-coordinate-wall dia-coordinate-wall-side" />
          <div className="dia-coordinate-floor" />
          <span className="dia-coordinate-axis dia-coordinate-axis-x" />
          <span className="dia-coordinate-axis dia-coordinate-axis-y" />
          <span className="dia-coordinate-axis dia-coordinate-axis-z" />
          <span className="dia-coordinate-axis-label dia-coordinate-axis-label-x">X</span>
          <span className="dia-coordinate-axis-label dia-coordinate-axis-label-y">Y</span>
          <span className="dia-coordinate-axis-label dia-coordinate-axis-label-z">Z</span>
          <span className="dia-coordinate-origin" />
        </div>
        {options.filter((option) => !option.light).map(renderNode)}
      </div>
      <div className="dia-coordinate-light-space">{renderNode(light, 1)}</div>
      {revealed && noteDraft && (
        <form
          className="dia-coordinate-note-editor"
          aria-label={noteDraft.id ? '编辑台词' : '添加台词'}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              closeNoteEditor()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            const text = noteDraft.text.trim()
            if (!text) return
            const next = noteDraft.id
              ? notes.map((note) => (note.id === noteDraft.id ? { ...note, text } : note))
              : [
                  ...notes,
                  {
                    id: `note-${crypto.randomUUID()}`,
                    text,
                    x: 38 + (notes.length % 3) * 13,
                    y: 36 + (notes.length % 4) * 12,
                  },
                ]
            saveNotes(next)
            closeNoteEditor()
          }}
        >
          <label htmlFor="dia-space-note">
            {noteDraft.id ? '编辑这句台词' : '把一句话放进空间'}
          </label>
          <textarea
            ref={noteInput}
            id="dia-space-note"
            rows={3}
            maxLength={80}
            required
            value={noteDraft.text}
            placeholder="一句台词，或此刻的想法…"
            onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })}
          />
          <p>拖动位置，轻点编辑 · {noteDraft.text.length}/80</p>
          <div className="dia-coordinate-note-actions">
            <button type="button" onClick={closeNoteEditor}>
              取消
            </button>
            {noteDraft.id && (
              <button
                type="button"
                onClick={() => {
                  saveNotes(notes.filter((note) => note.id !== noteDraft.id))
                  closeNoteEditor()
                }}
              >
                删除
              </button>
            )}
            <button type="submit" disabled={!noteDraft.text.trim()}>
              {noteDraft.id ? '保存' : '放入空间'}
            </button>
          </div>
        </form>
      )}
      {revealed && noteError && (
        <p className="dia-coordinate-note-error" role="status">
          {noteError}
        </p>
      )}
      <p id="dia-coordinate-instructions" className="dia-coordinate-hint">
        {revealed && '轻点进入 · 拖动探索'}
        <span className="dia-coordinate-sr-only">；方向键移动，回车键进入</span>
      </p>
      {revealed && (
        <div className="dia-coordinate-toggle" role="group" aria-label="空间排列">
          <button
            type="button"
            aria-pressed={!gathered}
            onClick={() => {
              setGathered(false)
              setOffsets({})
            }}
          >
            散开
          </button>
          <span aria-hidden="true"> / </span>
          <button
            type="button"
            aria-pressed={gathered}
            onClick={() => {
              setGathered(true)
              setOffsets({})
            }}
          >
            聚合
          </button>
        </div>
      )}
    </section>
  )
}
