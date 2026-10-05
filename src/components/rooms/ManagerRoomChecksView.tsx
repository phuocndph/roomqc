import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Eye, Filter } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CheckType } from '@/types/rooms.types'

interface CheckFilters {
  checkType?: CheckType
  days?: number
}

export function ManagerRoomChecksView() {
  const [filters, setFilters] = useState<CheckFilters>({ days: 7 })

  const { data: checks, isLoading } = useQuery({
    queryKey: ['manager-room-checks', filters],
    queryFn: async () => {
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - (filters.days || 7))

      let query = supabase
        .from('room_checks')
        .select(`
          *,
          room:rooms(room_number, floor),
          checked_by:users!room_checks_checked_by_fkey(full_name, avatar_url)
        `)
        .gte('checked_at', daysAgo.toISOString())
        .order('checked_at', { ascending: false })

      if (filters.checkType) {
        query = query.eq('check_type', filters.checkType)
      }

      const { data, error } = await query

      if (error) throw error
      return data
    },
  })

  const getCheckTypeLabel = (type: CheckType) => {
    const labels = {
      daily: 'Đầu ngày',
      checkin: 'Trước check-in',
      checkout: 'Sau check-out',
      maintenance: 'Bảo trì',
    }
    return labels[type] || type
  }

  const getCheckTypeColor = (type: CheckType) => {
    const colors = {
      daily: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      checkin: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      checkout: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      maintenance: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lịch sử kiểm tra phòng</CardTitle>
            <div className="flex gap-2">
              <Select
                value={filters.days?.toString() || '7'}
                onValueChange={(value) => 
                  setFilters({ ...filters, days: Number(value) })
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Thời gian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Hôm nay</SelectItem>
                  <SelectItem value="7">7 ngày qua</SelectItem>
                  <SelectItem value="30">30 ngày qua</SelectItem>
                  <SelectItem value="90">90 ngày qua</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.checkType || 'all'}
                onValueChange={(value) => 
                  setFilters({ 
                    ...filters, 
                    checkType: value === 'all' ? undefined : (value as CheckType)
                  })
                }
              >
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Loại kiểm tra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="daily">Đầu ngày</SelectItem>
                  <SelectItem value="checkin">Trước check-in</SelectItem>
                  <SelectItem value="checkout">Sau check-out</SelectItem>
                  <SelectItem value="maintenance">Bảo trì</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : checks && checks.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày giờ</TableHead>
                    <TableHead>Phòng</TableHead>
                    <TableHead>Loại kiểm tra</TableHead>
                    <TableHead>Người kiểm tra</TableHead>
                    <TableHead>Điểm sạch</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {format(new Date(check.checked_at), 'dd/MM/yyyy', { locale: vi })}
                          </div>
                          <div className="text-muted-foreground">
                            {format(new Date(check.checked_at), 'HH:mm')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          P{check.room?.room_number}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Tầng {check.room?.floor}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCheckTypeColor(check.check_type as CheckType)}>
                          {getCheckTypeLabel(check.check_type as CheckType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {check.checked_by?.full_name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {check.cleanliness_score ? (
                          <Badge variant={check.cleanliness_score >= 8 ? 'default' : 'secondary'}>
                            {check.cleanliness_score}/10
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {check.items_complete ? (
                          <Badge variant="default" className="bg-green-500">
                            Đầy đủ
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            Thiếu {Array.isArray(check.items_missing) ? check.items_missing.length : 0} vật phẩm
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Không có lịch sử kiểm tra nào trong khoảng thời gian này
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
