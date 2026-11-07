import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function ControlReadState({ query, children, keepPreviousData = false }: { query: { enabled: boolean; isFetching: boolean;
  message: string | null; data: unknown; refetch: () => unknown }; children: ReactNode; keepPreviousData?: boolean }) {
  if (!query.enabled) return <p role="status">Cần phiên quản trị RoomQC đang hoạt động để xem dữ liệu.</p>
  if (query.isFetching && !(keepPreviousData && query.data)) return <p role="status" className="py-8 text-muted-foreground">Đang tải dữ liệu…</p>
  if (query.message) return <div role="alert" className="space-y-3 rounded-lg border border-red-600 p-4">
    <p>{query.message}</p><Button variant="outline" onClick={() => void query.refetch()}>Thử tải lại</Button>
  </div>
  if (!query.data) return <p role="status">Chưa có dữ liệu được xác nhận.</p>
  return <>{children}</>
}

export function ControlStatus({ value, children }: { value: 'good' | 'warning' | 'neutral'; children: ReactNode }) {
  return <span className={'inline-block rounded border px-2 py-1 text-xs font-semibold ' +
    (value === 'good' ? 'border-green-700 text-green-800 dark:text-green-300' : value === 'warning'
      ? 'border-amber-700 text-amber-900 dark:text-amber-300' : 'border-slate-500 text-foreground')}>{children}</span>
}
