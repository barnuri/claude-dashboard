const SESSION_HASH_PREFIX = "#/session/";

/** Extract the session id from a `#/session/<id>` location hash; null for any other hash. */
export function parseSessionHash(hash: string): string | null {
  if (!hash.startsWith(SESSION_HASH_PREFIX)) {
    return null;
  }
  const id = decodeURIComponent(hash.slice(SESSION_HASH_PREFIX.length));
  return id || null;
}

export function buildSessionHash(id: string): string {
  return `${SESSION_HASH_PREFIX}${encodeURIComponent(id)}`;
}
