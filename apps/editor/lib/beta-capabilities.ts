export const BETA_EXPERT_MEDIA_ENABLED = false
export const BETA_LIGHTING_PRODUCTION_ENABLED = false
export const BETA_REHEARSAL_ENABLED = false

export function betaCapabilityNotice(text: string): string | null {
  if (
    !BETA_EXPERT_MEDIA_ENABLED &&
    /录制|录影|视频|动画|关键帧|时间线|连续运镜|镜头序列|摄影机|摄像机|电影相机|分镜|first.person|walkthrough|sequencer|timeline|cinematic|camera\s*(?:rehearsal|production|animation)|\bshot\b|video/i.test(
      text,
    )
  )
    return 'Beta 暂未开放视频与动画制作。可以观察舞台、保存视角并召回。'
  if (
    !BETA_LIGHTING_PRODUCTION_ENABLED &&
    /灯光|灯具|照明|光束|调灯|灯位|lighting|\bcue\b/i.test(text)
  )
    return '0.1 暂未开放灯光制作。可以继续置景、查看版本与复台预览。'
  return null
}
