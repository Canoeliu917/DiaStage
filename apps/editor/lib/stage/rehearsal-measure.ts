/** Lengths a director can say out loud: whole metres, otherwise 10 cm steps. */
export function formatRehearsalLength(meters: number): string {
  const cm = Math.round(Math.abs(meters) * 100)
  const coarse = Math.round(cm / 10) * 10
  const approx = coarse !== cm ? '约 ' : ''
  if (coarse % 100 === 0) return `${approx}${coarse / 100} 米`
  return `${approx}${coarse} 厘米`
}

export function snapFoldStop(angle: number): number {
  if (!Number.isFinite(angle)) return 180
  return Math.min(360, Math.max(0, Math.round(angle / 45) * 45))
}

const SNAP_WORDS: Record<string, string> = {
  中心线: '在中线',
  台左边界: '贴台左',
  台右边界: '贴台右',
  台后边界: '贴后墙',
  台口基准线: '贴台口',
  景片边缘对齐: '景片贴边',
  同款对齐: '同款贴齐',
}

export function speakSnapLabel(label: string): string {
  if (SNAP_WORDS[label]) return SNAP_WORDS[label]!
  const grid = /^([\d.]+) 米网格$/.exec(label)
  if (grid) return `按 ${formatRehearsalLength(Number(grid[1]))}格子`
  if (label.startsWith('紧邻 ')) return `靠着${label.slice(3)}`
  if (label.startsWith('对齐 ')) return `对齐${label.slice(3)}`
  if (label.startsWith('贴合 ')) return `贴着${label.slice(3)}`
  return label
}

export function describeStagePoint(point: { x: number; z: number }, depthMeters: number): string {
  const x =
    Math.abs(point.x) < 0.05
      ? '在中线'
      : `${point.x > 0 ? '台右' : '台左'} ${formatRehearsalLength(point.x)}`
  const z =
    point.z > depthMeters - 0.08
      ? '贴后墙'
      : point.z < 0.08
        ? '贴台口'
        : `距台口 ${formatRehearsalLength(point.z)}`
  return `${x} · ${z}`
}

export function rehearsalBlock(message: string): string {
  if (message.includes('超出台面')) return '这里出了台面。'
  const other = message.match(/与 (.+?) 穿插/)?.[1]
  if (other) return `这里会碰到「${other}」。`
  if (message.includes('舞台地面')) return '这里会陷进台板。'
  return message
}

export function rehearsalKept(message: string): string {
  const spoken = rehearsalBlock(message)
  if (spoken === message) return message
  return `${spoken.replace(/。$/, '')}，还停在原来的位置。`
}
