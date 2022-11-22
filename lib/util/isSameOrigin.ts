export function isSameOrigin(a: URL, b: URL): boolean {
  return a.origin === b.origin;
}
