export function coerceContent(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.error('coerceContent: failed to stringify value', error, value)
    return String(value)
  }
}

export function isRenderableMessage(message: unknown): message is {
  role: string
  content: unknown
} {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { role?: unknown }).role === 'string'
  )
}
