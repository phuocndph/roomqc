import { useState } from 'react'
import { Menu, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useHotelContext } from '@/contexts/HotelContext'
import { MobileSidebar } from './MobileSidebar'
import { MobileHotelSwitcher } from './MobileHotelSwitcher'
import { NotificationBell } from '@/components/notifications'
import { cn } from '@/lib/utils'
import logoRoomQc from '@/assets/logo-roomqc.png'

interface MobileHeaderProps {
  showHotelSelector?: boolean
  showSearch?: boolean
  className?: string
}

export const MobileHeader = ({
  showHotelSelector = false,
  showSearch = false,
  className
}: MobileHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const { selectedHotel, isAllHotelsMode, availableHotels } = useHotelContext()

  const canSwitch = showHotelSelector && availableHotels.length > 0

  const headerLabel = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1 min-w-0">
        <p className="font-bold text-base truncate">
          {isAllHotelsMode
            ? 'Tất cả khách sạn'
            : selectedHotel?.name ?? 'RoomQc'}
        </p>
        {canSwitch && (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
      {!isAllHotelsMode && selectedHotel && (selectedHotel.city || selectedHotel.country) && (
        <p className="text-[11px] text-muted-foreground truncate">
          {selectedHotel.city || selectedHotel.country}
        </p>
      )}
    </div>
  )

  return (
    <header className={cn(
      "sticky top-0 z-40 bg-background border-b shadow-sm safe-area-top will-change-transform",
      className
    )}>
      <div className="flex items-center justify-between gap-2 px-3 h-14 max-w-full">
        {/* Left: Logo + Hotel Name (tap to switch) */}
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <img src={logoRoomQc} alt="RoomQc" className="h-7 w-7 rounded-md object-cover flex-shrink-0" />
          {canSwitch ? (
            <MobileHotelSwitcher>
              <span className="min-w-0 flex-1 text-left">
                {headerLabel}
              </span>
            </MobileHotelSwitcher>
          ) : (
            headerLabel
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {showSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Button>
          )}

          <NotificationBell className="h-9 w-9" />

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[280px] p-0"
            >
              <MobileSidebar onClose={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
