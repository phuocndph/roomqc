import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { instanceChannelName } from './channelName'

describe('instanceChannelName', () => {
  it('keeps the readable base and never repeats a topic', () => {
    const names = Array.from({ length: 50 }, () => instanceChannelName('staff-status-tenant-a'))
    expect(new Set(names).size).toBe(50)
    for (const name of names) expect(name.startsWith('staff-status-tenant-a#')).toBe(true)
  })
})

// Regression guard (W1, 2026-11-06): supabase-js returns the existing channel
// for a repeated topic and throws when a second instance chains .on() onto it.
// Every channel must either get a per-subscription topic or go through an
// explicitly shared, ref-counted registry.
const SHARED_REGISTRIES = new Set([
  'src/lib/realtime/sharedSubscription.ts',
  'src/hooks/usePendingCounts.ts',
  'src/hooks/useInventoryHubBadges.ts',
])

describe('Realtime channel topics', () => {
  it('never opens a channel with a topic that another instance can reuse', () => {
    const root = process.cwd()
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(path)
      }
    }
    walk(join(root, 'src'))

    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(root, file).split('\\').join('/')
      if (SHARED_REGISTRIES.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\.channel\(\s*([^\s)][^\n]*)/g)) {
        if (!match[1].startsWith('instanceChannelName(')) {
          const line = text.slice(0, match.index).split('\n').length
          offenders.push(`${rel}:${line}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
