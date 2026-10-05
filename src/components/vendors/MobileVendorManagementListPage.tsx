import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVendors } from '@/hooks/useVendors'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { Building2, Star, Package, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type VendorType = 'all' | 'laundry' | 'supplies' | 'maintenance'

const TYPE_CONFIG = {
  laundry: { label: 'Giặt là', color: 'bg-blue-500' },
  supplies: { label: 'Vật tư', color: 'bg-green-500' },
  maintenance: { label: 'Bảo trì', color: 'bg-orange-500' },
}

export const MobileVendorManagementListPage = () => {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<VendorType>('all')
  const [search, setSearch] = useState('')
  
  const { data: vendorsData, isLoading, refetch } = useVendors()
  const vendors = Array.isArray(vendorsData) ? vendorsData : []

  const filteredVendors = vendors
    .filter((v: any) => filter === 'all' || v.type === filter)
    .filter((v: any) => 
      search === '' || 
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.code?.toLowerCase().includes(search.toLowerCase())
    )

  const handleRefresh = async () => {
    await refetch()
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Nhà cung cấp"
        showBack
      />

      {/* Add Button */}
      <div className="p-4 pb-0">
        <Button
          className="w-full"
          onClick={() => navigate('/vendors/new')}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm nhà cung cấp
        </Button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm nhà cung cấp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="sticky top-14 bg-background border-b z-10 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {(['all', 'laundry', 'supplies', 'maintenance'] as VendorType[]).map((type) => (
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
                  <div className="h-24 bg-muted rounded" />
                </CardContent>
              </Card>
            ))
          ) : filteredVendors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {search ? 'Không tìm thấy nhà cung cấp' : 'Chưa có nhà cung cấp nào'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredVendors.map((vendor: any) => (
              <Card
                key={vendor.id}
                className="cursor-pointer active:scale-98 transition-transform"
                onClick={() => navigate(`/vendors/${vendor.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{vendor.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vendor.code}
                      </p>
                    </div>
                    {vendor.type && TYPE_CONFIG[vendor.type as keyof typeof TYPE_CONFIG] && (
                      <Badge className={cn('text-xs', TYPE_CONFIG[vendor.type as keyof typeof TYPE_CONFIG].color)}>
                        {TYPE_CONFIG[vendor.type as keyof typeof TYPE_CONFIG].label}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Đánh giá</p>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        <span className="font-medium">{vendor.rating || 0}/5</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Đơn hàng</p>
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        <span className="font-medium">{vendor.total_orders || 0}</span>
                      </div>
                    </div>
                  </div>

                  {vendor.contact_person && (
                    <div className="mt-3 pt-3 border-t text-sm">
                      <p className="text-muted-foreground">Liên hệ: {vendor.contact_person}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
