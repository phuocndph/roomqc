import type { CleaningProgress } from '@/hooks/useHousekeepingDashboardPanels'
import { PanelError, type PanelQueryState } from './PanelError'

interface Props extends PanelQueryState {
  data?: CleaningProgress
}

export function CleaningProgressPanel({ data, loading, isError, onRetry }: Props) {
  const total = data?.total ?? 0
  const completed = data?.completed ?? 0
  const percent = total ? Math.round(completed / total * 100) : 0
  return <section className="min-w-0 border">
    <h2 className="border-b px-4 py-3 font-semibold">Công việc dọn phòng hôm nay</h2>
    {isError ? <PanelError onRetry={onRetry} /> : loading ? <div className="m-4 h-20 animate-pulse bg-muted" /> : !total ? <p className="p-4 text-sm text-muted-foreground">Chưa có công việc dọn phòng.</p> : <div className="space-y-4 p-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span><strong>{completed}/{total}</strong> việc đã hoàn thành</span><strong>{percent}%</strong></div>
      <div role="progressbar" aria-label="Tiến độ hoàn thành công việc dọn phòng" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden bg-muted"><div className="h-full bg-green-700" style={{ width: `${percent}%` }} /></div>
      <dl className="grid grid-cols-3 gap-2 text-sm">{[
        { label: 'Chờ làm', value: data?.pending || 0 },
        { label: 'Đang làm', value: data?.inProgress || 0 },
        { label: 'Chờ duyệt', value: data?.awaitingReview || 0 },
      ].map(item => <div key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="mt-1 text-xl font-semibold">{item.value}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">Gồm việc trong ngày và các việc còn tồn từ trước.</p>
    </div>}
  </section>
}
