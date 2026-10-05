import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency } from '@/lib/utils'

interface Props {
  roomType: string
  floor: number | string
  areaSqm?: number | null
  bedType?: string | null
  viewType?: string | null
  basePrice?: number | null
  amenities?: string[] | null
  notes?: string | null
}

export function RoomMetaSubtitle({
  roomType, floor, areaSqm, bedType, viewType, basePrice, amenities, notes,
}: Props) {
  const parts: string[] = []
  parts.push(roomType)
  parts.push(`Tầng ${floor}`)
  if (areaSqm) parts.push(`${areaSqm}m²`)
  if (bedType) parts.push(`Giường ${bedType}`)
  if (viewType) parts.push(`View ${viewType}`)
  if (basePrice) parts.push(formatCurrency(basePrice) + '/đêm')

  const hasExtra = (amenities && amenities.length > 0) || !!notes

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
      <span className="truncate">{parts.join(' • ')}</span>
      {hasExtra && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors normal-case"
              aria-label="Chi tiết phòng"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-xs normal-case" align="start">
            {amenities && amenities.length > 0 && (
              <div>
                <p className="font-medium mb-1.5">Tiện nghi</p>
                <div className="flex flex-wrap gap-1">
                  {amenities.map((a, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-[11px]">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {notes && (
              <div className={amenities && amenities.length > 0 ? 'mt-3 pt-3 border-t' : ''}>
                <p className="font-medium mb-1">Ghi chú</p>
                <p className="text-muted-foreground">{notes}</p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
