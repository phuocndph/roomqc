import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHotels } from '@/hooks/useHotels'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { navigateBack } from '@/lib/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { Plus, Search, Building2, MapPin, Phone, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const STATUS_CONFIG = {
  active: { label: 'Hoạt động', color: 'bg-green-100 text-green-800' },
  inactive: { label: 'Ngừng HĐ', color: 'bg-gray-100 text-gray-800' },
  maintenance: { label: 'Bảo trì', color: 'bg-yellow-100 text-yellow-800' },
}

export const MobileHotelManagementPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  
  const { data: hotels = [], isLoading } = useHotels()

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['hotels'] })
    toast.success('Đã cập nhật!')
  }

  const filteredHotels = hotels.filter(hotel =>
    hotel.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hotel.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hotel.city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Quản lý khách sạn"
        onBack={() => navigateBack(navigate, '/settings')}
        action={{
          icon: Plus,
          // There is no standalone create route; use the hotel management page.
          onClick: () => navigate('/hotels'),
          label: 'Thêm khách sạn'
        }}
      />

      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm khách sạn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{hotels.length}</p>
                <p className="text-xs text-muted-foreground">Tổng số</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">
                  {hotels.filter(h => h.status === 'active').length}
                </p>
                <p className="text-xs text-muted-foreground">Hoạt động</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">
                  {hotels.reduce((sum, h) => sum + (h.total_rooms || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Phòng</p>
              </CardContent>
            </Card>
          </div>

          {/* Hotels List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredHotels.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'Không tìm thấy khách sạn' : 'Chưa có khách sạn'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredHotels.map((hotel) => {
                const statusConfig = STATUS_CONFIG[hotel.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active

                return (
                  <Card 
                    key={hotel.id}
                    className="active:scale-[0.98] transition-transform cursor-pointer"
                    onClick={() => navigate(`/hotels/performance?hotelId=${encodeURIComponent(hotel.id)}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {hotel.logo_url ? (
                          <img
                            src={hotel.logo_url}
                            alt={hotel.name}
                            className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm truncate">{hotel.name}</span>
                            <Badge className={statusConfig.color} variant="secondary">
                              {statusConfig.label}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">#{hotel.code}</span>
                            </div>
                            
                            {hotel.city && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{hotel.city}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {hotel.total_rooms && (
                                <span>🏠 {hotel.total_rooms} phòng</span>
                              )}
                              {hotel._count?.users && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {hotel._count.users}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
