import type { ComponentProps } from 'react'
import { PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { RoomItemsList } from '@/components/rooms/RoomItemsList'
import type { RoomItemWithDetails } from '@/types/rooms.types'

interface Props {
  roomId: string
  items: RoomItemWithDetails[]
  onRequestSupplement: () => void
}

export function PanelItems({ roomId, items, onRequestSupplement }: Props) {
  return (
    <section className="space-y-4 py-5" aria-labelledby="room-items-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="room-items-title" className="text-base font-semibold">Đồ dùng trong phòng</h2>
        <PermissionGate module="rooms" action="update">
          <Button variant="outline" size="sm" onClick={onRequestSupplement}>
            <PackagePlus className="mr-2 h-4 w-4" />Bổ sung đồ
          </Button>
        </PermissionGate>
      </div>
      <RoomItemsList
        items={items as ComponentProps<typeof RoomItemsList>['items']}
        roomId={roomId}
        onRequestSupplement={onRequestSupplement}
      />
    </section>
  )
}
