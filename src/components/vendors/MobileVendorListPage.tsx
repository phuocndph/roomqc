import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { Store, Star, Phone, MapPin, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'external' | 'in_house'

const TYPE_CONFIG = {
  external: { label: 'Bên ngoài', color: 'bg-blue-500' },
  in_house: { label: 'Nội bộ', color: 'bg-green-500' },
}

export const MobileVendorListPage = () => {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  
  const { data: vendors = [], isLoading, refetch } = useLaundryVendors()

  const filteredVendors = vendors.filter((vendor: any) => {
    const matchesFilter = filter === 'all' || vendor.type === filter
    const matchesSearch = !search || 
      vendor.name?.toLowerCase().includes(search.toLowerCase()) ||
      vendor.address?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handleRefresh = async () => {
    await refetch()
  }

  // Stats
  const stats = {
    total: vendors.length,
    external: vendors.filter((v: any) => v.type === 'external').length,
    inHouse: vendors.filter((v: any) => v.type === 'in_house').length,
    avgRating: vendors.reduce((sum: number, v: any) => sum + (v.rating || 0), 0) / vendors.length || 0,
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Đơn vị giặt là"
        showBack
      />

      {/* Add Button */}
      <div className="p-4">
        <Button
          className="w-full"
          onClick={() => navigate('/laundry/vendors/new')}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm đơn vị mới
        </Button>
      </div>

      {/* Stats Cards - Horizontal Scroll */}
      <div className="px-4 pb-3 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          <Card className="min-w-[160px]">
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Tổng đơn vị</div>
            </CardContent>
          </Card>
          <Card className="min-w-[160px]">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.external}</div>
              <div className="text-sm text-muted-foreground">Bên ngoài</div>
            </CardContent>
          </Card>
          <Card className="min-w-[160px]">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.inHouse}</div>
              <div className="text-sm text-muted-foreground">Nội bộ</div>
            </CardContent>
          </Card>
          <Card className="min-w-[160px]">
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <div className="text-2xl font-bold">{stats.avgRating.toFixed(1)}</div>
              </div>
              <div className="text-sm text-muted-foreground">Đánh giá TB</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm tên, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="sticky top-14 bg-background border-b z-10 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {(['all', 'external', 'in_house'] as FilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                filter === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              )}
            >
              {type === 'all' ? 'Tất cả' : TYPE_CONFIG[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* Vendors List */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-28 bg-muted rounded" />
                </CardContent>
              </Card>
            ))
          ) : filteredVendors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Store className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {search ? 'Không tìm thấy đơn vị' : 'Chưa có đơn vị nào'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredVendors.map((vendor: any) => {
              const typeConfig = TYPE_CONFIG[vendor.type as keyof typeof TYPE_CONFIG]

              return (
                <Card
                  key={vendor.id}
                  className="cursor-pointer hover:shadow-md transition-shadow active:scale-98"
                  onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Store className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-lg truncate">
                            {vendor.name}
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            <span className="font-medium">{vendor.rating || 0}</span>
                            <span className="text-muted-foreground">
                              ({vendor.total_orders || 0} đơn)
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className={cn('ml-2', typeConfig?.color, 'bg-opacity-20')}>
                        {typeConfig?.label || vendor.type}
                      </Badge>
                    </div>

                    {vendor.contact_person && (
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{vendor.contact_person}</span>
                        {vendor.phone && (
                          <span className="font-medium">{vendor.phone}</span>
                        )}
                      </div>
                    )}

                    {vendor.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground line-clamp-2">
                          {vendor.address}
                        </span>
                      </div>
                    )}

                    {vendor.status === 'inactive' && (
                      <div className="mt-3 pt-3 border-t">
                        <Badge variant="outline" className="bg-yellow-500/10">
                          Tạm ngưng
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
