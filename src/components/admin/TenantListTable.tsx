import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useTenantList } from '@/hooks/useSuperAdminStats'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

export function TenantListTable() {
  const { data: tenants, isLoading } = useTenantList()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Tenant</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <LoadingSpinner size="lg" />
        </CardContent>
      </Card>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Hoạt động
          </Badge>
        )
      case 'trialing':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Dùng thử
          </Badge>
        )
      case 'past_due':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Quá hạn
          </Badge>
        )
      case 'suspended':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Tạm ngưng
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      free: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
      basic: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      professional: 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100',
      enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
    }

    return (
      <Badge variant="outline" className={colors[tier] || ''}>
        {tier}
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách Tenant ({tenants?.length || 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên Tenant</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Hết hạn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Chưa có tenant nào
                    </TableCell>
                  </TableRow>
                ) : (
                  tenants?.map((tenant: any) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>
                        {getTierBadge(tenant.subscription_plan?.code || 'free')}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(tenant.subscription_status)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(tenant.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tenant.current_period_end 
                          ? formatDate(tenant.current_period_end)
                          : tenant.trial_ends_at 
                          ? formatDate(tenant.trial_ends_at)
                          : '-'
                        }
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
