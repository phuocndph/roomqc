import type { FloorPlanRoom } from '@/hooks/useFloorPlanLive'
import { getRoomStatusLabel, isRoomDirty, isRoomOccupied, LEGACY_TO_V2, ROOM_STATUS_META_V2 } from '@/lib/roomStatus'

export type OperationalStatus = 'available' | 'occupied' | 'dirty' | 'blocked'

// Only known, clean vacant states are ready to receive a guest.
export function isRoomReady(room: FloorPlanRoom): boolean {
  return !room.current_booking && ['vacant', 'vacant_clean', 'vacant_inspected'].includes(room.status)
}

export function hasRoomGuest(room: FloorPlanRoom): boolean {
  return !!room.current_booking || isRoomOccupied(room.status) || room.status === 'skipper'
}

export function needsRoomCleaning(room: FloorPlanRoom): boolean {
  return isRoomDirty(room.status)
}

export function getOperationalStatus(room: FloorPlanRoom): OperationalStatus {
  if (['maintenance', 'out_of_order', 'out_of_service', 'skipper'].includes(room.status)) return 'blocked'
  if (needsRoomCleaning(room)) return 'dirty'
  if (hasRoomGuest(room)) return 'occupied'
  return isRoomReady(room) ? 'available' : 'blocked'
}

export function matchesOperationalFilter(room: FloorPlanRoom, status: OperationalStatus | 'all'): boolean {
  if (status === 'all') return true
  // Cleaning and occupancy can overlap: an occupied dirty room belongs to both filters.
  if (status === 'occupied') return hasRoomGuest(room)
  if (status === 'dirty') return needsRoomCleaning(room)
  return getOperationalStatus(room) === status
}

export function getOperationalLabel(room: FloorPlanRoom): string {
  if (!(room.status in ROOM_STATUS_META_V2) && !(room.status in LEGACY_TO_V2)) return 'Chưa rõ tình trạng'
  if (room.current_booking && ['vacant', 'vacant_clean', 'vacant_inspected'].includes(room.status)) return 'Đang có khách'
  if (room.current_booking && ['vacant_dirty', 'cleaning', 'check_out'].includes(room.status)) return 'Đang ở – cần dọn'
  return getRoomStatusLabel(room.status)
}
