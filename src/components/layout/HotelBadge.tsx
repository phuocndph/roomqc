import { Badge } from '@/components/ui/badge'
import { useHotelContext } from '@/contexts/HotelContext'
import { Building2, BarChart3 } from 'lucide-react'

export const HotelBadge = () => {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  if (isAllHotelsMode) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <BarChart3 className="h-3 w-3" />
        <span>Viewing All Hotels</span>
      </Badge>
    )
  }

  if (selectedHotel) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Building2 className="h-3 w-3" />
        <span>{selectedHotel.name}</span>
      </Badge>
    )
  }

  return null
}
