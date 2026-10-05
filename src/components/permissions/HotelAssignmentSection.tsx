import { useState, useEffect } from 'react'
import { UserWithRelations } from '@/types/database.types'
import { useHotels } from '@/hooks/useHotels'
import { useUserHotels, useAssignUserHotels, useUpdateUserHotelPermissions } from '@/hooks/useUserHotels'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Building2, ChevronDown, Save, Settings2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface HotelAssignmentSectionProps {
  user: UserWithRelations
  disabled?: boolean
}

export function HotelAssignmentSection({ user, disabled }: HotelAssignmentSectionProps) {
  const { data: hotels, isLoading: hotelsLoading } = useHotels()
  const { data: userHotels, isLoading: userHotelsLoading } = useUserHotels(user.id)
  const assignHotels = useAssignUserHotels()
  const updatePermissions = useUpdateUserHotelPermissions()
  
  const [selectedHotels, setSelectedHotels] = useState<string[]>([])
  const [expandedHotel, setExpandedHotel] = useState<string | null>(null)
  const [hotelPermissions, setHotelPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [hasChanges, setHasChanges] = useState(false)
  
  // Initialize selected hotels from user data
  useEffect(() => {
    if (userHotels) {
      const hotelIds = userHotels.map(uh => uh.hotel_id)
      setSelectedHotels(hotelIds)
      
      // Initialize permissions
      const perms: Record<string, Record<string, boolean>> = {}
      userHotels.forEach(uh => {
        perms[uh.hotel_id] = {
          can_create_managers: uh.can_create_managers,
          can_create_staff: uh.can_create_staff,
          can_view_reports: uh.can_view_reports,
          can_export_data: uh.can_export_data,
          can_approve_requests: uh.can_approve_requests,
        }
      })
      setHotelPermissions(perms)
    }
  }, [userHotels])
  
  const toggleHotel = (hotelId: string) => {
    setSelectedHotels(prev => {
      if (prev.includes(hotelId)) {
        return prev.filter(id => id !== hotelId)
      }
      return [...prev, hotelId]
    })
    setHasChanges(true)
  }
  
  const togglePermission = (hotelId: string, permission: string) => {
    setHotelPermissions(prev => ({
      ...prev,
      [hotelId]: {
        ...prev[hotelId],
        [permission]: !prev[hotelId]?.[permission],
      }
    }))
    setHasChanges(true)
  }
  
  const handleSave = async () => {
    // First save hotel assignments
    await assignHotels.mutateAsync({
      userId: user.id,
      hotelIds: selectedHotels,
    })
    
    // Then update permissions for each hotel
    for (const hotelId of selectedHotels) {
      if (hotelPermissions[hotelId]) {
        await updatePermissions.mutateAsync({
          userId: user.id,
          hotelId,
          permissions: hotelPermissions[hotelId],
        })
      }
    }
    
    setHasChanges(false)
  }
  
  const isLoading = hotelsLoading || userHotelsLoading
  const isSaving = assignHotels.isPending || updatePermissions.isPending
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Phân quyền Khách sạn
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    )
  }
  
  const permissionLabels: Record<string, string> = {
    can_view_reports: 'Xem báo cáo',
    can_export_data: 'Xuất dữ liệu',
    can_approve_requests: 'Duyệt yêu cầu',
    can_create_staff: 'Tạo nhân viên',
    can_create_managers: 'Tạo quản lý',
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Phân quyền Khách sạn
        </CardTitle>
        <CardDescription>
          Chọn khách sạn mà người dùng có thể truy cập và quản lý
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hotels?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Chưa có khách sạn nào
          </p>
        ) : (
          <div className="space-y-2">
            {hotels?.map((hotel) => {
              const isSelected = selectedHotels.includes(hotel.id)
              const isExpanded = expandedHotel === hotel.id
              
              return (
                <Collapsible
                  key={hotel.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedHotel(isExpanded ? null : hotel.id)}
                >
                  <div 
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border transition-colors
                      ${isSelected ? 'bg-primary/5 border-primary/30' : 'bg-background border-border'}
                      ${disabled ? 'opacity-50' : ''}
                    `}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleHotel(hotel.id)}
                      disabled={disabled}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{hotel.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {hotel.code}
                        </Badge>
                        {hotel.status !== 'active' && (
                          <Badge variant="secondary" className="text-xs">
                            {hotel.status}
                          </Badge>
                        )}
                      </div>
                      {hotel.city && (
                        <p className="text-xs text-muted-foreground">{hotel.city}</p>
                      )}
                    </div>
                    
                    {isSelected && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={disabled}>
                          <Settings2 className="h-4 w-4 mr-1" />
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                  
                  <CollapsibleContent className="mt-2 ml-8 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-sm font-medium mb-3">Quyền chi tiết tại khách sạn này:</p>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(permissionLabels).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between">
                          <Label htmlFor={`${hotel.id}-${key}`} className="text-sm">
                            {label}
                          </Label>
                          <Switch
                            id={`${hotel.id}-${key}`}
                            checked={hotelPermissions[hotel.id]?.[key] ?? false}
                            onCheckedChange={() => togglePermission(hotel.id, key)}
                            disabled={disabled}
                          />
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
        
        {/* Summary */}
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Đã chọn: <span className="font-medium text-foreground">{selectedHotels.length}</span> khách sạn
          </p>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || disabled}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
