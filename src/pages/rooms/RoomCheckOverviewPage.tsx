import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/hooks/useRooms'
import { navigateBack } from '@/lib/navigation'
import { useRoomBooking } from '@/hooks/useRoomBooking'
import { useQuickRoomCheck } from '@/hooks/useQuickRoomCheck'
import { useHotelPhotoMode } from '@/hooks/useHotelPhotoMode'
import { useRoomCheckLeanConfig } from '@/hooks/useRoomCheckLeanConfig'
import { LeanContextCard } from '@/components/rooms/lean/LeanContextCard'
import { LeanChecklistPreview } from '@/components/rooms/lean/LeanChecklistPreview'
import { ResumeDraftSheet, type DraftPayload } from '@/components/rooms/lean/ResumeDraftSheet'
import { QuickPathConfirmSheet } from '@/components/rooms/lean/QuickPathConfirmSheet'
import { useUser } from '@/hooks/useUser'
import { useRoomCheckSession, getSessionDurationMinutes, formatSessionDuration } from '@/hooks/useRoomCheckSession'
import { isAdminUser, isManager } from '@/lib/userAccess'
type LeanCheckType = 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'
import { toast } from 'sonner'

const CHECK_TYPE_LABEL: Record<string, string> = {
  daily: 'Kiểm hằng ngày',
  periodic: 'Kiểm định kỳ',
  checkin: 'Nhận phòng',
  checkout: 'Trả phòng',
  maintenance: 'Bảo trì',
}

/**
 * Step 1 — Overview (Lean).
 *
 * Hiển thị:
 * - Header: phòng, loại kiểm, tên khách (nếu có)
 * - Progress: "Bước 1/3 — Xem nhanh phòng"
 * - Resume draft sheet nếu có
 * - Context card tối giản
 * - Checklist preview theo nhóm
 * - Sticky footer CTA:
 *    daily/periodic → primary "Phòng ổn, gửi nhanh" + secondary "Bắt đầu kiểm tra"
 *    checkin/checkout → primary "Bắt đầu kiểm tra kỹ"
 */
