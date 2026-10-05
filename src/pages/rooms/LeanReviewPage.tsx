import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useRoom } from '@/hooks/useRooms'
import { readLeanDraft, clearLeanDraft } from '@/hooks/useLeanDraft'
import { useSubmitRoomCheckLean } from '@/hooks/useRoomCheckLean'
import { useRoomCheckLeanConfig } from '@/hooks/useRoomCheckLeanConfig'
import {
  sanitizeLeanDraft,
  preSubmitValidate,
  flattenIssues,
  type SanitizedLeanIssue,
  type SanitizedLeanDraft,
} from '@/lib/roomCheckLeanErrors'
import {
  LeanInlineError,
  LeanFullScreenError,
  LEAN_TEXT,
} from '@/components/rooms/lean/LeanStates'
import { resolveBucket } from '@/lib/issueBucketMapping'

type LeanCheckType = 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'

const LEGACY_ISSUE_LABEL: Record<string, string> = {
  damaged_lost: 'Đồ hỏng / mất',
  missing_replace: 'Thiếu / cần thay',
  consumed_chargeable: 'Khách đã dùng',
}

function labelForIssue(iss: SanitizedLeanIssue): string {
  if (LEGACY_ISSUE_LABEL[iss.level1]) return LEGACY_ISSUE_LABEL[iss.level1]
  // asset-group action key — last segment as fallback
  const seg = iss.level1.split('.').slice(1).join('.') || iss.level1
  return seg
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

export default function LeanReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const checkType: LeanCheckType =
    (params.get('type') as LeanCheckType) || 'daily'
  const startedAtFromQuery = params.get('started') || ''

  const { data: roomData, isLoading, isError, refetch } = useRoom(id)
  const room = roomData?.room
  const items = useMemo(() => roomData?.items ?? [], [roomData?.items])

  const [note, setNote] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errorItemId, setErrorItemId] = useState<string | null>(null)
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const draftRef = useRef<SanitizedLeanDraft | null>(null)

  if (!draftRef.current && id) {
    const env = readLeanDraft<unknown>(id)
    draftRef.current = sanitizeLeanDraft(env?.data) ?? null
  }
  const draft = draftRef.current

  const issues = useMemo(
    () => (draft ? flattenIssues(draft.issues) : []),
    [draft],
  )
  const minibar = useMemo(
    () =>
      Object.entries(draft?.minibar || {})
        .filter(([, q]) => (q as number) > 0)
        .map(([itemId, qty]) => {
          const it = items.find((i) => i.item_id === itemId)
          return { item_id: itemId, name: it?.item_name || 'Mục minibar', qty: qty as number }
        }),
    [draft, items],
  )

  // Map item_id → standard_quantity cho constraint §8.3
  const standardByItem = useMemo(() => {
    const out: Record<string, number> = {}
    for (const it of items) out[it.item_id] = it.standard_quantity ?? 0
    return out
  }, [items])

  const totalItems = items.length
  const issueCount = issues.length
  const minibarCount = minibar.reduce((sum, m) => sum + m.qty, 0)
  // Số mục có ít nhất 1 vấn đề (không phải tổng số issue)
  const itemsWithIssue = useMemo(
    () => new Set(issues.map((i) => i.item_id)).size,
    [issues],
  )
  const okCount = Math.max(0, totalItems - itemsWithIssue)

  const submitMutation = useSubmitRoomCheckLean()

  const handleEditIssue = (itemId: string) => {
    navigate(
      `/rooms/${id}/check-lean/inspection?type=${checkType}&resume=true&edit=${itemId}`,
    )
  }

  const handleBackToInspection = () => {
    navigate(
      `/rooms/${id}/check-lean/inspection?type=${checkType}&resume=true`,
    )
  }

  const { data: leanCfg } = useRoomCheckLeanConfig(room?.hotel_id)

  const handleSubmit = async () => {
    if (!id) return
    setSubmitError(null)
    setErrorItemId(null)

    const err = preSubmitValidate({
      issues,
      config: leanCfg ?? null,
      standardByItem,
    })
    if (err) {
      setSubmitError(err.message)
      if (err.itemId) {
        setErrorItemId(err.itemId)
        requestAnimationFrame(() => {
          const el = itemRefs.current[err.itemId!]
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            const btn = el.querySelector<HTMLButtonElement>('button[data-edit-btn]')
            btn?.focus({ preventScroll: true })
          }
        })
      }
      return
    }

    type Entry = Record<string, any>
    const buckets: Record<string, Entry[]> = {
      items_missing: [],
      items_damaged: [],
      items_lost: [],
      items_consumed: [],
      items_replaced: [],
      items_sent_to_laundry: [],
    }

    const buildBaseEntry = (i: SanitizedLeanIssue): Entry => {
      const base: Entry = {
        // id phía client — DB sẽ lưu vào client_issue_id, dùng để derived ref về
        id: i.id,
        item_id: i.item_id,
        item_name: i.item_name,
        item_type: i.item_type,
        quantity: i.quantity,
        photos: i.photos,
        notes: i.notes,
        issue_role: i.issueRole ?? 'primary_issue',
      }
      if (i.chargeToGuest !== undefined) base.charge_to_guest = i.chargeToGuest
      if (i.needsReview) base.needs_review = true
      if (i.assetGroup) base.asset_group = i.assetGroup
      if (i.uiActionKey) base.ui_action = i.uiActionKey
      if (i.subReasonKey) base.sub_reason = i.subReasonKey
      if (i.extra) base.extra = i.extra
      return base
    }

    const kindToBucket: Record<SanitizedLeanIssue['kind'], string> = {
      damaged: 'items_damaged',
      lost: 'items_lost',
      missing: 'items_missing',
      consumed: 'items_consumed',
    }

    for (const i of issues) {
      const target =
        (i.bucket && buckets[i.bucket] ? i.bucket : null) ??
        kindToBucket[i.kind] ??
        'items_damaged'
      buckets[target].push(buildBaseEntry(i))

      // derived_action — link tới primary qua source_issue_client_id
      if (i.derivedActionKey) {
        try {
          const r = resolveBucket(i.derivedActionKey)
          if (r?.bucket && buckets[r.bucket]) {
            buckets[r.bucket].push({
              id: `${i.id}__derived`,
              item_id: i.item_id,
              item_name: i.item_name,
              item_type: i.item_type,
              quantity: i.quantity,
              photos: [],
              issue_role: 'derived_action',
              source_issue_client_id: i.id,
              source: 'derived',
              ui_action: i.derivedActionKey,
              ...(r.extra ?? {}),
            })
          }
        } catch {
          // ignore
        }
      }
    }

    for (const m of minibar) {
      buckets.items_consumed.push({
        item_id: m.item_id,
        item_name: m.name,
        quantity: m.qty,
        photos: [],
        charge_to_guest: true,
        source: 'minibar',
        issue_role: 'primary_issue',
      })
    }

    const allPhotos = issues.flatMap((i) => i.photos)

    try {
      const res = await submitMutation.mutateAsync({
        roomId: id,
        checkType,
        startedAt:
          draft?.startedAt || startedAtFromQuery || new Date().toISOString(),
        notes: note.trim() || null,
        photos: allPhotos,
        itemsMissing: buckets.items_missing,
        itemsDamaged: buckets.items_damaged,
        itemsLost: buckets.items_lost,
        itemsConsumed: buckets.items_consumed,
        itemsReplaced: buckets.items_replaced,
        itemsSentToLaundry: buckets.items_sent_to_laundry,
      })
      clearLeanDraft(id)
      navigate(
        `/rooms/${id}/check-lean/success?type=${checkType}&issues=${
          res.summary_issue_count
        }&checkId=${res.check_id}`,
        { replace: true },
      )
    } catch (e: any) {
      setSubmitError(e?.message || LEAN_TEXT.errNetwork)
      const sid: string | undefined = e?.itemId
      if (sid) {
        setErrorItemId(sid)
        requestAnimationFrame(() => {
          const el = itemRefs.current[sid]
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.querySelector<HTMLButtonElement>('button[data-edit-btn]')?.focus({ preventScroll: true })
          }
        })
      }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="px-4 pt-3 pb-3 border-b">
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        </header>
        <main className="flex-1 px-4 py-6 space-y-3">
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
          <div className="h-32 bg-muted rounded-lg animate-pulse" />
        </main>
      </div>
    )
  }

  if (isError || !room) {
    return (
      <LeanFullScreenError
        title="Không mở được thông tin phòng này"
        message="Bạn hãy thử lại. Nếu vẫn không được, hãy quay về danh sách việc."
        primaryLabel="Thử lại"
        onPrimary={() => refetch()}
        secondaryLabel="Quay về danh sách việc"
        onSecondary={() => navigate('/my-tasks')}
      />
    )
  }

  const isEmpty = issueCount === 0 && minibarCount === 0

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[calc(env(safe-area-inset-bottom)+128px)]">
      <header className="px-4 pt-3 pb-3 border-b sticky top-0 bg-background z-10">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackToInspection}
            aria-label="Quay lại"
            className="-ml-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1
              className="font-bold leading-tight truncate"
              style={{ fontSize: 22 }}
            >
              Phòng {room.room_number}
            </h1>
            <div className="text-[14px] text-muted-foreground">
              Bước 3/3 — Gửi kết quả kiểm tra
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        <section className="rounded-xl border bg-card p-4">
          <p className="text-[13px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Tổng kết
          </p>
          <div className="grid grid-cols-3 gap-3">
            <SummaryCell value={okCount} label="mục ổn" tone="ok" />
            <SummaryCell value={issueCount} label="vấn đề" tone="warn" />
            <SummaryCell value={minibarCount} label="minibar" tone="neutral" />
          </div>
          {isEmpty && (
            <p className="mt-3 text-[15px] text-green-700 font-medium">
              Không có vấn đề nào. Phòng sạch.
            </p>
          )}
        </section>

        {issueCount > 0 && (
          <section>
            <h2 className="text-[14px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">
              Vấn đề đã ghi nhận
            </h2>
            <ul className="space-y-2">
              {issues.map((iss) => {
                const isErr = errorItemId === iss.item_id
                const isDerived = iss.issueRole === 'derived_action'
                return (
                  <li
                    key={iss.id}
                    ref={(el) => {
                      itemRefs.current[iss.item_id] = el
                    }}
                    className={`rounded-xl border bg-card p-3 transition-colors ${
                      isErr ? 'border-destructive ring-2 ring-destructive/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold leading-tight">
                          {iss.item_name}
                          {isDerived && (
                            <span className="ml-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                              · Tự động
                            </span>
                          )}
                        </p>
                        <p className="text-[14px] text-amber-700 mt-0.5">
                          {labelForIssue(iss)} · SL {iss.quantity}
                          {iss.chargeToGuest === true && ' · Tính phí khách'}
                          {iss.needsReview && ' · Cần duyệt'}
                        </p>
                        {iss.notes && (
                          <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">
                            {iss.notes}
                          </p>
                        )}
                        {isErr && (
                          <p className="text-[13px] text-destructive font-medium mt-1">
                            Mục này cần được sửa trước khi gửi.
                          </p>
                        )}
                        {iss.photos.length > 0 && (
                          <div className="mt-2 flex gap-1.5">
                            {iss.photos.slice(0, 4).map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt=""
                                className="w-12 h-12 rounded-md object-cover border"
                              />
                            ))}
                            {iss.photos.length > 4 && (
                              <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center text-[12px] font-medium">
                                +{iss.photos.length - 4}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {!isDerived && (
                        <button
                          type="button"
                          data-edit-btn
                          onClick={() => handleEditIssue(iss.item_id)}
                          className="rounded-lg border-2 px-3 text-[14px] font-semibold active:bg-muted/50"
                          style={{ minHeight: 44 }}
                        >
                          Sửa lại
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {minibar.length > 0 && (
          <section>
            <h2 className="text-[14px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">
              Minibar đã dùng
            </h2>
            <ul className="rounded-xl border bg-card divide-y">
              {minibar.map((m) => (
                <li
                  key={m.item_id}
                  className="px-3 py-3 flex items-center justify-between"
                >
                  <span className="text-[16px]">{m.name}</span>
                  <span className="text-[16px] font-semibold tabular-nums">
                    × {m.qty}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-[14px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">
            Ghi chú chung (tuỳ chọn)
          </h2>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Điều hòa vẫn hoạt động, chỉ thiếu remote"
            rows={3}
            className="text-[16px] resize-none"
          />
        </section>

        {submitError && (
          <LeanInlineError
            message={submitError}
            onRetry={() => handleSubmit()}
          />
        )}
      </main>

      <footer className="fixed left-0 right-0 bottom-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-background border-t z-20">
        <div className="flex flex-col gap-2 max-w-md mx-auto">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="w-full text-[18px] font-semibold"
            style={{ minHeight: 56 }}
          >
            {submitMutation.isPending && (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            )}
            {submitMutation.isPending
              ? LEAN_TEXT.submitting
              : 'Gửi kết quả kiểm tra'}
          </Button>
          <Button
            variant="outline"
            onClick={handleBackToInspection}
            disabled={submitMutation.isPending}
            className="w-full text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            Quay lại sửa
          </Button>
        </div>
      </footer>
    </div>
  )
}

function SummaryCell({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'ok' | 'warn' | 'neutral'
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-green-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : 'text-foreground'
  return (
    <div className="text-center">
      <div className={`text-[28px] font-bold tabular-nums leading-none ${toneCls}`}>
        {value}
      </div>
      <div className="text-[12px] text-muted-foreground mt-1">{label}</div>
    </div>
  )
}
