import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, CheckCircle, Package, Star } from 'lucide-react'
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
import { BatchStatusBadge } from './BatchStatusBadge'
import { formatCurrency } from '@/lib/utils'
import type { LaundryBatchWithVendor, BatchStatus } from '@/types/laundry.types'

interface ActiveBatchesTableProps {
  batches: LaundryBatchWithVendor[]
  isLoading: boolean
}

export function ActiveBatchesTable({ batches, isLoading }: ActiveBatchesTableProps) {
  const { t, i18n } = useTranslation(['laundry'])
  const navigate = useNavigate()
  
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
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('activeBatches.title')}</CardTitle>
          <Button onClick={() => navigate('/laundry/batches')}>
            {t('activeBatches.viewAll')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t('activeBatches.noActiveBatches')}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('activeBatches.table.batchCode')}</TableHead>
                    <TableHead>{t('activeBatches.table.vendor')}</TableHead>
                    <TableHead>{t('activeBatches.table.deliveryDate')}</TableHead>
                    <TableHead>{t('activeBatches.table.expectedReturn')}</TableHead>
                    <TableHead className="text-right">{t('activeBatches.table.items')}</TableHead>
                    <TableHead className="text-right">{t('activeBatches.table.weight')}</TableHead>
                    <TableHead className="text-right">{t('activeBatches.table.cost')}</TableHead>
                    <TableHead>{t('activeBatches.table.status')}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const isOverdue = batch.expected_return_date && 
                      new Date(batch.expected_return_date) < new Date() &&
                      batch.status !== 'received'
                    
                    return (
                      <TableRow
                        key={batch.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/laundry/batches/${batch.id}`)}
                      >
                        <TableCell className="font-medium">
                          {batch.batch_code}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={batch.vendor_logo || undefined} />
                              <AvatarFallback>
                                {batch.vendor_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{batch.vendor_name}</p>
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                <span className="text-xs text-muted-foreground">
                                  {batch.vendor_rating.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(batch.delivery_date).toLocaleDateString(i18n.language === 'vi' ? 'vi-VN' : 'en-US')}
                          <div className="text-xs text-muted-foreground">
                            {new Date(batch.delivery_date).toLocaleTimeString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {batch.expected_return_date ? (
                            <>
                              {new Date(batch.expected_return_date).toLocaleDateString(i18n.language === 'vi' ? 'vi-VN' : 'en-US')}
                              {isOverdue && (
                                <Badge variant="destructive" className="ml-2 text-xs">
                                  {t('activeBatches.overdue')}
                                </Badge>
                              )}
                            </>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {batch.total_items}
                        </TableCell>
                        <TableCell className="text-right">
                          {batch.total_weight_kg} kg
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(batch.actual_cost || batch.estimated_cost) > 0
                            ? formatCurrency(batch.actual_cost || batch.estimated_cost)
                            : <span className="text-muted-foreground italic">{t('activeBatches.costNotUpdated')}</span>
                          }
                        </TableCell>
                        <TableCell>
                          <BatchStatusBadge status={batch.status as BatchStatus} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {batch.status === 'ready' ? (
                            <Button
                              size="sm"
                              onClick={() => navigate(`/laundry/batches/${batch.id}/receive`)}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              {t('activeBatches.receive')}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/laundry/batches/${batch.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}