import { useState } from 'react'
import { Check, ChevronsUpDown, Wrench, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useMaintenanceRequests } from '@/hooks/useMaintenanceRequests'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface MaintenanceRequestSelectProps {
  value: string
  onChange: (value: string, request?: any) => void
  placeholder?: string
  disabled?: boolean
}

const priorityColors: Record<string, string> = {
  low: 'bg-blue-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  cancelled: 'bg-gray-500',
}

export function MaintenanceRequestSelect({ value, onChange, placeholder, disabled }: MaintenanceRequestSelectProps) {
  const { t } = useTranslation(['maintenance', 'common'])
  const [open, setOpen] = useState(false)
  
  // Fetch only pending and in_progress requests
  const { data: requests = [] } = useMaintenanceRequests({ 
    status: undefined // Get all statuses, filter in UI
  })
  
  // Filter for actionable requests
  const activeRequests = requests.filter(
    r => r.status === 'pending' || r.status === 'in_progress'
  )
  
  const selectedRequest = requests.find(request => request.id === value)
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedRequest ? (
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate">{selectedRequest.title}</span>
              <Badge variant="outline" className="ml-auto">
                <span className={cn("mr-1.5 h-2 w-2 rounded-full", priorityColors[selectedRequest.priority])} />
                {t(`maintenance:priority.${selectedRequest.priority}`)}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {placeholder || t('maintenance:select.placeholder')}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[450px] p-0">
        <Command>
          <CommandInput placeholder={t('maintenance:select.search')} />
          <CommandList>
            <CommandEmpty>{t('maintenance:select.empty')}</CommandEmpty>
            <CommandGroup heading={t('maintenance:select.pendingRequests')}>
              {activeRequests.map((request) => (
                <CommandItem
                  key={request.id}
                  value={request.title}
                  onSelect={() => {
                    onChange(request.id, request)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === request.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Wrench className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{request.title}</span>
                        <Badge variant="outline" className="flex-shrink-0">
                          <span className={cn("mr-1.5 h-2 w-2 rounded-full", statusColors[request.status])} />
                          {t(`maintenance:status.${request.status}`)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {request.room_number && (
                          <span>Phòng {request.room_number}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: vi })}
                        </span>
                        {request.priority === 'urgent' && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertTriangle className="h-3 w-3" />
                            Khẩn cấp
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "flex-shrink-0",
                        request.priority === 'urgent' && "border-red-500 text-red-500",
                        request.priority === 'high' && "border-orange-500 text-orange-500"
                      )}
                    >
                      <span className={cn("mr-1.5 h-2 w-2 rounded-full", priorityColors[request.priority])} />
                      {t(`maintenance:priority.${request.priority}`)}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
