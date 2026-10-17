import { describe, expect, it, vi } from 'vitest'
import { readAllPages } from './readAllPages'

describe('readAllPages', () => {
  const rows = Array.from({ length: 1207 }, (_, id) => ({ id: String(id) }))

  it('reads beyond 1,000 with inclusive, non-overlapping ranges', async () => {
    const fetch = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null, count: rows.length }))
    const progress = vi.fn()
    expect(await readAllPages(fetch, { onProgress: progress })).toEqual(rows)
    expect(fetch.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]])
    expect(progress.mock.calls.flat()).toEqual([500, 1000, 1207])
  })

  it('advances by actual returned rows if the server caps pages below the requested size', async () => {
    const fetch = vi.fn(async (from: number) => ({ data: rows.slice(from, from + 200), error: null, count: rows.length }))
    expect(await readAllPages(fetch)).toHaveLength(1207)
    expect(fetch.mock.calls.map(([from]) => from)).toEqual([0, 200, 400, 600, 800, 1000, 1200])
  })

  it('continues until an empty page when count is unavailable', async () => {
    const fetch = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }))
    expect(await readAllPages(fetch)).toHaveLength(1207)
    expect(fetch).toHaveBeenLastCalledWith(1207, 1706)
  })

  it('rejects later page errors without returning partial results', async () => {
    const error = new Error('disconnected')
    const fetch = vi.fn(async (from: number) => from ? { data: null, error } : { data: rows.slice(0, 500), error: null, count: rows.length })
    await expect(readAllPages(fetch)).rejects.toBe(error)
  })

  it('rejects missing data and premature empty pages', async () => {
    await expect(readAllPages(async () => ({ data: null, error: null }))).rejects.toThrow('hợp lệ')
    await expect(readAllPages(async () => ({ data: [], error: null, count: 1 }))).rejects.toThrow('đã thay đổi')
  })

  it('rejects duplicate IDs instead of looping or exporting duplicate rows', async () => {
    await expect(readAllPages(async () => ({ data: [{ id: 'duplicate' }], error: null, count: 2 }))).rejects.toThrow('đã thay đổi')
  })

  it('does not fetch if already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn()
    await expect(readAllPages(fetch, { signal: controller.signal })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cancels in flight without reporting progress or returning rows', async () => {
    const controller = new AbortController()
    const progress = vi.fn()
    await expect(readAllPages(async () => {
      controller.abort()
      return { data: rows, error: null, count: rows.length }
    }, { signal: controller.signal, onProgress: progress })).rejects.toThrow()
    expect(progress).not.toHaveBeenCalled()
  })
})
