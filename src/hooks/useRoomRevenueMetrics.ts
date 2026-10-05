/**
 * useRoomRevenueMetrics — Gộp doanh thu + occupancy → tính ADR / RevPAR / so kỳ trước.
 *
 * Định nghĩa (chuẩn quốc tế):
 * - Room Revenue = doanh thu phòng thuần (loại bỏ phụ thu, dịch vụ, minibar).
 * - ADR = Room Revenue / số đêm phòng đã bán.
 * - RevPAR = Room Revenue / số đêm phòng có sẵn (đã trừ OOS/maintenance qua RPC).
 * - Occupancy% = số đêm bán / số đêm có sẵn.
 *
 * Tenant isolation: được đảm bảo bởi 2 hook con (useRevenueReport, useRoomsReportData).
 */
import { useMemo } from 'react'
import { useRevenueReport, type RevenueReport } from './useRevenueReport'
import { useRoomsReportData, type RoomsReportData } from './useRoomsReportData'
import { computeDelta, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'

export interface RoomRevenueMetrics {
  loading: boolean
  /** Doanh thu phòng kỳ này (đã loại surcharge). */
  roomRevenue: { value: number; delta: number | null }
  occupancy: { value: number; delta: number | null }
  adr: { value: number; delta: number | null }
  revpar: { value: number; delta: number | null }
  alos: number
  roomNightsSold: number
  availableRoomNights: number
  totalRooms: number
  revenue: RevenueReport | undefined
  rooms: RoomsReportData | null
  roomsPrev: RoomsReportData | null
}

export function useRoomRevenueMetrics(period: PeriodRangeWithPrevious): RoomRevenueMetrics {
  const revQ = useRevenueReport('custom', { start: period.current.start, end: period.current.end })
  const roomsQ = useRoomsReportData({ start: period.current.start, end: period.current.end })
  const roomsPrevQ = useRoomsReportData({ start: period.previous.start, end: period.previous.end })

  return useMemo<RoomRevenueMetrics>(() => {
    const loading = revQ.isLoading || roomsQ.isLoading || roomsPrevQ.isLoading
    const rev = revQ.data
    const rooms = roomsQ.data
    const roomsPrev = roomsPrevQ.data

    // Room revenue thuần = total - tất cả phụ thu/dịch vụ
    const roomRevenueCur = rev
      ? Math.max(0, rev.currentPeriod.totalRevenue - rev.currentPeriod.surcharges.total)
      : 0
    const roomRevenuePrev = rev
      ? Math.max(0, rev.previousPeriod.totalRevenue - rev.previousPeriod.surcharges.total)
      : 0

    const nightsSoldCur = rooms?.occupancyStats.total_room_nights || 0
    const nightsSoldPrev = roomsPrev?.occupancyStats.total_room_nights || 0
    const availableCur = rooms?.occupancyStats.available_room_nights || 0
    const availablePrev = roomsPrev?.occupancyStats.available_room_nights || 0

    const adrCur = nightsSoldCur > 0 ? roomRevenueCur / nightsSoldCur : 0
    const adrPrev = nightsSoldPrev > 0 ? roomRevenuePrev / nightsSoldPrev : 0

    const revparCur = availableCur > 0 ? roomRevenueCur / availableCur : 0
    const revparPrev = availablePrev > 0 ? roomRevenuePrev / availablePrev : 0

    const occCur = rooms?.occupancyStats.occupancy_rate || 0
    const occPrev = roomsPrev?.occupancyStats.occupancy_rate || 0

    const bookingsCur = rooms?.occupancyStats.total_bookings || 0
    const alos = bookingsCur > 0 ? nightsSoldCur / bookingsCur : 0

    return {
      loading,
      roomRevenue: { value: roomRevenueCur, delta: rev ? computeDelta(roomRevenueCur, roomRevenuePrev) : null },
      occupancy: { value: occCur, delta: rooms && roomsPrev ? computeDelta(occCur, occPrev) : null },
      adr: { value: adrCur, delta: rooms && roomsPrev ? computeDelta(adrCur, adrPrev) : null },
      revpar: { value: revparCur, delta: rooms && roomsPrev ? computeDelta(revparCur, revparPrev) : null },
      alos,
      roomNightsSold: nightsSoldCur,
      availableRoomNights: availableCur,
      totalRooms: rooms?.roomStats.total || 0,
      revenue: rev,
      rooms,
      roomsPrev,
    }
  }, [revQ.isLoading, revQ.data, roomsQ.isLoading, roomsQ.data, roomsPrevQ.isLoading, roomsPrevQ.data])
}
