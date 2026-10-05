import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookingIssues } from '@/hooks/useBookingConsumables'
import { useSyncBookingDamageCharges, type RoomCheckItem, type IssueListKey } from '@/hooks/useBookingIssues'
import { IssueItemRow } from './IssueItemRow'
import { cn } from '@/lib/utils'

interface BookingIssuesCardProps {
  bookingId: string
  roomId: string
  checkInDate: string
  checkOutDate?: string | null
  damageCharges?: number | null
}

interface FlatIssue {
  key: string
  roomCheckId: string
  listKey: IssueListKey
  itemIndex: number
  item: RoomCheckItem
  checkType: string
  checkedAt: string | null
  checkedByName: string | null
  photos: string[]
}

const formatVND = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v)

export function BookingIssuesCard({
  bookingId,
  roomId,
  checkInDate,
  checkOutDate,
  damageCharges,
}: BookingIssuesCardProps) {
  const { data: issues, isLoading } = useBookingIssues(roomId, checkInDate, checkOutDate || undefined)
  const syncMutation = useSyncBookingDamageCharges()

  const flatIssues = useMemo<FlatIssue[]>(() => {
    if (!issues) return []
    const result: FlatIssue[] = []
    for (const rc of issues as any[]) {
      const photos: string[] = Array.isArray(rc.photos) ? rc.photos : []
      const damaged: RoomCheckItem[] = Array.isArray(rc.items_damaged) ? rc.items_damaged : []
      const lost: RoomCheckItem[] = Array.isArray(rc.items_lost) ? rc.items_lost : []
      damaged.forEach((item, i) => {
        result.push({
          key: `${rc.id}-d-${i}`,
          roomCheckId: rc.id,
          listKey: 'items_damaged',
          itemIndex: i,
          item,
          checkType: rc.check_type,
          checkedAt: rc.checked_at,
          checkedByName: rc.checked_by_name,
          photos,
        })
      })
      lost.forEach((item, i) => {
        result.push({
          key: `${rc.id}-l-${i}`,
          roomCheckId: rc.id,
          listKey: 'items_lost',
          itemIndex: i,
          item,
          checkType: rc.check_type,
          checkedAt: rc.checked_at,
          checkedByName: rc.checked_by_name,
          photos,
        })
      })
    }
    return result
  }, [issues])

  const totalDamaged = flatIssues.filter((f) => f.listKey === 'items_damaged').length
  const totalLost = flatIssues.filter((f) => f.listKey === 'items_lost').length
  const currentCharges = damageCharges || 0

  // Tính tổng "Sẽ thu" từ các item có resolution = charge_guest
  const computedCharges = useMemo(() => {
    return flatIssues.reduce((sum, f) => {
      if (f.item.resolution === 'charge_guest') {
        const cost = (f.item.damage_cost || 0) * (f.item.quantity || 1)
        return sum + cost
      }
      return sum
    }, 0)
  }, [flatIssues])

  const chargeableItems = useMemo(
    () =>
      flatIssues
        .filter((f) => f.item.resolution === 'charge_guest')
        .map((f) => ({
          item_id: f.item.item_id,
          item_name: f.item.item_name,
          item_code: f.item.item_code,
          quantity: f.item.quantity || 1,
          unit_cost: f.item.damage_cost || 0,
          total_cost: (f.item.damage_cost || 0) * (f.item.quantity || 1),
          type: f.listKey === 'items_lost' ? 'lost' : 'damaged',
          room_check_id: f.roomCheckId,
        })),
    [flatIssues],
  )

  const isOutOfSync = computedCharges !== currentCharges
  const hasIssues = flatIssues.length > 0 || currentCharges > 0

  const handleSync = () => {
    syncMutation.mutate({
      bookingId,
      damageCharges: computedCharges,
      damageItems: chargeableItems,
    })
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <div className="px-3 py-2 border-b">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border',
        hasIssues && 'border-orange-500/40',
      )}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn('h-4 w-4', hasIssues ? 'text-orange-600' : 'text-muted-foreground')} />
          <span className="text-sm font-medium">Vấn đề phát sinh</span>
          {hasIssues && (
            <Badge variant="outline" className="text-xs h-5 text-orange-600 border-orange-500/40">
              {totalDamaged + totalLost} sự cố
            </Badge>
          )}
        </div>
      </div>

      <div className="p-3">
        {!hasIssues ? (
          <p className="text-sm text-muted-foreground py-2">
            Không có vấn đề nào được ghi nhận trong thời gian khách lưu trú.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Tóm tắt 3 cột */}
            <div className="grid grid-cols-3 divide-x divide-border rounded-lg border">
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Đồ hỏng</div>
                <p
                  className={cn(
                    'text-lg font-bold',
                    totalDamaged > 0 ? 'text-orange-600' : 'text-muted-foreground',
                  )}
                >
                  {totalDamaged}
                </p>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Đồ mất</div>
                <p
                  className={cn(
                    'text-lg font-bold',
                    totalLost > 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {totalLost}
                </p>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Phụ thu hiện tại</div>
                <p
                  className={cn(
                    'text-base font-bold font-mono',
                    currentCharges > 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {formatVND(currentCharges)}
                </p>
              </div>
            </div>

            {/* Banner đồng bộ */}
            {flatIssues.length > 0 && (
              <div
                className={cn(
                  'rounded-md border px-3 py-2 flex items-center justify-between gap-2 flex-wrap',
                  isOutOfSync ? 'border-amber-500/40' : 'border-green-500/40',
                )}
              >
                <div className="text-xs">
                  {isOutOfSync ? (
                    <>
                      <span className="text-amber-600 font-medium">⚠ Chưa đồng bộ với hóa đơn.</span>{' '}
                      <span className="text-muted-foreground">
                        Sẽ thu: <span className="font-mono font-medium text-foreground">{formatVND(computedCharges)}</span>
                        {' '}• Hiện tại:{' '}
                        <span className="font-mono">{formatVND(currentCharges)}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-green-600">✓ Phụ thu đã khớp với hóa đơn</span>
                  )}
                </div>
                {isOutOfSync && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleSync}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Đồng bộ phụ thu
                  </Button>
                )}
              </div>
            )}

            {/* Danh sách sự cố */}
            <div className="divide-y divide-border">
              {flatIssues.map((f) => (
                <IssueItemRow
                  key={f.key}
                  roomCheckId={f.roomCheckId}
                  listKey={f.listKey}
                  itemIndex={f.itemIndex}
                  item={f.item}
                  checkType={f.checkType}
                  checkedAt={f.checkedAt}
                  checkedByName={f.checkedByName}
                  photos={f.photos}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
