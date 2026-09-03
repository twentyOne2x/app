import { customAlphabet } from 'nanoid'

export const PUBLIC_SHARE_ID_PATTERN = /^shr_[A-Za-z0-9_-]{32}$/

const shareToken = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-',
  32
)

/** Public shares are bearer capabilities. Use about 190 bits of CSPRNG-backed
 * entropy and a distinct prefix so database constraints can reject legacy
 * short chat identifiers in the public namespace. */
export function newPublicShareId(): string {
  return `shr_${shareToken()}`
}
