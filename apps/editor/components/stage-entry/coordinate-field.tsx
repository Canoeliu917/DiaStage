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
      { title: '新建舞台', label: 'New stage', action: 'manual', x: 34, y: 35, z: 30 },
      { title: '继续置景', label: 'Continue', href: '/scenes', x: 67, y: 61, z: 10 },
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
  const [group, setGroup] = useState<SpaceGroup | null>(null)
  const [gathered, setGathered] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [offsets, setOffsets] = useState<Record<string, Offset>>({})
  const drag = useRef<{
    id: string
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
  const options = group ? HOME_SPACE_GROUPS[group].options : HOME_SPACE_NODES

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
    if (event.button !== 0 || !space.current) return
    const snapshot = settle(event.currentTarget, id)
    const bounds = event.currentTarget.getBoundingClientRect()
    drag.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      ...snapshot,
      bounds,
      fieldBounds: space.current.getBoundingClientRect(),
      scale: bounds.width / event.currentTarget.offsetWidth,
      moved: false,
    }
    suppressClick.current = null
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(id)
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current
    if (!active) return
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
    if (drag.current?.moved) suppressClick.current = drag.current.id
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
    const step = event.shiftKey ? 24 : 8
    const direction: Record<string, Offset> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const delta = direction[event.key]
    if (!delta || !space.current) return
    event.preventDefault()
    const snapshot = settle(event.currentTarget, id)
    const bounds = event.currentTarget.getBoundingClientRect()
    const limited = clampSpaceMove(delta.x, delta.y, bounds, space.current.getBoundingClientRect())
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

  return (
    <section
      ref={field}
      className="dia-coordinate-field"
      aria-label="Dia 舞台创作空间"
      data-gathered={gathered}
      data-dragging={dragging !== null}
      data-layer={group ?? 'all'}
      data-illuminated={illuminated}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse' || drag.current) return
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
      <div className="dia-coordinate-welcome">
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
          {group ? HOME_SPACE_GROUPS[group].title : '欢迎来到 Dia'}
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
        {options.map((option, index) => {
          const id = `${group ?? 'all'}-${option.title}`
          const offset = offsets[id] ?? { x: 0, y: 0 }
          const columns = group ? options.length : 4
          const props = {
            className: 'dia-coordinate-node',
            'data-node-id': id,
            'aria-describedby': 'dia-coordinate-instructions',
            'data-dragging': dragging === id,
            'data-primary': !!group,
            'data-light': !!option.light,
            'aria-pressed': option.light ? illuminated : undefined,
            'aria-label': option.light ? '光 · 切换明暗' : undefined,
            style: {
              '--node-x': `${gathered ? 50 + ((index % columns) - (columns - 1) / 2) * (group ? 19 : 11) : option.x}%`,
              '--node-y': `${gathered ? (group ? 50 : 36 + Math.floor(index / columns) * 16) : option.y}%`,
              '--node-z': `${gathered ? (group ? 0 : ((index % 3) - 1) * 24) : option.z}px`,
              '--node-offset-x': `${offset.x}px`,
              '--node-offset-y': `${offset.y}px`,
              '--node-depth': `${1 + option.z / 500}`,
              '--node-delay': `${index * -1.2}s`,
            } as CSSProperties,
            onPointerDown: (event: PointerEvent<HTMLElement>) => startDrag(event, id),
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onLostPointerCapture: endDrag,
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => moveWithKeyboard(event, id),
            onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
              if (event.key.startsWith('Arrow')) release(event.currentTarget)
            },
            onBlur: (event: React.FocusEvent<HTMLElement>) => release(event.currentTarget),
            onClick: (event: React.MouseEvent<HTMLElement>) => {
              if (event.detail > 0 && suppressClick.current === id) {
                event.preventDefault()
                suppressClick.current = null
                return
              }
              if (option.light) {
                onToggleLight()
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
            <a key={id} {...props} href={option.href} draggable={false}>
              {content}
            </a>
          ) : (
            <button key={id} {...props} type="button">
              {content}
            </button>
          )
        })}
      </div>
      <p id="dia-coordinate-instructions" className="dia-coordinate-hint">
        轻点进入 · 拖动探索<span className="dia-coordinate-sr-only">；方向键移动，回车键进入</span>
      </p>
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
    </section>
  )
}
