/**
 * Tiny URL-safe ID generator. Avoids pulling in the full `nanoid` package
 * (which depends on `crypto` polyfills that are fiddly under Hermes).
 *
 * 21 chars from a 64-char alphabet ≈ 122 bits of entropy, equivalent
 * to nanoid's default.
 */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function nanoid(size = 21): string {
  let out = ''
  const bytes = new Uint8Array(size)
  // expo's polyfill for `crypto.getRandomValues` ships with expo-random.
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    // Fallback: Math.random (less secure but fine for local IDs).
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < size; i++) {
    out += ALPHABET[bytes[i] & 63]
  }
  return out
}

/** Short 4-char hash for image-name suggestions (e.g. "John+1a2b"). */
export function hash4(): string {
  return nanoid(4)
}
