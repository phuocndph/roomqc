import { useState } from 'react'
import { Plus, Search, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useItemUnits } from '@/hooks/useItemUnits'
import { Skeleton } from '@/components/ui/skeleton'

export function ItemUnitsList() {
  const [search, setSearch] = useState('')
  const { data: units, isLoading } = useItemUnits()

  const filteredUnits = units?.filter(
    (unit) =>
      unit.name.toLowerCase().includes(search.toLowerCase()) ||
      unit.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm đơn vị tính..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Thêm đơn vị
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredUnits && filteredUnits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredUnits.map((unit) => (
            <Card key={unit.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{unit.name}</h3>
                    <Badge variant="secondary">{unit.code}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{unit.type}</Badge>
                    {unit.symbol && <span>Ký hiệu: {unit.symbol}</span>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Chưa có đơn vị tính nào</p>
        </div>
      )}
    </div>
  )
}
