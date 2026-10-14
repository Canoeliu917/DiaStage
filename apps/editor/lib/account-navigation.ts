export function safeAccountNext(value?: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value) ||
    /^\/login(?:[/?#]|$)/.test(value)
  )
    return '/scenes'
  return value
}
