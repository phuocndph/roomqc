import { Button } from '@/components/ui/button'
import { PriorityBadge } from './PriorityBadge'
import { MapPin, Clock, User, ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ActiveRequestsSectionProps {
  requests: {
    urgent: any[]
    high: any[]
    medium: any[]
    low: any[]
  }
}

const priorityConfig = {
  urgent: { label: 'KHẨN CẤP', dot: 'bg-red-500', text: 'text-red-600' },
  high: { label: 'CAO', dot: 'bg-orange-500', text: 'text-orange-600' },
  medium: { label: 'TRUNG BÌNH', dot: 'bg-amber-500', text: 'text-amber-600' },
  low: { label: 'THẤP', dot: 'bg-green-500', text: 'text-green-600' },
}

export const ActiveRequestsSection = ({ requests }: ActiveRequestsSectionProps) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    urgent: true,
    high: false,
    medium: false,
    low: false,
  })

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const renderRequestItem = (request: any) => (
    <div key={request.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/maintenance/requests/${request.id}`}
            className="text-sm font-medium hover:underline truncate"
          >
            {request.request_code}
          </Link>
          <PriorityBadge priority={request.priority} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{request.title}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {request.room ? `Phòng ${request.room.room_number}` : request.location}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(request.reported_at), { addSuffix: true, locale: vi })}
          </span>
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {request.reporter?.full_name || 'N/A'}
          </span>
        </div>
      </div>
      <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
        <Link to={`/maintenance/requests/${request.id}`}>Xem</Link>
      </Button>
    </div>
  )

  const renderSection = (priority: keyof typeof priorityConfig, items: any[]) => {
    if (items.length === 0) return null
    const config = priorityConfig[priority]

    return (
      <Collapsible
        open={openSections[priority]}
        onOpenChange={() => toggleSection(priority)}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 hover:bg-muted/50 border-b">
          <div className="flex items-center gap-2">
            {openSections[priority] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className={cn("w-2 h-2 rounded-full", config.dot)} />
            <span className={cn("text-sm font-medium", config.text)}>{config.label}</span>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="divide-y">
          {items.slice(0, 5).map(renderRequestItem)}
          {items.length > 5 && (
            <Link 
              to={`/maintenance/requests?priority=${priority}`}
              className="block px-3 py-2 text-xs text-primary hover:underline text-center"
            >
              Xem tất cả {items.length} yêu cầu
            </Link>
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const hasAnyRequests = requests.urgent.length > 0 || requests.high.length > 0 || 
                          requests.medium.length > 0 || requests.low.length > 0

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium">Yêu cầu đang hoạt động</span>
      </div>
      
      {hasAnyRequests ? (
        <div>
          {renderSection('urgent', requests.urgent)}
          {renderSection('high', requests.high)}
          {renderSection('medium', requests.medium)}
          {renderSection('low', requests.low)}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-6">
          Không có yêu cầu đang hoạt động
        </p>
      )}
    </div>
  )
}
