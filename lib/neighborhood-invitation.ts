import { realmExists, type RealmId } from './realm-catalog.ts';

/** Public invitation data only; server admission still checks every gate. */
export function parseNeighborhoodInvitation(
  input: string,
): { realm: RealmId; target: string } | null {
  let code = input.trim();
  if (code.length > 3000) return null;
  // A plain "commons:..." code is itself a syntactically valid URL with a
  // custom scheme. Recognize it before URL parsing discards its identifier.
  if (!/^[a-z]+:[a-f0-9]{32}$/.test(code)) {
    try {
      const url = new URL(code);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return null;
      if (
        url.searchParams.getAll('realm').length > 1 ||
        url.searchParams.getAll('neighborhood').length !== 1
      )
        return null;
      code =
        (url.searchParams.get('realm') ?? 'commons') +
        ':' +
        url.searchParams.get('neighborhood');
    } catch {
      return null;
    }
  }
  const match = /^([a-z]+):([a-f0-9]{32})$/.exec(code);
  return match && realmExists(match[1])
    ? { realm: match[1], target: match[2] }
    : null;
}
