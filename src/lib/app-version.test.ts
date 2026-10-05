import { describe, expect, it } from 'vitest';
import { compareAppVersions } from './app-version';

describe('compareAppVersions', () => {
  it('compares numeric segments instead of strings', () => {
    expect(compareAppVersions('1.1.100', '1.1.97')).toBeGreaterThan(0);
  });

  it('treats a missing trailing segment as zero', () => {
    expect(compareAppVersions('1.2', '1.2.0')).toBe(0);
  });

  it('accepts an optional v prefix', () => {
    expect(compareAppVersions('v2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('orders older releases before newer releases', () => {
    expect(compareAppVersions('1.1.96', '1.1.97')).toBeLessThan(0);
  });
});
