import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Star, Phone, MapPin, ChevronRight, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { navigateBack } from '@/lib/navigation'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { formatCurrency } from '@/lib/utils'

export function MobileVendorListPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'external' | 'in_house'>('all')
  const [search, setSearch] = useState('')
  
  const { data: vendors, isLoading, refetch } = useLaundryVendors()
  
  const handleRefresh = async () => {
    await refetch()
  }
  
  const filteredVendors = vendors?.filter(v => {
    const searchMatch = !search || 
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.address?.toLowerCase().includes(search.toLowerCase())
    const typeMatch = filter === 'all' || v.type === filter
    return searchMatch && typeMatch
  })
  
  const stats = {
    total: vendors?.length || 0,
    external: vendors?.filter(v => v.type === 'external').length || 0,
    inHouse: vendors?.filter(v => v.type === 'in_house').length || 0,
    avgRating: vendors?.length 
      ? (vendors.reduce((sum, v) => sum + (v.rating || 0), 0) / vendors.length).toFixed(1)
      : '0.0'
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader 
        title="Đơn vị giặt là" 
        onBack={() => navigateBack(navigate, '/laundry')}
      />
      
      <div className="px-4 py-4 space-y-4">
        {/* Add Button */}
        <Button 
          className="w-full"
          onClick={() => navigate('/laundry/vendors/new')}
        >
          <Plus className="mr-2 h-4 w-4" />
          Thêm đơn vị giặt
        </Button>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Tổng</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-blue-600">{stats.external}</p>
            <p className="text-xs text-muted-foreground">Ngoài</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-green-600">{stats.inHouse}</p>
            <p className="text-xs text-muted-foreground">Nội bộ</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-amber-600">{stats.avgRating}</p>
            <p className="text-xs text-muted-foreground">TB ⭐</p>
          </Card>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm tên, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'external', label: 'Ngoài' },
            { key: 'in_house', label: 'Nội bộ' },
          ].map((item) => (
            <Button
              key={item.key}
              variant={filter === item.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(item.key as any)}
              className="whitespace-nowrap"
            >
              {item.label}
            </Button>
          ))}
        </div>
        
        {/* Vendor List */}
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))
            ) : filteredVendors && filteredVendors.length > 0 ? (
              filteredVendors.map((vendor) => {
                const contractInfo = vendor.contract_info as any
                const logo = contractInfo?.logo_url
                
                return (
                  <Card 
                    key={vendor.id}
                    className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={logo} alt={vendor.name} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {vendor.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold truncate">{vendor.name}</h3>
                            <p className="text-xs text-muted-foreground">{vendor.code}</p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={vendor.type === 'external' ? 'default' : 'secondary'} className="text-xs">
                            {vendor.type === 'external' ? 'Ngoài' : 'Nội bộ'}
                          </Badge>
                          <Badge variant={vendor.status === 'active' ? 'outline' : 'secondary'} className="text-xs">
                            {vendor.status === 'active' ? 'Hoạt động' : 'Tạm ngưng'}
                          </Badge>
                          {vendor.rating && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <Star className="h-3 w-3 fill-current" />
                              {vendor.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {vendor.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {vendor.phone}
                            </span>
                          )}
                          {vendor.address && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{vendor.address}</span>
                            </span>
                          )}
                        </div>
                        
                        {(vendor.total_orders || vendor.total_value) && (
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="text-muted-foreground">
                              {vendor.total_orders || 0} đơn
                            </span>
                            <span className="text-primary font-medium">
                              {formatCurrency(vendor.total_value || 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">Chưa có đơn vị giặt</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Thêm đơn vị giặt để bắt đầu quản lý
                </p>
                <Button onClick={() => navigate('/laundry/vendors/new')} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm đơn vị
                </Button>
              </div>
            )}
          </div>
        </PullToRefresh>
      </div>
    </div>
  )
}
