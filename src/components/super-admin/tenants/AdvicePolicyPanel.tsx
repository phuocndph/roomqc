import { useEffect, useId, useState } from 'react'
import { useAdvicePolicy } from '@/hooks/super-admin/useAdvicePolicy'
import { advicePolicy, type AdvicePolicy } from '@/lib/advice-policy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type Draft = { enabled: boolean; daily_limit: string; daily_budget_units: string; units_per_request: string; valid_until: string; reason: string }
function draftPolicy(p: AdvicePolicy | null): Draft {
  return { enabled: p?.enabled ?? false, daily_limit: p ? String(p.daily_limit) : '',
    daily_budget_units: p ? String(p.daily_budget_units) : '', units_per_request: p ? String(p.units_per_request) : '',
    valid_until: p?.valid_until ?? '', reason: '' }
}
export function AdvicePolicyPanel({ tenantId, active }: { tenantId: string; active: boolean }) {
  const query = useAdvicePolicy(tenantId, active)
  return query.enabled ? <AdvicePolicyEditor key={query.scope} query={query} /> : null
}
function AdvicePolicyEditor({ query }: { query: ReturnType<typeof useAdvicePolicy> }) {
  const id = useId(), [draft, setDraft] = useState<{ revision: number; values: Draft } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ready = !!query.data && !query.isFetching && !query.isError
  useEffect(() => {
    if (!draft && ready && query.data) setDraft({ revision: query.data.revision, values: draftPolicy(query.data.policy) })
  }, [draft, ready, query.data])
  const disabled = !ready || query.isSaving || !query.pendingReady || !!query.pending
  const change = (field: keyof Draft, value: string | boolean) => {
    if (disabled) return
    setError(null); setDraft(old => old ? { ...old, values: { ...old.values, [field]: value } } : null)
  }
  const perform = async (action: () => ReturnType<typeof query.lookup>) => {
    setError(null)
    try {
      const outcome = await action()
      if (query.isCurrent() && outcome.state === 'succeeded') setDraft(null)
    } catch { /* The scoped hook displays only safe errors for the current identity. */ }
  }
  const save = async () => {
    if (!draft || disabled) return
    let policy: AdvicePolicy
    try {
      for (const key of ['daily_limit', 'daily_budget_units', 'units_per_request'] as const) {
        if (!/^[0-9]{1,9}$/.test(draft.values[key])) throw new Error('Nhập hạn mức bằng số nguyên, không có dấu phân cách.')
      }
      policy = advicePolicy({ ...draft.values, daily_limit: Number(draft.values.daily_limit),
        daily_budget_units: Number(draft.values.daily_budget_units), units_per_request: Number(draft.values.units_per_request) })
    } catch (e) { setError(e instanceof Error ? e.message : 'Kiểm tra cấu hình.'); return }
    await perform(() => query.save(policy, draft.revision))
  }
  const textFields: { key: Exclude<keyof Draft, 'enabled' | 'reason'>; label: string; hint?: string }[] = [
    { key: 'daily_limit', label: 'Số lượt tối đa mỗi ngày UTC' },
    { key: 'daily_budget_units', label: 'Ngân sách nội bộ mỗi ngày' },
    { key: 'units_per_request', label: 'Đơn vị nội bộ mỗi lượt' },
    { key: 'valid_until', label: 'Có hiệu lực đến', hint: 'Nhập thời điểm kèm múi giờ, ví dụ 2026-12-31T23:59:00+07:00.' },
  ]
  return <section aria-labelledby={`${id}-title`} className="space-y-4 border-t pt-5">
    <div><h4 id={`${id}-title`} className="font-semibold">Tư vấn vận hành</h4>
      <p className="text-sm text-muted-foreground">Cấp quyền và hạn mức cho doanh nghiệp tại cụm hiện tại. Ngân sách nội bộ không phải số tiền phải trả.</p></div>
    {query.isPending && <p role="status">Đang tải cấu hình…</p>}
    {(error || query.notice) && <p role="status" className="rounded border border-blue-700 p-3 text-sm text-foreground">{error || query.notice}</p>}
    {query.pending && <div className="space-y-3 rounded border border-amber-700 p-3">
      <p className="text-sm font-medium">Có lần lưu chưa xác nhận. Kiểm tra kết quả trước khi sửa tiếp.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={query.isSaving} onClick={() => void perform(query.lookup)}>Kiểm tra kết quả</Button>
        <Button size="sm" variant="outline" disabled={query.isSaving} onClick={() => void perform(query.retry)}>Tiếp tục lần lưu</Button>
        <Button size="sm" variant="outline" disabled={query.isSaving} onClick={() => void perform(query.cancel)}>Hủy lần lưu</Button>
      </div>
    </div>}
    {query.data && <p className="text-sm">Trạng thái: <strong>{query.data.policy?.enabled
      ? Date.parse(query.data.policy.valid_until) <= Date.now() ? 'Đã hết hạn' : 'Đã bật' : 'Chưa bật'}</strong> · Phiên bản {query.data.revision}</p>}
    {draft && <fieldset disabled={disabled} className="space-y-4">
      <div className="flex items-center justify-between gap-4"><Label htmlFor={`${id}-enabled`}>Cho phép tư vấn vận hành</Label>
        <Switch id={`${id}-enabled`} checked={draft.values.enabled} onCheckedChange={v => change('enabled', v)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">{textFields.map(field => <div key={field.key} className="space-y-1.5">
        <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
        <Input id={`${id}-${field.key}`} type="text" inputMode={field.key === 'valid_until' ? undefined : 'numeric'}
          aria-describedby={field.hint ? `${id}-${field.key}-hint` : undefined}
          value={draft.values[field.key]} onChange={e => change(field.key, e.target.value)} />
        {field.hint && <p id={`${id}-${field.key}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>}
      </div>)}</div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-reason`}>Lý do thay đổi</Label>
        <Textarea id={`${id}-reason`} value={draft.values.reason} onChange={e => change('reason', e.target.value)} maxLength={1000} />
        <p className="text-xs text-muted-foreground">Tối thiểu 5 ký tự; thay đổi sẽ được ghi vào nhật ký.</p></div>
      <Button disabled={disabled} onClick={() => void save()}>{query.isSaving ? 'Đang xác nhận…' : 'Lưu cấu hình tư vấn'}</Button>
    </fieldset>}
    <Button variant="outline" size="sm" disabled={query.isSaving || query.isFetching || !!query.pending} onClick={async () => {
      setError(null)
      const result = await query.refetch()
      if (query.isCurrent() && result.isSuccess) setDraft(null)
    }}>Tải cấu hình mới và bỏ bản nháp</Button>
  </section>
}
