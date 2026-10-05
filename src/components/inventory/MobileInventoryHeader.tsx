import { useState } from 'react'
import { Search, Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MobileHotelSwitcher } from '@/components/layout/MobileHotelSwitcher'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { motion, AnimatePresence } from 'framer-motion'

interface MobileInventoryHeaderProps {
  onSearch?: (query: string) => void
}

export function MobileInventoryHeader({ onSearch }: MobileInventoryHeaderProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: dashboardData } = useInventoryDashboard()
  
  const alertCount = (dashboardData?.low_stock_count || 0) + (dashboardData?.reorder_needed_count || 0)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    onSearch?.(value)
  }

  const handleCloseSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
    onSearch?.('')
  }

  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b">
      <AnimatePresence mode="wait">
        {showSearch ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm kiếm kho hàng..."
                className="pl-9 h-10 bg-muted/50 border-0"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseSearch}
              className="shrink-0"
             aria-label="Đóng">
              <X className="h-5 w-5" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between p-3"
          >
            <div className="flex items-center gap-3">
              <MobileHotelSwitcher />
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSearch(true)}
                className="relative"
              >
                <Search className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="relative"
              >
                <Bell className="h-5 w-5" />
                {alertCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] rounded-full"
                  >
                    {alertCount > 99 ? '99+' : alertCount}
                  </Badge>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
