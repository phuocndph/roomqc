import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import type { ActionBuckets } from '@/hooks/useRoomsNeedingActionToday'
import { PanelError, type PanelQueryState } from './PanelError'

interface Props extends PanelQueryState {
  data?: ActionBuckets
}

export function RoomActionListPanel({ data, loading, isError, onRetry }: Props) {
  const groups = [
    { label: 'Đã trả phòng, cần dọn', items: (data?.checkoutNotCleaned || []).map(room => ({ id: room.roomId, text: `Phòng ${room.roomNumber}` })) },
    { label: 'Phòng trống thiếu đồ', items: (data?.missingItems || []).map(room => ({ id: room.roomId, text: `Phòng ${room.roomNumber} · thiếu ${room.missingCount}` })) },
    { label: 'Công việc khẩn cấp', items: (data?.urgent || []).map(task => ({ id: task.roomId, text: `${task.roomNumber ? 'Phòng ' + task.roomNumber : 'Chưa rõ phòng'} · ${task.title || 'Việc khẩn cấp'}` })) },
    { label: 'Cần làm lại sau kiểm tra', items: (data?.rejectedQc || []).map(task => ({ id: task.roomId, text: `Phòng ${task.roomNumber || '—'}` })) },
  ].filter(group => group.items.length > 0)

  return <section className="min-w-0 border bg-background">
    <h2 className="border-b px-4 py-3 font-semibold">Cần chú ý</h2>
    {isError ? <PanelError onRetry={onRetry} /> : loading ? <div className="m-4 h-20 animate-pulse bg-muted" /> : !groups.length ? (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 shrink-0 text-green-700" />Không có cảnh báo cần xử lý.</div>
    ) : <div className="divide-y">
      {groups.map(group => <div key={group.label} className="space-y-2 p-4">
        <h3 className="text-sm font-medium">{group.label}</h3>
        <div className="flex flex-wrap gap-2">{group.items.map((item, i) => item.id ? <Link key={`${item.id}-${i}`} to={`/rooms/${item.id}`} className="max-w-full border px-2.5 py-2 text-sm text-primary hover:bg-muted">{item.text}</Link> : <span key={i} className="text-sm text-muted-foreground">{item.text}</span>)}</div>
      </div>)}
      <p className="px-4 py-2 text-xs text-muted-foreground">Hiển thị tối đa 8 mục mỗi nhóm; việc cần làm lại trong 7 ngày gần đây.</p>
    </div>}
  </section>
}
