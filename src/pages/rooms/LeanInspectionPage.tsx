import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { navigateBack } from '@/lib/navigation'
// supabase client không còn dùng trực tiếp ở đây (Sprint 4 #33 — enrich qua useRoom)
import { toast } from 'sonner'

import { useRoom } from '@/hooks/useRooms'
import { useRoomCheckLeanConfig } from '@/hooks/useRoomCheckLeanConfig'
import { useLeanDraft, readLeanDraft, clearLeanDraft } from '@/hooks/useLeanDraft'
import { useRoomCheckSession } from '@/hooks/useRoomCheckSession'
import { useUser } from '@/hooks/useUser'

import {
  LeanReportIssueSheet,
  type LeanIssueResult,
  type LeanIssueLevel1,
} from '@/components/rooms/lean/LeanReportIssueSheet'

import type { RoomItemWithDetails } from '@/types/rooms.types'
import type { ItemType } from '@/types/items.types'
import type { AssetGroup } from '@/types/assetGroup.types'

type LeanCheckType = 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'

interface EnrichedItem extends RoomItemWithDetails {
  item_type: ItemType
  category_name: string
  category_id: string | null
  is_minibar: boolean
  unit_price?: number | null
  asset_group?: AssetGroup | null
}

/** Issue đã ghi nhận trong session — multi-issue per item */
interface LeanIssue {
  /** Local id để key/edit từng issue */
  id: string
  item_id: string
  item_name: string
  item_type: ItemType
  level1: LeanIssueLevel1
  kind: 'damaged' | 'lost' | 'missing' | 'consumed'
  quantity: number
  photos: string[]
  chargeToGuest?: boolean
  notes?: string
  /** Đợt B */
  uiActionKey?: string
  bucket?: string
  issueRole?: 'primary_issue' | 'derived_action'
  needsReview?: boolean
  assetGroup?: AssetGroup
  subReason?: string
  extra?: Record<string, any>
}

interface DraftShape {
  startedAt: string
  /** issues[itemId] = list */
  issues: Record<string, LeanIssue[]>
  /** Minibar inline: itemId -> qty đã dùng (chưa cần ảnh) */
  minibar: Record<string, number>
}

function genIssueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID()
  }
  return `iss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Nhóm Lean — theo spec */
const GROUP_DEFS: { key: string; label: string; match: (it: EnrichedItem) => boolean }[] = [
  {
    key: 'linen',
    label: 'Khăn & linen',
    match: (it) => it.item_type === 'linen',
  },
  {
    key: 'bathroom',
    label: 'Phòng tắm',
    match: (it) =>
      /tắm|bath|toilet|wc|nhà vệ sinh|sàn|gương/i.test(it.category_name) ||
      /tắm|khăn mặt|dầu gội|sữa tắm/i.test(it.item_name),
  },
  {
    key: 'equipment',
    label: 'Thiết bị',
    match: (it) => it.item_type === 'equipment' || it.item_type === 'furniture',
  },
  {
    key: 'minibar',
    label: 'Minibar',
    match: (it) => it.is_minibar,
  },
  {
    key: 'other',
    label: 'Khác',
    match: () => true, // catch-all
  },
]

function groupItems(items: EnrichedItem[]) {
  const buckets: Record<string, EnrichedItem[]> = {}
  for (const def of GROUP_DEFS) buckets[def.key] = []
  for (const it of items) {
    let placed = false
    for (const def of GROUP_DEFS) {
      if (def.key === 'other') continue
      if (def.match(it)) {
        buckets[def.key].push(it)
        placed = true
        break
      }
    }
    if (!placed) buckets.other.push(it)
  }
  return GROUP_DEFS.filter((g) => buckets[g.key].length > 0).map((g) => ({
    key: g.key,
    label: g.label,
    items: buckets[g.key],
  }))
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function LeanInspectionPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const checkType: LeanCheckType =
    (params.get('type') as LeanCheckType) || 'daily'

  const { data: roomData, isLoading, isError, refetch } = useRoom(id)
  const room = roomData?.room
  const items = useMemo(() => roomData?.items ?? [], [roomData?.items])
  const hotelId = room?.hotel_id ?? null

  const { data: leanCfg } = useRoomCheckLeanConfig(hotelId)

  // ────── Enrich items — Sprint 4 #33 ──────
  // RPC `get_room_items_with_standards` đã trả về sẵn item_type/is_chargeable/
  // unit_price/asset_group/default_item_type → derive thẳng bằng useMemo,
  // không cần thêm 1 query `items.in(ids)` mỗi lần mở trang.
  const enriched = useMemo<EnrichedItem[]>(() => {
    return items.map((it) => {
      const itemType =
        ((it as any).item_type as ItemType) ??
        ((it as any).default_item_type as ItemType) ??
        'equipment'
      const catName = it.category_name || 'Khác'
      const isMinibar =
        !!(it as any).is_chargeable &&
        (itemType === 'consumable' || /minibar/i.test(catName))
      return {
        ...it,
        item_type: itemType,
        category_name: catName,
        category_id: (it as any).category_id ?? null,
        is_minibar: isMinibar,
        unit_price: (it as any).unit_price ?? null,
        asset_group: ((it as any).asset_group as AssetGroup) ?? null,
      }
    })
  }, [items])
  const enrichLoading = false
  const enrichError: string | null = null

  // ────── State chính ──────
  const startedAtRef = useRef<string>(new Date().toISOString())
  const [issues, setIssues] = useState<Record<string, LeanIssue[]>>({})
  const [minibar, setMinibar] = useState<Record<string, number>>({})
  /** sheet trạng thái: item + (issueId nếu sửa, null nếu thêm mới) */
  const [sheetState, setSheetState] = useState<
    { item: EnrichedItem; issueId: string | null } | null
  >(null)

  // ────── Hydrate từ draft (nếu có ?resume=true) ──────
  const resumeRequested = params.get('resume') === 'true'
  const editItemId = params.get('edit')
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current || !id) return
    if (!resumeRequested) {
      hydratedRef.current = true
      return
    }
    const env = readLeanDraft<DraftShape>(id)
    if (env?.data) {
      startedAtRef.current = env.data.startedAt || startedAtRef.current
      // Migrate draft cũ (issues[itemId] = LeanIssue) → array
      const raw: any = env.data.issues || {}
      const migrated: Record<string, LeanIssue[]> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          migrated[k] = (v as any[]).map((x) => ({ ...x, id: x.id || genIssueId() }))
        } else if (v && typeof v === 'object') {
          migrated[k] = [{ ...(v as LeanIssue), id: (v as any).id || genIssueId() }]
        }
      }
      setIssues(migrated)
      setMinibar(env.data.minibar || {})
    }
    hydratedRef.current = true
  }, [id, resumeRequested])

  // ────── Auto-mở sheet khi quay từ Review với ?edit={itemId} ──────
  const editOpenedRef = useRef(false)
  useEffect(() => {
    if (editOpenedRef.current) return
    if (!editItemId || !enriched.length) return
    const target = enriched.find((it) => it.item_id === editItemId)
    if (target) {
      const list = issues[editItemId]
      const first = list && list.length > 0 ? list[0].id : null
      setSheetState({ item: target, issueId: first })
      editOpenedRef.current = true
    }
  }, [editItemId, enriched, issues])

  // ────── Autosave ──────
  const draftPayload: DraftShape = useMemo(
    () => ({
      startedAt: startedAtRef.current,
      issues,
      minibar,
    }),
    [issues, minibar],
  )

  const { status: saveStatus, savedAt, saveNow } = useLeanDraft<DraftShape>(
    id,
    draftPayload,
    !!id && !enrichLoading,
  )

  // ────── Realtime takeover detection ──────
  const { user } = useUser()
  const { session } = useRoomCheckSession(id)
  const takenOver =
    !!session && !!user?.id && session.user_id !== user.id
  const takenOverBy = takenOver ? session?.user_name : null

  // Toast cảnh báo + auto redirect khi vừa bị tiếp quản (chạy 1 lần)
  const takenOverNotifiedRef = useRef(false)
  useEffect(() => {
    if (!takenOver) {
      takenOverNotifiedRef.current = false
      return
    }
    if (takenOverNotifiedRef.current) return
    takenOverNotifiedRef.current = true
    toast.warning(
      takenOverBy
        ? `${takenOverBy} đã tiếp quản phiên kiểm`
        : 'Phiên kiểm đã được tiếp quản',
      {
        description: 'Bạn sẽ được chuyển về tổng quan trong giây lát.',
        duration: 4000,
      },
    )
    const t = setTimeout(() => {
      navigate(`/rooms/${id}/check-lean`, { replace: true })
    }, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takenOver])

  // ────── Handlers ──────
  /** Số mục có ít nhất 1 issue */
  const reportedCount = Object.values(issues).filter((l) => l.length > 0).length
  /** Tổng số issues */
  const totalIssueCount = Object.values(issues).reduce((s, l) => s + l.length, 0)

  const openNewIssueFor = (it: EnrichedItem) => {
    setSheetState({ item: it, issueId: null })
  }

  const openEditIssue = (it: EnrichedItem, issueId: string) => {
    setSheetState({ item: it, issueId })
  }

  const handleIssueSubmit = (result: LeanIssueResult) => {
    if (!sheetState) return
    const { item, issueId } = sheetState
    setIssues((prev) => {
      const list = prev[item.item_id] ? [...prev[item.item_id]] : []
      const newIssue: LeanIssue = {
        id: issueId || genIssueId(),
        item_id: item.item_id,
        item_name: item.item_name,
        item_type: item.item_type,
        level1: result.level1,
        kind: result.kind,
        quantity: result.quantity,
        photos: result.photos,
        chargeToGuest: result.chargeToGuest,
        notes: result.notes,
        uiActionKey: result.uiActionKey,
        bucket: result.bucket,
        issueRole: result.issueRole,
        needsReview: result.needsReview,
        assetGroup: result.assetGroup ?? (item.asset_group ?? undefined),
        subReason: result.subReasonKey,
        extra: result.extra,
      }
      if (issueId) {
        const idx = list.findIndex((x) => x.id === issueId)
        if (idx >= 0) list[idx] = newIssue
        else list.push(newIssue)
      } else {
        list.push(newIssue)
      }
      return { ...prev, [item.item_id]: list }
    })
  }

  const removeIssue = (itemId: string, issueId: string) => {
    setIssues((prev) => {
      const list = (prev[itemId] || []).filter((x) => x.id !== issueId)
      const next = { ...prev }
      if (list.length === 0) delete next[itemId]
      else next[itemId] = list
      return next
    })
  }

  const setMinibarQty = (itemId: string, qty: number) => {
    setMinibar((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[itemId]
      else next[itemId] = qty
      return next
    })
  }

  // Minibar có hiển thị stepper khi check_type cho phép
  const showMinibarDeep =
    checkType === 'checkout' || checkType === 'daily'

  // ────── Continue → Step 3 Review ──────
  const handleContinue = async () => {
    saveNow()
    // Step 3 review sẽ làm prompt sau — tạm điều hướng tới review route mới.
    navigate(
      `/rooms/${id}/check-lean/review?type=${checkType}&started=${encodeURIComponent(
        startedAtRef.current,
      )}`,
    )
  }

  // ────── Render ──────
  if (isLoading || enrichLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="px-4 pt-3 pb-3 border-b">
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        </header>
        <main className="flex-1 px-4 py-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    )
  }

  if (isError || !room || enrichError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
        <h1 className="text-[22px] font-semibold mb-2">
          Không mở được danh mục kiểm tra
        </h1>
        <p className="text-[16px] text-muted-foreground mb-6 max-w-sm">
          Chạm để thử lại.
        </p>
        <Button
          onClick={() => refetch()}
          className="text-[18px] font-semibold"
          style={{ minHeight: 56, paddingInline: 24 }}
        >
          Thử lại
        </Button>
      </div>
    )
  }

  const groups = groupItems(enriched)

  const photoRequiredFor = {
    damaged_lost: leanCfg?.photo_required_damaged_lost ?? true,
    missing_replace: leanCfg?.photo_required_missing_replace ?? false,
    consumed_chargeable: leanCfg?.photo_required_consumed_chargeable ?? false,
  }

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[calc(env(safe-area-inset-bottom)+96px)]">
      {/* Header */}
      <header className="px-4 pt-3 pb-3 border-b sticky top-0 bg-background z-10">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateBack(navigate, '/rooms')}
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
              Kiểm tra phòng {room.room_number}
            </h1>
            <div className="text-[14px] text-muted-foreground">
              Bước 2/3 — Ghi nhận vấn đề
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              saveNow()
              toast.success('Đã lưu tạm.')
            }}
            className="text-[16px] font-semibold text-primary px-3 py-2 border rounded-lg active:bg-muted/50"
            style={{ minHeight: 44 }}
          >
            Lưu tạm
          </button>
        </div>

        {/* Save status */}
        <div
          className={cn(
            'mt-1 text-[13px]',
            saveStatus === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {saveStatus === 'saving' && 'Đang lưu...'}
          {saveStatus === 'saved' && savedAt && `Đã lưu lúc ${formatTime(savedAt)}`}
          {saveStatus === 'idle' && 'Chưa lưu'}
          {saveStatus === 'error' &&
            'Chưa lưu tạm được. Thông tin bạn vừa nhập vẫn còn trên máy này.'}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-4 space-y-5">
        <p className="text-[16px] text-muted-foreground">
          Mặc định các mục đang là ổn. Chỉ chọn những chỗ có vấn đề.
        </p>

        {groups.map((g) => (
          <section
            key={g.key}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <header className="px-3 py-2 border-b bg-muted/30">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">
                {g.label}
                <span className="ml-2 text-[12px] font-medium text-muted-foreground">
                  {g.items.length} mục
                </span>
              </h2>
            </header>
            <ul>
              {g.items.map((it) => {
                const issueList = issues[it.item_id] ?? []
                const isMinibar = it.is_minibar
                const minibarQty = minibar[it.item_id] ?? 0

                if (isMinibar && showMinibarDeep && issueList.length === 0) {
                  return (
                    <li
                      key={it.item_id}
                      className="px-3 py-3 border-b last:border-b-0"
                      style={{ minHeight: 64 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] font-medium leading-tight truncate">
                            {it.item_name}
                          </p>
                          <p className="text-[13px] text-muted-foreground mt-0.5">
                            {minibarQty > 0 ? `Đã dùng ${minibarQty}` : 'Chưa dùng'}
                          </p>
                        </div>
                        {minibarQty === 0 ? (
                          <button
                            type="button"
                            onClick={() => setMinibarQty(it.item_id, 1)}
                            className="rounded-lg border-2 px-3 font-semibold text-[14px] active:bg-muted/50"
                            style={{ minHeight: 44 }}
                          >
                            Đã dùng
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setMinibarQty(it.item_id, Math.max(0, minibarQty - 1))
                              }
                              className="rounded-lg border-2 text-xl font-bold active:bg-muted/50"
                              style={{ width: 56, height: 56 }}
                              aria-label="Giảm"
                            >
                              −
                            </button>
                            <div
                              className="text-center font-bold tabular-nums"
                              style={{ minWidth: 36, fontSize: 22 }}
                            >
                              {minibarQty}
                            </div>
                            <button
                              type="button"
                              onClick={() => setMinibarQty(it.item_id, minibarQty + 1)}
                              className="rounded-lg border-2 text-xl font-bold active:bg-muted/50"
                              style={{ width: 56, height: 56 }}
                              aria-label="Tăng"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                }

                if (issueList.length === 0) {
                  // Item ổn — hàng đơn giản, bấm để báo vấn đề
                  return (
                    <li
                      key={it.item_id}
                      className="border-b last:border-b-0 flex items-stretch"
                      style={{ minHeight: 64 }}
                    >
                      <button
                        type="button"
                        onClick={() => openNewIssueFor(it)}
                        className="flex-1 flex items-center gap-3 px-3 py-3 text-left active:bg-muted/50"
                        aria-label={`Báo vấn đề cho ${it.item_name}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] font-medium leading-tight truncate">
                            {it.item_name}
                          </p>
                          <p className="text-[13px] mt-0.5 text-green-600 font-medium">
                            Ổn
                          </p>
                        </div>
                        <span
                          className="text-[14px] font-semibold text-primary px-3 py-2 border-2 border-primary/40 rounded-lg"
                          style={{ minHeight: 44 }}
                        >
                          Có vấn đề
                        </span>
                      </button>
                    </li>
                  )
                }

                // Item có ≥1 issue — render list + nút thêm
                return (
                  <li
                    key={it.item_id}
                    className="border-b last:border-b-0 px-3 py-3 space-y-2"
                  >
                    <p className="text-[16px] font-medium leading-tight truncate">
                      {it.item_name}
                      <span className="ml-2 text-[12px] font-medium text-muted-foreground">
                        {issueList.length} sự cố
                      </span>
                    </p>
                    <ul className="space-y-1.5">
                      {issueList.map((iss) => (
                        <li
                          key={iss.id}
                          className="flex items-stretch border rounded-lg overflow-hidden"
                          style={{ minHeight: 56 }}
                        >
                          <button
                            type="button"
                            onClick={() => openEditIssue(it, iss.id)}
                            className="flex-1 px-3 py-2 text-left active:bg-muted/50"
                            aria-label={`Sửa sự cố ${iss.item_name}`}
                          >
                            <p className="text-[14px] font-semibold text-amber-700 leading-tight">
                              {issueLabel(iss)} · SL {iss.quantity}
                              {iss.photos.length > 0 && ` · ${iss.photos.length} ảnh`}
                            </p>
                            {iss.notes && (
                              <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                                {iss.notes}
                              </p>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeIssue(it.item_id, iss.id)}
                            aria-label="Bỏ sự cố này"
                            className="px-3 text-[13px] font-semibold text-muted-foreground border-l active:bg-muted/50"
                            style={{ minWidth: 56 }}
                          >
                            Bỏ
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => openNewIssueFor(it)}
                      className="w-full text-[14px] font-semibold text-primary py-2 border-2 border-dashed border-primary/40 rounded-lg active:bg-muted/50"
                      style={{ minHeight: 44 }}
                    >
                      + Thêm sự cố khác
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {groups.length === 0 && (
          <div className="text-center py-12 text-[16px] text-muted-foreground">
            Phòng này chưa có danh mục đồ. Bạn vẫn có thể tiếp tục để gửi kiểm
            phòng.
          </div>
        )}
      </main>

      {/* Sticky footer */}
      <footer className="fixed left-0 right-0 bottom-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-background border-t z-20">
        <div className="max-w-md mx-auto flex flex-col gap-2">
          <Button
            onClick={handleContinue}
            className="w-full font-semibold text-[18px]"
            style={{ minHeight: 56 }}
          >
            Tiếp tục
            {totalIssueCount > 0 && (
              <span className="ml-2 text-[14px] font-medium opacity-80">
                · {totalIssueCount} sự cố / {reportedCount} mục
              </span>
            )}
          </Button>
        </div>
      </footer>

      {/* Report Issue Sheet */}
      {(() => {
        const sheetItem = sheetState?.item ?? null
        const editingIssue =
          sheetItem && sheetState?.issueId
            ? (issues[sheetItem.item_id] ?? []).find((x) => x.id === sheetState.issueId) ?? null
            : null
        return (
          <LeanReportIssueSheet
            open={!!sheetItem}
            onOpenChange={(v) => !v && setSheetState(null)}
            itemName={sheetItem?.item_name || ''}
            itemType={sheetItem?.item_type || 'equipment'}
            standardQuantity={sheetItem?.standard_quantity || 1}
            assetGroup={sheetItem?.asset_group ?? null}
            photoRequiredFor={photoRequiredFor}
            initial={
              editingIssue
                ? {
                    level1: editingIssue.level1,
                    quantity: editingIssue.quantity,
                    photos: editingIssue.photos,
                    chargeToGuest: editingIssue.chargeToGuest,
                    notes: editingIssue.notes,
                    subReasonKey: editingIssue.subReason,
                  }
                : null
            }
            onSubmit={handleIssueSubmit}
          />
        )
      })()}
      {/* Takeover overlay — block khi Manager đã tiếp quản phiên kiểm */}
      {takenOver && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center px-6"
        >
          <div className="max-w-sm w-full rounded-xl border bg-card p-5 shadow-lg space-y-4">
            <div>
              <h2 className="text-[20px] font-bold text-amber-700">
                Phiên kiểm đã được tiếp quản
              </h2>
              <p className="text-[15px] text-muted-foreground mt-2">
                {takenOverBy
                  ? `${takenOverBy} đã tiếp quản phiên kiểm phòng này.`
                  : 'Một quản lý đã tiếp quản phiên kiểm phòng này.'}{' '}
                Bản nhập tạm của bạn vẫn còn trên máy nhưng không gửi được nữa.
              </p>
            </div>
            <Button
              onClick={() => navigate(`/rooms/${id}/check-lean`, { replace: true })}
              className="w-full font-semibold text-[17px]"
              style={{ minHeight: 52 }}
            >
              Quay lại tổng quan
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function issueLabel(issue: LeanIssue): string {
  switch (issue.level1) {
    case 'damaged_lost':
      return 'Hỏng / mất'
    case 'missing_replace':
      return 'Thiếu / cần thay'
    case 'consumed_chargeable':
      return 'Khách đã dùng'
  }
}

// Re-export draft helper cho Step 3 dùng cùng key
export { clearLeanDraft }
