export const SYNTHETIC_DEMO_PENDING_KEY = 'diastage:demo-pending-intention'
export const syntheticDemoIntentionKey = (sceneId: string) => `diastage:demo-intention:${sceneId}`

export function prepareSyntheticDemo(intention: string): '/demo' {
  const text = intention.trim()
  if (text.length > 2000) throw new Error('请把排演想法控制在2000字以内。')
  try {
    if (text) sessionStorage.setItem(SYNTHETIC_DEMO_PENDING_KEY, text)
    else sessionStorage.removeItem(SYNTHETIC_DEMO_PENDING_KEY)
  } catch {
    throw new Error('浏览器未允许暂存文字。你的输入仍在这里，请允许此网站存储后再打开演示。')
  }
  return '/demo'
}

export function pendingSyntheticDemoIntention(): string {
  try {
    return (sessionStorage.getItem(SYNTHETIC_DEMO_PENDING_KEY) ?? '').slice(0, 2000)
  } catch {
    return ''
  }
}

export function finishSyntheticDemoIntention(sceneId: string, intention: string): void {
  if (!intention) return
  sessionStorage.setItem(syntheticDemoIntentionKey(sceneId), intention)
  // A late creation must not clear a newer draft from this tab.
  if (sessionStorage.getItem(SYNTHETIC_DEMO_PENDING_KEY) === intention)
    sessionStorage.removeItem(SYNTHETIC_DEMO_PENDING_KEY)
}

export function readSyntheticDemoIntention(sceneId: string): string {
  try {
    const key = syntheticDemoIntentionKey(sceneId)
    const intention = sessionStorage.getItem(key) ?? ''
    sessionStorage.removeItem(key)
    return intention.slice(0, 2000)
  } catch {
    return ''
  }
}
