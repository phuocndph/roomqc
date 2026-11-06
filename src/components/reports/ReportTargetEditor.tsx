import { useEffect, useId, useState } from 'react'
import { useReportTargets } from '@/hooks/useReportTargets'
import { TARGET_METRIC_LABELS } from '@/hooks/useFinancialTargets'
import { FINANCIAL_TARGET_METRICS, MONTHLY_TARGET_METRICS, TargetError, targetDraftValues, type TargetKind, type TargetReport } from '@/lib/report-targets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = { kind: TargetKind; month: string; onSaved?: () => void }
type Flow = ReturnType<typeof useReportTargets>
const draftOf = (report: TargetReport) => Object.fromEntries(Object.entries(report.values).map(([k, v]) => [k, String(v)]))
export function ReportTargetEditor({ kind, month, onSaved }: Props) {
  const flow = useReportTargets(kind, month)
  return <div className="space-y-3">
    {!flow.scopeEnabled && <p role="status" className="text-sm">Chọn khách sạn và đăng nhập bằng tài khoản đang hoạt động để xem mục tiêu.</p>}
    {flow.notice && <p role="alert" className="text-sm text-red-700">{flow.notice}</p>}
    {flow.pending.length > 0 && <div className="rounded-md border border-amber-600 p-3 space-y-2">
      <p className="text-sm">Có {flow.pending.length} lần lưu chưa xác nhận. Kiểm tra kết quả trước khi lưu bộ mới. Đóng trang vẫn giữ thông tin phục hồi.</p>
      <Button type="button" variant="outline" disabled={flow.isSaving} onClick={() => { void flow.recover().catch(() => {}) }}>
        {flow.isSaving ? 'Đang kiểm tra…' : 'Kiểm tra lần lưu trước'}
      </Button>
      <p className="text-xs text-muted-foreground">Nếu không muốn lưu nữa, yêu cầu hủy bên dưới. Nếu server đã lưu, kết quả sẽ được xác nhận là đã lưu. Giữ bản nhập để đối chiếu rồi tải lại trước khi sửa tiếp.</p>
      <Button type="button" variant="outline" disabled={flow.isSaving || !flow.pendingReady} onClick={() => { void flow.cancel().catch(() => {}) }}>
        Hủy lần lưu chưa áp dụng
      </Button>
    </div>}
    {flow.isPending && <p role="status" className="text-sm">Đang tải mục tiêu…</p>}
    {!flow.isPending && flow.scopeEnabled && !flow.data && <Button type="button" variant="outline" disabled={flow.isFetching} onClick={() => { void flow.refetch() }}>Thử tải lại</Button>}
    {flow.scopeEnabled && <TargetDraft key={flow.scope} flow={flow} report={flow.data} kind={kind} onSaved={onSaved} />}
  </div>
}
function TargetDraft({ flow, report, kind, onSaved }: { flow: Flow; report?: TargetReport; kind: TargetKind; onSaved?: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(() => report ? draftOf(report) : {}), [baseRevision, setBaseRevision] = useState(report?.revision ?? '')
  const [dirty, setDirty] = useState(false), [resolved, setResolved] = useState(false), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (report && !dirty) { setDraft(draftOf(report)); setBaseRevision(report.revision); setResolved(false) }
  }, [report, dirty])
  // Keep the unsent draft in memory during a failed refetch, while rendering no denied data.
  if (!report) return null
  const metrics = kind === 'financial' ? FINANCIAL_TARGET_METRICS : MONTHLY_TARGET_METRICS
  const blocked = flow.isSaving || flow.pending.length > 0 || !flow.pendingReady || !report.can_manage
  const changedElsewhere = baseRevision !== report.revision
  const save = async () => {
    try {
      if (blocked || !dirty || changedElsewhere || !flow.isCurrent()) return
      const values = targetDraftValues(kind, draft)
      if (report.review_required && (!resolved || Object.keys(values).length === 0)) {
        throw new TargetError('review_required', 'Nhập bộ mục tiêu đã đối soát và xác nhận trước khi lưu. Không dùng bộ trống để xử lý dữ liệu trùng.')
      }
      const result = await flow.save(values, baseRevision, report.review_required && resolved)
      if (!flow.isCurrent()) return
      if (result.state === 'cancelled') { setError('Lần lưu này đã được hủy. Bản nhập được giữ; tải lại mục tiêu trước khi sửa tiếp.'); return }
      setBaseRevision(result.report.revision); setDirty(false); setError(null); onSaved?.()
    } catch (e) {
      if (flow.isCurrent()) setError(e instanceof TargetError ? e.message : 'Chưa xác nhận được lần lưu. Kiểm tra kết quả trước khi tiếp tục.')
    }
  }
  return <div className="space-y-3">
    {!report.can_manage && <p className="text-sm">Bạn có quyền xem. Tài khoản hiện tại chưa có quyền sửa mục tiêu này.</p>}
    <p className="text-xs text-muted-foreground">Để trống để bỏ mục tiêu; 0 là một giá trị. Không dùng dấu phân cách hàng nghìn. Ví dụ: 5000000 hoặc 75.25.</p>
    {report.review_required && <div className="rounded-md border border-amber-600 p-3 space-y-2">
      <p role="alert" className="text-sm">Dữ liệu cũ có mục tiêu trùng hoặc không hợp lệ. Chủ khách sạn cần đối soát và nhập bộ giá trị muốn giữ; các giá trị chưa rõ không được coi là 0.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={resolved} disabled={blocked}
        onChange={e => setResolved(e.target.checked)} />Tôi đã đối soát và xác nhận bộ mục tiêu đầy đủ bên dưới.</label>
    </div>}
    {metrics.map(metric => <div key={metric} className="space-y-1">
      <Label htmlFor={`${id}-${metric}`} className="text-sm">{kind === 'financial' ? TARGET_METRIC_LABELS[metric as keyof typeof TARGET_METRIC_LABELS]
        : metric === 'revenue_target' ? 'Doanh thu mục tiêu (VND)' : 'Công suất mục tiêu (%)'}</Label>
      <Input id={`${id}-${metric}`} type="text" inputMode="decimal" value={draft[metric] ?? ''} disabled={blocked}
        onChange={e => { setDirty(true); setError(null); setDraft(d => ({ ...d, [metric]: e.target.value })) }} />
    </div>)}
    {changedElsewhere && <p role="alert" className="text-sm text-amber-800">Mục tiêu đã thay đổi ở nơi khác. Bản nhập của bạn được giữ; tải bản mới trước khi sửa tiếp.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2 border-t pt-3">
      <Button type="button" variant="outline" disabled={blocked || flow.isFetching} onClick={() => {
        setDraft(draftOf(report)); setBaseRevision(report.revision); setDirty(false); setResolved(false); setError(null); void flow.refetch()
      }}>Tải lại và bỏ thay đổi</Button>
      <Button type="button" onClick={() => { void save() }} disabled={blocked || flow.isFetching || !dirty || changedElsewhere || (report.review_required && !resolved)}>
        {flow.isSaving ? 'Đang lưu…' : 'Lưu mục tiêu'}
      </Button>
    </div>
  </div>
}
