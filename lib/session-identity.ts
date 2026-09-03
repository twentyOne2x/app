const PRODUCTION_SESSION_PROVIDERS = new Set(['google', 'twitter'])
const DEVELOPMENT_SESSION_PROVIDERS = new Set([
  ...PRODUCTION_SESSION_PROVIDERS,
  'e2e',
  'local-dev'
])

export class SessionIdentityError extends Error {
  constructor(message = 'authenticated session identity is unavailable') {
    super(message)
    this.name = 'SessionIdentityError'
  }
}

/** Build the one durable provider-qualified identity accepted by middleware
 * and server actions. Missing, normalized, or newly invented provider names
 * must never silently create another tenant. */
export function canonicalSessionIdentity(
  providerValue: unknown,
  subjectValue: unknown,
  production: boolean
): string {
  if (typeof providerValue !== 'string' || typeof subjectValue !== 'string') {
    throw new SessionIdentityError()
  }
  const providers = production
    ? PRODUCTION_SESSION_PROVIDERS
    : DEVELOPMENT_SESSION_PROVIDERS
  if (!providers.has(providerValue) || !subjectValue.trim()) {
    throw new SessionIdentityError()
  }
  if (subjectValue !== subjectValue.trim()) {
    throw new SessionIdentityError()
  }
  return `${providerValue}:${subjectValue}`
}
