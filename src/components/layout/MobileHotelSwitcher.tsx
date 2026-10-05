import { useState } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Building2, BarChart3, Check, MapPin, Bed, Search, Settings2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface MobileHotelSwitcherProps {
  /** Custom trigger; if not provided, renders default chip with selected hotel name */
  children?: React.ReactNode
  className?: string
}

export function MobileHotelSwitcher({ children, className }: MobileHotelSwitcherProps) {
  const { selectedHotel, setSelectedHotel, availableHotels, isAllHotelsMode, setAllHotelsMode, isLoading } = useHotelContext()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const filtered = availableHotels.filter((h) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      h.name.toLowerCase().includes(q) ||
      h.code.toLowerCase().includes(q) ||
      h.city?.toLowerCase().includes(q)
    )
  })

  const statusLabel = (s: string) => {
    if (s === 'active') return <span className="text-[11px] text-green-600">Hoạt động</span>
    if (s === 'inactive') return <span className="text-[11px] text-red-600">Tạm ngừng</span>
    if (s === 'maintenance') return <span className="text-[11px] text-amber-600">Bảo trì</span>
    return null
  }

  const handleSelect = (hotel: typeof availableHotels[0]) => {
    setSelectedHotel(hotel)
    setOpen(false)
    toast.success(`Đã chuyển sang ${hotel.name}`)
  }

  const handleAll = () => {
    setAllHotelsMode(true)
    setOpen(false)
    toast.success('Đang xem tất cả khách sạn')
  }

  if (isLoading || availableHotels.length === 0) return null

  const trigger = children ?? (
    <button aria-label="Mở rộng"
      type="button"
      className={cn(
        'flex items-center gap-1 min-w-0 max-w-full text-left',
        className
      )}
    >
      <span className="truncate font-semibold text-sm">
        {isAllHotelsMode ? 'Tất cả khách sạn' : selectedHotel?.name ?? 'Chọn khách sạn'}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-w-0 max-w-full items-center text-left cursor-pointer active:opacity-70 bg-transparent border-0 p-0"
        aria-label="Chọn khách sạn"
      >
        {trigger}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="p-0 h-[85vh] rounded-t-2xl flex flex-col"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle className="text-base">Chọn khách sạn</SheetTitle>
          </SheetHeader>

          <div className="px-4 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, mã, thành phố..."
                className="pl-8 h-10"
                autoFocus={false}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {availableHotels.length > 1 && (
              <button
                type="button"
                onClick={handleAll}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-lg active:bg-accent border mb-2',
                  isAllHotelsMode && 'border-primary bg-primary/5'
                )}
              >
                <BarChart3 className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-sm">Tất cả khách sạn</p>
                  <p className="text-xs text-muted-foreground">Dữ liệu tổng hợp · {availableHotels.length} KS</p>
                </div>
                {isAllHotelsMode && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Không tìm thấy khách sạn</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((hotel) => {
                  const active = !isAllHotelsMode && selectedHotel?.id === hotel.id
                  return (
                    <li key={hotel.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(hotel)}
                        className={cn(
                          'w-full flex items-start gap-3 px-3 py-3 rounded-lg active:bg-accent border',
                          active ? 'border-primary bg-primary/5' : 'border-transparent'
                        )}
                      >
                        <Building2 className={cn('h-5 w-5 shrink-0 mt-0.5', active ? 'text-primary' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{hotel.name}</p>
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{hotel.code}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {hotel.city && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{hotel.city}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1 shrink-0">
                              <Bed className="h-3 w-3" />
                              {hotel.total_rooms || 0}
                            </span>
                            {statusLabel(hotel.status)}
                          </div>
                        </div>
                        {active && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t p-3 safe-area-bottom">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                setOpen(false)
                navigate('/settings/hotels')
              }}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Quản lý khách sạn
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
