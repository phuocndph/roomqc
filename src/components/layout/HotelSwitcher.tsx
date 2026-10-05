import { useState, useEffect } from 'react'
import { useHotelContext } from '@/contexts/HotelContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Check, ChevronsUpDown, Building2, BarChart3, Settings2, RefreshCw, MapPin, Users, Bed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

export function HotelSwitcher() {
  const { selectedHotel, setSelectedHotel, availableHotels, isAllHotelsMode, setAllHotelsMode, isLoading } = useHotelContext()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['hotels'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Dữ liệu đã được làm mới')
    } catch (error) {
      toast.error('Không thể làm mới dữ liệu')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleHotelSelect = (hotel: typeof availableHotels[0]) => {
    setSelectedHotel(hotel)
    setOpen(false)
    toast.success(`Đã chuyển sang ${hotel.name}`)
  }

  const handleAllHotelsMode = () => {
    setAllHotelsMode(true)
    setOpen(false)
    toast.success('Đang xem tất cả khách sạn')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-green-500/10 text-green-600 border-green-500/20">Hoạt động</Badge>
      case 'inactive':
        return <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-red-500/10 text-red-600 border-red-500/20">Tạm ngừng</Badge>
      case 'maintenance':
        return <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Bảo trì</Badge>
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Building2 className="h-4 w-4 animate-pulse text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Đang tải...</span>
      </div>
    )
  }

  if (availableHotels.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/settings/hotels')}
        className="gap-2"
      >
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">Thêm khách sạn</span>
        <span className="sm:hidden">Thêm KS</span>
      </Button>
    )
  }

  // If only one hotel, show simple display with status
  if (availableHotels.length === 1 && !isAllHotelsMode) {
    const hotel = availableHotels[0]
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-card">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{hotel.name}</span>
        {getStatusBadge(hotel.status)}
      </div>
    )
  }

  const filteredHotels = availableHotels.filter(
    (h) =>
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.code.toLowerCase().includes(search.toLowerCase()) ||
      h.city?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full lg:w-[320px] justify-between hover:bg-accent"
          data-hotel-switcher
        >
          {isAllHotelsMode ? (
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="font-medium">Tất cả khách sạn</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{availableHotels.length}</Badge>
            </div>
          ) : selectedHotel ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium truncate">{selectedHotel.name}</span>
              {getStatusBadge(selectedHotel.status)}
            </div>
          ) : (
            <span className="text-muted-foreground">Chọn khách sạn...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 bg-popover" align="start">
        <Command>
          <div className="flex items-center border-b">
            <CommandInput
              placeholder="Tìm kiếm khách sạn..."
              value={search}
              onValueChange={setSearch}
              className="flex-1 h-10"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
             aria-label="Làm mới">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
          <CommandEmpty>Không tìm thấy khách sạn.</CommandEmpty>
          <CommandGroup className="max-h-[400px] overflow-y-auto p-2">
            {filteredHotels.map((hotel) => (
              <CommandItem
                key={hotel.id}
                value={hotel.id}
                onSelect={() => handleHotelSelect(hotel)}
                className="cursor-pointer rounded-lg p-3 mb-1"
              >
                <div className="flex items-start gap-3 w-full">
                  <Check
                    className={cn(
                      'h-4 w-4 mt-1 shrink-0',
                      selectedHotel?.id === hotel.id && !isAllHotelsMode ? 'opacity-100 text-primary' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{hotel.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{hotel.code}</Badge>
                      {getStatusBadge(hotel.status)}
                    </div>
                    
                    {hotel.city && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{hotel.city}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Bed className="h-3 w-3" />
                        <span>{hotel.total_rooms || 0} phòng</span>
                      </div>
                      {hotel._count?.users ? (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{hotel._count.users} nhân viên</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
          
          {availableHotels.length > 1 && (
            <>
              <CommandSeparator />
              <CommandGroup className="p-2">
                <CommandItem
                  value="all-hotels"
                  onSelect={handleAllHotelsMode}
                  className="cursor-pointer rounded-lg p-3"
                >
                  <Check
                    className={cn(
                      'mr-3 h-4 w-4',
                      isAllHotelsMode ? 'opacity-100 text-primary' : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium">Xem tất cả khách sạn</span>
                      <span className="text-xs text-muted-foreground">Dữ liệu tổng hợp</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{availableHotels.length} KS</Badge>
                </CommandItem>
              </CommandGroup>
            </>
          )}
          
          <CommandSeparator />
          <CommandGroup className="p-2">
            <CommandItem
              value="manage-hotels"
              onSelect={() => {
                navigate('/settings/hotels')
                setOpen(false)
              }}
              className="cursor-pointer rounded-lg p-3"
            >
              <Settings2 className="mr-3 h-4 w-4 text-muted-foreground" />
              <span>Quản lý khách sạn</span>
            </CommandItem>
          </CommandGroup>
        </Command>
        
        {/* Keyboard shortcut hint */}
        <div className="border-t bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <div>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
            <span className="ml-1">để mở nhanh</span>
          </div>
          <span className="text-[10px]">{filteredHotels.length} / {availableHotels.length} khách sạn</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
