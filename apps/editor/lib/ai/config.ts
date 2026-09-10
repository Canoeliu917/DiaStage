function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export const AI_TOKEN_LIMITS = {
  commandOutput: boundedInteger(process.env.DIASTAGE_COMMAND_OUTPUT_TOKENS, 6000, 1, 8000),
  scriptChunkOutput: boundedInteger(process.env.DIASTAGE_SCRIPT_OUTPUT_TOKENS, 12000, 8000, 12000),
  commandInputTarget: 8000,
  scriptChunkInputTarget: 16000,
  maxScriptModelCalls: 12,
} as const

export const THEATRE_TRANSCRIPTION_PROMPT =
  '戏剧排练与舞台置景口令。专业词：舞台、台口、台左、台右、台前、台后、上场口、下场口、中区、前区、后区、景片、门景片、窗景片、台阶、平台、沙发、圆桌、复台、米、厘米。忠实转写，不补充未说出的内容。'
