import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Star, Eye, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useLaundryVendors } from '@/hooks/useLaundryVendors'

export function VendorPerformanceTable() {
  const { t } = useTranslation('laundry')
  const navigate = useNavigate()
  const { data: vendors, isLoading } = useLaundryVendors()
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // Filter active vendors and sort by rating
  const activeVendors = vendors
    ?.filter(v => v.status === 'active')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5) || []
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('vendorPerformance.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {activeVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t('vendorPerformance.noVendors')}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('vendorPerformance.columns.vendor')}</TableHead>
                    <TableHead>{t('vendorPerformance.columns.type')}</TableHead>
                    <TableHead>{t('vendorPerformance.columns.rating')}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeVendors.map((vendor) => (
                    <TableRow
                      key={vendor.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={(vendor.contract_info as any)?.logo_url || undefined} />
                            <AvatarFallback>
                              {vendor.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{vendor.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {vendor.type === 'external' ? t('vendorPerformance.typeExternal') : t('vendorPerformance.typeInternal')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
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
                          <span className="text-sm font-medium">
                            {(vendor.rating || 0).toFixed(1)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/laundry/vendors/${vendor.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
