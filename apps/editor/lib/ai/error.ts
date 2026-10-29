export interface ApiErrorBody {
  requestId: string
  error: {
    code:
      | 'UNSUPPORTED_FILE'
      | 'FILE_TOO_LARGE'
      | 'SCANNED_PDF'
      | 'CORRUPT_DOCUMENT'
      | 'AUDIO_UNSUPPORTED'
      | 'TRANSCRIPTION_FAILED'
      | 'PLAN_INVALID'
      | 'AMBIGUOUS_COMMAND'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR'
      | 'BUDGET_CONFIRMATION_REQUIRED'
      | 'BUDGET_EXCEEDED'
      | 'AI_INVITE_REQUIRED'
    message: string
    retryable: boolean
    estimateCny?: number
  }
}

export class AiError extends Error {
  constructor(
    readonly code: ApiErrorBody['error']['code'],
    message: string,
    readonly status = 400,
    readonly retryable = false,
    readonly estimateCny?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
