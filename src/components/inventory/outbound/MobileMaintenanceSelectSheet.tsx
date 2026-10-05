import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Search, 
  Wrench, 
  AlertTriangle,
  Clock,
  MapPin,
  X
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMaintenanceRequests } from '@/hooks/useMaintenanceRequests'
import { cn } from '@/lib/utils'
import { triggerHaptic } from '@/lib/haptics'

interface SelectedRequest {
  id: string
  title: string
  room_number?: string
}

interface MobileMaintenanceSelectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRequest: SelectedRequest | null
  onSelect: (request: SelectedRequest | null) => void
}

export function MobileMaintenanceSelectSheet({
  open,
  onOpenChange,
  selectedRequest,
  onSelect
}: MobileMaintenanceSelectSheetProps) {
  const { t } = useTranslation(['inventory', 'maintenance', 'common'])
  const [searchQuery, setSearchQuery] = useState('')
  
  const { data: requests = [], isLoading } = useMaintenanceRequests({})
  
  // Filter only active requests (pending, in_progress)
  const activeRequests = requests.filter(r => 
    (r.status === 'pending' || r.status === 'in_progress' || r.status === 'waiting') &&
    (r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     r.room?.room_number?.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200'
      default: return 'bg-gray-100 text-gray-700'
    }
  }
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'waiting': return t('maintenance:status.waiting')
      case 'pending': return t('maintenance:status.pending')
      case 'in_progress': return t('maintenance:status.in_progress')
      default: return status
    }
  }
  
  const handleSelect = (request: any) => {
    triggerHaptic('light')
    onSelect({
      id: request.id,
      title: request.title,
      room_number: request.room?.room_number
    })
    onOpenChange(false)
  }
  
  const handleClear = () => {
    triggerHaptic('light')
    onSelect(null)
    onOpenChange(false)
  }
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {t('inventory:outbound.selectMaintenanceRequest')}
          </SheetTitle>
        </SheetHeader>
        
        {/* Selected Request Display */}
        {selectedRequest && (
          <Card className="mt-4 p-3 border-primary bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium text-sm">{selectedRequest.title}</p>
                  {selectedRequest.room_number && (
                    <p className="text-xs text-muted-foreground">
                      {t('rooms:room')} {selectedRequest.room_number}
                    </p>
                  )}
                </div>
              </div>
              <TouchButton 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </TouchButton>
            </div>
          </Card>
        )}
        
        {/* Info Text */}
        <p className="text-sm text-muted-foreground mt-3">
          {t('inventory:outbound.maintenanceDescription')}
        </p>
        
        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t('maintenance:searchPlaceholder')}
            className="pl-10 h-11"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Request List */}
        <ScrollArea className="flex-1 mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('common:loading')}
            </div>
          ) : activeRequests.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {t('maintenance:noActiveRequests')}
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {activeRequests.map((request: any) => {
                const isSelected = selectedRequest?.id === request.id
                
                return (
                  <Card
                    key={request.id}
                    className={cn(
                      "p-3 cursor-pointer transition-all",
                      isSelected && "ring-2 ring-primary bg-primary/5"
                    )}
                    onClick={() => handleSelect(request)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{request.title}</p>
                        {request.room?.room_number && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            <span>{t('rooms:room')} {request.room.room_number}</span>
                          </div>
                        )}
                      </div>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs shrink-0 ml-2", getPriorityColor(request.priority))}
                      >
                        {request.priority}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(new Date(request.created_at), 'dd/MM HH:mm', { locale: vi })}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    
                    {request.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {request.description}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </ScrollArea>
        
        {/* Footer */}
        <SheetFooter className="flex-row gap-2 mt-2 pt-4 border-t">
          <TouchButton 
            variant="outline" 
            className="flex-1"
            onClick={handleClear}
          >
            {t('common:skip')}
          </TouchButton>
          <TouchButton 
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            {t('common:done')}
          </TouchButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
