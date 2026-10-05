import { useNavigate } from 'react-router-dom'
import { Star, Package, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { SwipeableCard } from '@/components/mobile/TouchOptimized'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'
import { formatCurrency } from '@/lib/utils'

export function MobileLaundryVendorPerformance() {
  const navigate = useNavigate()
  const { data: vendors, isLoading } = useLaundryVendors()
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // Filter active vendors and sort by rating
  const topVendors = vendors
    ?.filter(v => v.status === 'active')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5) || []
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Top đơn vị giặt</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {topVendors.length} đơn vị
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {topVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa có đơn vị giặt nào
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {topVendors.map((vendor) => {
              const contractInfo = vendor.contract_info as any
              const logoUrl = contractInfo?.logo_url
              
              return (
                <SwipeableCard
                  key={vendor.id}
                  onSwipeLeft={() => navigate(`/laundry/vendors/${vendor.id}`)}
                >
                  <div 
                    className="flex items-center gap-3 p-4 bg-card border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
                  >
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarImage src={logoUrl || undefined} />
                      <AvatarFallback className="text-sm">
                        {vendor.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">
                          {vendor.name}
                        </p>
                        <Badge 
                          variant="outline" 
                          className="text-xs flex-shrink-0"
                        >
                          {vendor.type === 'external' ? 'Ngoài' : 'Nội bộ'}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${
                                  i < Math.floor(vendor.rating || 0)
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-muted'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-medium">
                            {vendor.rating?.toFixed(1) || '0.0'}
                          </span>
                        </div>
                        
                        {vendor.total_orders && vendor.total_orders > 0 && (
                          <>
                            <span>•</span>
                            <span>{vendor.total_orders} lô</span>
                          </>
                        )}
                        
                        {vendor.total_value && vendor.total_value > 0 && (
                          <>
                            <span>•</span>
                            <span className="truncate">
                              {formatCurrency(vendor.total_value)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </SwipeableCard>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
