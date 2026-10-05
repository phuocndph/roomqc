import { Link } from 'react-router-dom'
import { Hotel, Users, LogIn, LogOut, ChevronRight, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookingStats, useTodayCheckouts, useTodayCheckins } from '@/hooks/useBookingStats'
import { formatCurrency } from '@/lib/utils'

export function OwnerRoomOverview() {
  const { data: stats, isLoading: statsLoading } = useBookingStats()
  const { data: checkouts, isLoading: checkoutsLoading } = useTodayCheckouts()
  const { data: checkins, isLoading: checkinsLoading } = useTodayCheckins()

  const isLoading = statsLoading || checkoutsLoading || checkinsLoading

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Hotel className="h-4 w-4 text-primary" />
          Hoạt động phòng hôm nay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold text-foreground">{stats?.totalRooms || 0}</p>
            <p className="text-xs text-muted-foreground">Tổng phòng</p>
          </div>
          <div className="p-3 rounded-lg border border-l-4 border-l-green-600 bg-background text-center">
            <p className="text-2xl font-bold text-green-600">{stats?.occupiedRooms || 0}</p>
            <p className="text-xs text-muted-foreground">Đang có khách</p>
          </div>
          <div className="p-3 rounded-lg border border-l-4 border-l-blue-600 bg-background text-center">
            <p className="text-2xl font-bold text-blue-600">{stats?.vacantRooms || 0}</p>
            <p className="text-xs text-muted-foreground">Phòng trống</p>
          </div>
          <div className="p-3 rounded-lg border border-l-4 border-l-primary bg-background text-center">
            <p className="text-2xl font-bold text-primary">{stats?.checkInsToday || 0}</p>
            <p className="text-xs text-muted-foreground">Check-in hôm nay</p>
          </div>
          <div className="p-3 rounded-lg border border-l-4 border-l-orange-600 bg-background text-center">
            <p className="text-2xl font-bold text-orange-600">{stats?.checkOutsToday || 0}</p>
            <p className="text-xs text-muted-foreground">Check-out hôm nay</p>
          </div>
        </div>

        {/* Occupancy Rate */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Tỷ lệ lấp đầy</span>
          </div>
          <span className="text-lg font-bold text-primary">{stats?.occupancyRate || 0}%</span>
        </div>

        {/* Today's Check-ins & Check-outs */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Check-ins */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <LogIn className="h-4 w-4 text-blue-600" />
                Check-in hôm nay
              </h4>
              <Link 
                to="/bookings?status=confirmed" 
                className="text-xs text-primary hover:underline flex items-center"
              >
                Xem tất cả
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {checkins && checkins.length > 0 ? (
              <div className="space-y-1.5">
                {checkins.slice(0, 3).map((checkin) => (
                  <Link
                    key={checkin.id}
                    to={`/rooms/${checkin.room_id}`}
                    className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium border border-blue-600 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                        P.{checkin.room_number}
                      </span>
                      <span className="text-sm">{checkin.guest_name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {checkin.guest_count}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">Không có check-in hôm nay</p>
            )}
          </div>

          {/* Check-outs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <LogOut className="h-4 w-4 text-orange-600" />
                Check-out hôm nay
              </h4>
              <Link 
                to="/bookings?status=checked_in" 
                className="text-xs text-primary hover:underline flex items-center"
              >
                Xem tất cả
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {checkouts && checkouts.length > 0 ? (
              <div className="space-y-1.5">
                {checkouts.slice(0, 3).map((checkout) => (
                  <Link
                    key={checkout.id}
                    to={`/rooms/${checkout.room_id}`}
                    className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium border border-orange-600 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
                        P.{checkout.room_number}
                      </span>
                      <span className="text-sm">{checkout.guest_name}</span>
                    </div>
                    <span className={`text-xs font-medium ${checkout.payment_status === 'paid' ? 'text-green-600' : 'text-orange-600'}`}>
                      {formatCurrency(checkout.total_amount)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">Không có check-out hôm nay</p>
            )}
          </div>
        </div>

        {/* Link to Bookings */}
        <Link
          to="/bookings"
          className="flex items-center justify-between p-3 rounded-lg border border-l-4 border-l-primary bg-background hover:bg-muted/30 transition-colors"
        >
          <span className="text-sm font-medium">Xem tất cả đặt phòng</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  )
}
