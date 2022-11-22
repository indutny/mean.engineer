export function isSameHost(a: URL, b: URL): boolean {
  return a.host === b.host;
}