export default function RoomCheckOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const checkType: LeanCheckType =
    (searchParams.get('type') as LeanCheckType) || 'daily'

  const { data: roomData, isLoading, isError, refetch, isRefetching } = useRoom(id)
  const { data: currentBooking } = useRoomBooking(id)
  const room = roomData?.room
  const items = useMemo(() => roomData?.items ?? [], [roomData?.items])
  const hotelId = room?.hotel_id ?? null

  const { data: photoMode } = useHotelPhotoMode(hotelId ?? undefined)
  const { data: leanCfg } = useRoomCheckLeanConfig(hotelId)
  const { mutateAsync: quickSubmit, isPending: isQuickSubmitting } = useQuickRoomCheck()

  const { user, tenantId } = useUser()
  const { session, createSession, deleteSession, takeOverSession } = useRoomCheckSession(id)
  const canTakeOver = isAdminUser(user) || isManager(user)
  const isOtherSession = !!session && session.user_id !== user?.id
  const sessionMinutes = session ? getSessionDurationMinutes(session.started_at) : 0

  const [quickOpen, setQuickOpen] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)

  // Group items theo nhóm Lean
  const checklistGroups = useMemo(() => {
    const counts = items.reduce<Record<string, number>>((acc, it: any) => {
      const t = it.item_type || 'other'
      acc[t] = (acc[t] || 0) + 1
      return acc
    }, {})
    return [
      { key: 'linen', label: 'Khăn & linen', count: counts.linen || 0 },
      { key: 'consumable', label: 'Đồ dùng (xà phòng, nước…)', count: counts.consumable || 0 },
      { key: 'equipment', label: 'Thiết bị', count: counts.equipment || 0 },
      { key: 'furniture', label: 'Nội thất', count: counts.furniture || 0 },
    ].filter((g) => g.count > 0)
  }, [items])

  const allowQuickPath =
    (checkType === 'daily' || checkType === 'periodic') &&
    (leanCfg?.quick_path_enabled ?? true)

  const guestName =
    (currentBooking as any)?.guest_name ||
    (currentBooking as any)?.guests?.full_name ||
    null

  // ───────────── Loading ─────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="px-4 pt-3 pb-3 border-b flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigateBack(navigate, '/my-tasks')
            }}
            aria-label="Quay lại"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="text-[16px] text-muted-foreground">Đang tải phòng...</div>
        </header>
        <div className="flex-1 px-4 py-6 space-y-4">
          <div className="h-8 w-40 rounded bg-muted animate-pulse" />
          <div className="h-[88px] rounded-lg bg-muted animate-pulse" />
          <div className="h-32 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  // ───────────── Error full screen ─────────────
  if (isError || !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background">
        <h1 className="text-[24px] font-semibold mb-2">
          Không mở được thông tin phòng này
        </h1>
        <p className="text-[18px] text-muted-foreground mb-8 max-w-sm">
          Bạn hãy thử lại. Nếu vẫn không được, hãy kiểm tra mạng hoặc liên hệ quản lý.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-14 text-[18px] font-semibold"
            style={{ minHeight: 56 }}
          >
            {isRefetching && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
            Thử lại
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/my-tasks')}
            className="text-[16px] font-medium"
            style={{ minHeight: 52 }}
          >
            Quay về danh sách việc
          </Button>
        </div>
      </div>
    )
  }

  // ───────────── Handlers ─────────────
  /** check_type của room_check_sessions là text — giữ nguyên loại kiểm thật để audit chính xác */
  const sessionType = checkType as
    | 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'

  const ensureSession = async (): Promise<boolean> => {
    if (!id || !user || !tenantId) return true
    if (session) {
      if (session.user_id === user.id) return true
      if (!canTakeOver) {
        toast.error(
          `${session.user_name} đang kiểm phòng này. Liên hệ quản lý để tiếp quản.`,
        )
        return false
      }
      return true
    }
    await createSession(id, sessionType, user.full_name || 'Nhân viên', tenantId)
    return true
  }

  const goInspection = async () => {
    if (isOtherSession && !canTakeOver) {
      toast.error('Phòng đang được người khác kiểm tra.')
      return
    }
    const ok = await ensureSession()
    if (!ok) return
    navigate(`/rooms/${id}/check-lean/inspection?type=${checkType}`)
  }

  const handleResumeDraft = async (_draft: DraftPayload) => {
    const ok = await ensureSession()
    if (!ok) return
    navigate(
      `/rooms/${id}/check-lean/inspection?type=${checkType}&resume=true`,
    )
  }

  const handleTakeOver = async () => {
    if (!id || !user || !tenantId) return
    const res = await takeOverSession(id, sessionType, user.full_name || 'Quản lý', tenantId)
    if (res) {
      navigate(`/rooms/${id}/check-lean/inspection?type=${checkType}`)
    }
  }

  const handleQuickConfirm = async () => {
    if (!id) return
    setQuickError(null)
    if (photoMode === 'always') {
      // Bắt buộc chụp ảnh — chuyển sang flow đầy đủ Quick có upload (QuickOkButton cũ)
      toast.error('Khách sạn yêu cầu chụp ảnh khi kiểm nhanh. Vui lòng dùng kiểm tra kỹ.')
      setQuickOpen(false)
      goInspection()
      return
    }
    try {
      const res = await quickSubmit({
        roomId: id,
        checkType: checkType as any,
        photos: [],
      })
      setQuickOpen(false)
      // Dọn session realtime + draft autosave (quick path không đi qua submit_room_check_lean)
      try { await deleteSession(id) } catch { /* realtime cleanup is best effort */ }
      try {
        const { clearLeanDraft } = await import('@/hooks/useLeanDraft')
        clearLeanDraft(id)
      } catch { /* draft cleanup is best effort */ }
      navigate(
        `/rooms/${id}/check-lean/success?type=${checkType}&issues=0&checkId=${res.check_id}&quick=1`,
        { replace: true },
      )
    } catch (err: any) {
      setQuickError(
        err?.message ||
          'Mạng đang yếu nên chưa gửi được kết quả. Bạn có thể thử lại hoặc kiểm tra kỹ.'
      )
    }
  }

  // ───────────── Render ─────────────
  return (
    <div className="min-h-screen flex flex-col bg-background pb-[calc(env(safe-area-inset-bottom)+96px)]">
      {/* Header */}
      <header className="px-4 pt-3 pb-3 border-b sticky top-0 bg-background z-10">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigateBack(navigate, '/my-tasks')
            }}
            aria-label="Quay lại"
            className="-ml-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1
              className="font-bold leading-tight truncate"
              style={{ fontSize: 28 }}
            >
              Phòng {room.room_number}
            </h1>
            <div className="text-[16px] text-muted-foreground">
              {CHECK_TYPE_LABEL[checkType] || checkType}
              {guestName ? <> · Khách: {guestName}</> : null}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[14px] text-muted-foreground">
          {allowQuickPath
            ? 'Chọn “Phòng OK hoàn toàn” nếu không có sự cố, hoặc bắt đầu kiểm tra kỹ.'
            : 'Bước 1/3 — Xem nhanh phòng'}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {/* Realtime session conflict banner */}
        {isOtherSession && (
          <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/60 p-3 space-y-2">
            <p className="text-[15px] font-semibold text-amber-800">
              {session!.user_name} đang kiểm phòng này
            </p>
            <p className="text-[13px] text-amber-700">
              Bắt đầu {formatSessionDuration(sessionMinutes)} trước. Vui lòng chờ hoàn tất hoặc liên hệ quản lý.
            </p>
            {canTakeOver && (
              <Button
                variant="outline"
                className="w-full mt-1"
                style={{ minHeight: 44 }}
                onClick={handleTakeOver}
              >
                Tiếp quản phiên
              </Button>
            )}
          </div>
        )}

        <LeanContextCard
          roomId={id!}
          onSeeMore={() => navigate(`/rooms/${id}`)}
        />

        <LeanChecklistPreview groups={checklistGroups} />
      </main>

      {/* Sticky footer CTA */}
      <footer
        className="fixed left-0 right-0 bottom-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-background border-t z-20"
      >
        <div className="flex flex-col gap-3 max-w-md mx-auto">
          {(() => {
            const blockedByOther = isOtherSession && !canTakeOver
            return allowQuickPath ? (
              <>
                <Button
                  onClick={() => setQuickOpen(true)}
                  disabled={blockedByOther}
                  className="w-full h-14 text-[18px] font-semibold"
                  style={{ minHeight: 56 }}
                >
                  Phòng OK hoàn toàn
                </Button>
                <Button
                  variant="outline"
                  onClick={goInspection}
                  disabled={blockedByOther}
                  className="w-full text-[16px] font-medium"
                  style={{ minHeight: 52 }}
                >
                  Bắt đầu kiểm tra
                </Button>
              </>
            ) : (
              <Button
                onClick={goInspection}
                disabled={blockedByOther}
                className="w-full h-14 text-[18px] font-semibold"
                style={{ minHeight: 56 }}
              >
                Bắt đầu kiểm tra kỹ
              </Button>
            )
          })()}
        </div>
      </footer>

      {/* Resume draft */}
      <ResumeDraftSheet
        roomId={id!}
        roomName={`${room.room_number}`}
        onResume={handleResumeDraft}
        onDiscard={() => {
          /* user chọn làm lại — ở lại Overview */
        }}
        onViewRoomInfo={() => navigate(`/rooms/${id}`)}
      />

      {/* Quick path confirm */}
      <QuickPathConfirmSheet
        open={quickOpen}
        onOpenChange={(v) => {
          setQuickOpen(v)
          if (!v) setQuickError(null)
        }}
        isSubmitting={isQuickSubmitting}
        errorMessage={quickError}
        onConfirm={handleQuickConfirm}
        onBackToInspection={() => {
          setQuickOpen(false)
          goInspection()
        }}
      />
    </div>
  )
}
