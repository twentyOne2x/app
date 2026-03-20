export function sanitizeCallbackUrl(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}
