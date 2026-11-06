import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { defaultHotelGrant, HOTEL_FLAGS, type AuthorityConfiguration, type HotelGrant } from '@/lib/employee-authority'

const flagLabels: Record<typeof HOTEL_FLAGS[number], string> = { can_create_managers: 'Tạo quản lý', can_create_staff: 'Tạo nhân viên',
  can_view_reports: 'Xem báo cáo', can_export_data: 'Xuất dữ liệu', can_approve_requests: 'Duyệt yêu cầu' }
const sorted = (rows: HotelGrant[]) => [...rows].sort((a, b) => a.hotel_id.localeCompare(b.hotel_id))

export function HotelAssignmentSection({ configuration, disabled, isSaving, onSave, onRefresh }: {
  configuration: AuthorityConfiguration; disabled?: boolean; isSaving: boolean;
  onSave: (values: HotelGrant[], version: string) => Promise<unknown>; onRefresh: () => void
}) {
  const [draft, setDraft] = useState<{ values: HotelGrant[]; version: string; original: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null), id = useId()
  const values = draft?.values ?? configuration.hotels
  const catalog = new Map(configuration.hotel_catalog.map(h => [h.id, h]))
  const ids = [...new Set([...configuration.hotel_catalog.map(h => h.id), ...configuration.hotels.map(h => h.hotel_id),
    ...(configuration.primary_hotel_id ? [configuration.primary_hotel_id] : [])])]
  // The server validates both old and new memberships. An out-of-scope old row
  // requires an authorized review; silently omitting it cannot make the save valid.
  const blockedExisting = configuration.hotels.some(h => !catalog.get(h.hotel_id)?.assignable)
  const unheld = values.some(h => HOTEL_FLAGS.some(flag => h[flag] && !catalog.get(h.hotel_id)?.allowed[flag]))
  const primaryMissing = !!configuration.primary_hotel_id && !values.some(h => h.hotel_id === configuration.primary_hotel_id)
  const stale = !!draft && draft.version !== configuration.versions.hotels
  const dirty = !!draft && JSON.stringify(sorted(draft.values)) !== draft.original
  const locked = disabled || isSaving || stale || blockedExisting
  const change = (next: HotelGrant[]) => setDraft(previous => ({ values: sorted(next),
    original: previous?.original ?? JSON.stringify(sorted(configuration.hotels)), version: previous?.version ?? configuration.versions.hotels }))
  async function save() {
    if (!draft || !dirty || locked || unheld || primaryMissing) return
    try { await onSave(draft.values, draft.version); setDraft(null) } catch { /* Preserve all flags and the original version for review. */ }
  }
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Chọn khách sạn nhân viên được phân công. Quyền tại từng khách sạn được lưu cùng một lần với danh sách phân công.</p>
    {stale && <p role="status" className="rounded border p-3 text-sm">Phân công đã đổi ở nơi khác. Bỏ thay đổi và tải lại trước khi lưu.</p>}
    {blockedExisting && <p role="status" className="rounded border p-3 text-sm">Có phân công hiện tại ở khách sạn ngừng hoạt động hoặc ngoài phạm vi bạn quản lý. Dữ liệu được giữ nguyên; cần người có thẩm quyền rà soát.</p>}
    {unheld && !blockedExisting && <p role="status" className="rounded border p-3 text-sm">Có quyền tại khách sạn vượt phạm vi bạn được phép cấp. Tắt quyền đó hoặc nhờ người có thẩm quyền rà soát trước khi lưu.</p>}
    {primaryMissing && <p role="status" className="text-sm">Cần giữ phân công tại khách sạn chính của nhân viên.</p>}
    {!ids.length && <p className="py-4 text-sm text-muted-foreground">Chưa có khách sạn trong phạm vi phân công.</p>}
    {ids.map(hotelId => {
      const hotel = catalog.get(hotelId), grant = values.find(h => h.hotel_id === hotelId), primary = hotelId === configuration.primary_hotel_id
      const label = hotel?.name ?? `Khách sạn cần rà soát (${hotelId.slice(0, 8)})`, open = expanded === hotelId
      return <section key={hotelId} className="rounded-lg border bg-background">
        <div className="flex items-center gap-3 p-3">
          <Checkbox aria-label={`Phân công ${label}`} checked={!!grant} disabled={locked || !hotel?.assignable || (primary && !!grant)}
            onCheckedChange={checked => {
              if (locked || !hotel?.assignable || (primary && grant)) return
              change(checked === true ? [...values, defaultHotelGrant(hotelId)] : values.filter(h => h.hotel_id !== hotelId))
            }} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">{label}{primary ? ' · Khách sạn chính' : ''}</p>
            <p className="text-xs text-muted-foreground">{hotel?.code ?? 'Không có trong danh mục hiện tại'}{hotel && !hotel.assignable ? ' · Cần rà soát phạm vi/trạng thái' : ''}</p>
          </div>
          {grant && <Button type="button" size="sm" variant="outline" aria-label={`Chi tiết quyền tại ${label}`} aria-expanded={open}
            aria-controls={`${id}-${hotelId}`} onClick={() => setExpanded(open ? null : hotelId)}>Chi tiết</Button>}
        </div>
        {grant && open && <div id={`${id}-${hotelId}`} className="grid grid-cols-1 gap-2 border-t p-3 sm:grid-cols-2">
          {HOTEL_FLAGS.map(flag => <div key={flag} className="flex items-center justify-between gap-2 rounded border p-2">
            <div><p className="text-sm">{flagLabels[flag]}</p>{!hotel?.allowed[flag] && <p className="text-xs text-muted-foreground">Bạn không thể cấp thêm quyền này</p>}</div>
            <Switch aria-label={`${flagLabels[flag]} tại ${label}`} checked={grant[flag]} disabled={locked || (!hotel?.allowed[flag] && !grant[flag])}
              onCheckedChange={checked => {
                if (locked || (checked && !hotel?.allowed[flag])) return
                change(values.map(h => h.hotel_id === hotelId ? { ...h, [flag]: checked } : h))
              }} />
          </div>)}
        </div>}
      </section>
    })}
    <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
      <p className="mr-auto text-sm text-muted-foreground">Đã chọn {values.length} khách sạn</p>
      <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setDraft(null); onRefresh() }}>Bỏ thay đổi và tải lại</Button>
      <Button type="button" disabled={!dirty || locked || unheld || primaryMissing} onClick={() => { void save() }}>{isSaving ? 'Đang lưu…' : 'Lưu phân công khách sạn'}</Button>
    </div>
  </div>
}
