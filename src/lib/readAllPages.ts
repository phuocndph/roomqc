interface DataPage<T> {
  data: T[] | null
  error: unknown
  count?: number | null
}

/** Read every server page, including servers configured with a smaller row cap.
 * Callers must use a stable ordering with an ID tie-breaker and tenant filters.
 * Never return a partial export/list after a failed or non-advancing page.
 */
export async function readAllPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<DataPage<T>>,
  options: { signal?: AbortSignal; pageSize?: number; onProgress?: (loaded: number) => void } = {},
): Promise<T[]> {
  const size = Math.max(1, Math.floor(options.pageSize || 500))
  const rows: T[] = []
  const seen = new Set<string>()
  while (true) {
    options.signal?.throwIfAborted()
    const { data, error, count } = await fetchPage(rows.length, rows.length + size - 1)
    options.signal?.throwIfAborted()
    if (error) throw error
    if (!data) throw new Error('Máy chủ chưa trả dữ liệu hợp lệ. Vui lòng thử lại.')
    if (!data.length) {
      if (count != null && rows.length < count) throw new Error('Dữ liệu đã thay đổi trong lúc tải. Vui lòng thử lại.')
      return rows
    }
    for (const row of data) {
      if (seen.has(row.id)) throw new Error('Dữ liệu đã thay đổi trong lúc tải. Vui lòng thử lại.')
      seen.add(row.id)
      rows.push(row)
    }
    options.onProgress?.(rows.length)
    if (count != null && rows.length >= count) return rows
  }
}
