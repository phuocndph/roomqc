import { BarChart3, FileText, Settings, Building2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const quickLinks = [
  {
    label: 'Báo cáo tổng hợp',
    description: 'Xem báo cáo chi tiết',
    icon: BarChart3,
    href: '/reports',
    color: 'text-chart-1',
  },
  {
    label: 'Báo cáo tài chính',
    description: 'Doanh thu, dòng tiền, chi phí',
    icon: FileText,
    href: '/reports/finance',
    color: 'text-chart-2',
  },
  {
    label: 'Quản lý khách sạn',
    description: 'Cấu hình hệ thống',
    icon: Building2,
    href: '/settings/hotels',
    color: 'text-chart-3',
  },
  {
    label: 'Quản lý nhân sự',
    description: 'Người dùng & quyền',
    icon: Users,
    href: '/settings/users',
    color: 'text-chart-4',
  },
  {
    label: 'Cài đặt hệ thống',
    description: 'Tùy chỉnh ứng dụng',
    icon: Settings,
    href: '/settings',
    color: 'text-chart-5',
  },
]

export function OwnerQuickLinks() {
  return (
    <div className="border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">Truy cập nhanh</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors text-center group"
          >
            <div className="p-2 rounded-full bg-background border border-border group-hover:border-primary/50 transition-colors">
              <link.icon className={cn('h-5 w-5', link.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{link.label}</p>
              <p className="text-[10px] text-muted-foreground">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
