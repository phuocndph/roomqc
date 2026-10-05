export const APP_VERSION = '1.1.97';
export const APP_VERSION_DATE = '2026-09-20';

/** Compare dotted numeric versions without the pitfalls of string ordering. */
export function compareAppVersions(left: string, right: string): number {
  const parse = (value: string) => value
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = a[index] ?? 0;
    const bPart = b[index] ?? 0;
    if (aPart !== bPart) return aPart > bPart ? 1 : -1;
  }

  return 0;
}
