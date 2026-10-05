import { Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHotelContext } from '@/contexts/HotelContext'

export function HotelFilterCard() {
  const { 
    selectedHotel, 
    setSelectedHotel, 
    availableHotels, 
    isAllHotelsMode, 
    setAllHotelsMode,
    canViewAllHotels 
  } = useHotelContext()

  const handleValueChange = (value: string) => {
    if (value === 'all' && canViewAllHotels) {
      setAllHotelsMode(true)
    } else {
      const hotel = availableHotels.find(h => h.id === value)
      if (hotel) {
        setSelectedHotel(hotel)
      }
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <Label htmlFor="hotel-filter" className="text-sm font-medium whitespace-nowrap">
            Khách sạn:
          </Label>
          <Select
            value={isAllHotelsMode ? 'all' : selectedHotel?.id || ''}
            onValueChange={handleValueChange}
          >
            <SelectTrigger id="hotel-filter" className="w-[280px]">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <SelectValue placeholder="Chọn khách sạn" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {/* Only show "All Hotels" option if user can view all hotels */}
              {canViewAllHotels && (
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium">Tất cả khách sạn</span>
                  </div>
                </SelectItem>
              )}
              {availableHotels.map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{hotel.name}</span>
                    {hotel.code && (
                      <span className="text-xs text-muted-foreground">({hotel.code})</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
