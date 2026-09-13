export const BETA_EXPERT_MEDIA_ENABLED = false
export const BETA_LIGHTING_PRODUCTION_ENABLED = false

export function betaCapabilityNotice(text: string): string | null {
  if (
    !BETA_EXPERT_MEDIA_ENABLED &&
    /录制|录影|导出.*(?:视频|动画)|生成.*(?:视频|动画)|关键帧|时间线|连续运镜|镜头序列|摄像机动画|camera\s*sequencer|video\s*export/i.test(
      text,
    )
  )
    return 'Beta 暂未开放视频与动画制作。可以观察舞台、保存视角并召回。'
  if (!BETA_LIGHTING_PRODUCTION_ENABLED && /灯光|照明|光束|调灯|灯位|lighting/i.test(text))
    return 'Beta 暂未开放灯光制作。可以继续搭台、排演和观察舞台。'
  return null
}
