import { useState } from 'react'
import { Plus, Search, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRoomTypes } from '@/hooks/useRoomTypes'
import { Skeleton } from '@/components/ui/skeleton'

export function RoomTypesList() {
  const [search, setSearch] = useState('')
  const { data: roomTypes, isLoading } = useRoomTypes()

  const filteredTypes = roomTypes?.filter(
    (type) =>
      type.name.toLowerCase().includes(search.toLowerCase()) ||
      type.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search room types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Room Type
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredTypes && filteredTypes.length > 0 ? (
        <div className="space-y-3">
          {filteredTypes.map((type) => (
            <Card key={type.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{type.icon || '🏨'}</div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{type.name}</h3>
                    <Badge variant="secondary">{type.code}</Badge>
                    <Badge variant={type.status === 'active' ? 'default' : 'secondary'}>
                      {type.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>👥 Max {type.max_guests} guests</span>
                    <span>🛏️ {type.beds_count} bed(s)</span>
                    {type.square_meters && <span>📐 {type.square_meters}m²</span>}
                    {type.base_price && (
                      <span>💰 {type.base_price.toLocaleString()} VND</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No room types found</p>
        </div>
      )}
    </div>
  )
}
