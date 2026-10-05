import { RoomStatusBadge } from '@/components/rooms/RoomStatusBadge'
import { RoomMetaSubtitle } from './RoomMetaSubtitle'
import type { RoomStatus } from '@/types/rooms.types'

/**
 * Khối tiêu đề dùng chung cho cả 3 trang chi tiết phòng
 * (RoomDetailPage desktop / MobileRoomDetailPage / StaffRoomDetailPage).
 *
 * Cấu trúc cố định:
 *   [Phòng {number}]  [StatusBadge]
 *   {room type} · Tầng {floor} · {areaSqm} · {bed} · {view} · {price}
 *
 * Mọi metadata tuỳ chọn (amenities, notes) đẩy vào popover "i" cuối dòng meta.
 * Title size cấu hình được (`size="md|lg"`) — desktop dùng `lg`, mobile/staff dùng `md`.
 */
interface Props {
  room: {
    room_number: string
    room_type: string
    floor: number | string
    status: string
    area_sqm?: number | null
    bed_type?: string | null
    view_type?: string | null
    base_price?: number | null
    amenities?: string[] | null
    notes?: string | null
  }
  size?: 'md' | 'lg'
}

export function RoomDetailTitleBlock({ room, size = 'md' }: Props) {
  const titleCls = size === 'lg' ? 'text-xl font-bold' : 'text-lg font-bold'
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <h1 className={titleCls}>Phòng {room.room_number}</h1>
        <RoomStatusBadge status={room.status as RoomStatus} />
      </div>
      <RoomMetaSubtitle
        roomType={room.room_type}
        floor={room.floor}
        areaSqm={room.area_sqm}
        bedType={room.bed_type}
        viewType={room.view_type}
        basePrice={room.base_price}
        amenities={room.amenities}
        notes={room.notes}
      />
    </div>
  )
}
