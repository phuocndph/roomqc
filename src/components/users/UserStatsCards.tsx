import { Users, Crown, UserCog, UserCheck } from 'lucide-react'
import { UserWithRelations } from '@/types/database.types'

interface UserStatsCardsProps {
  users: UserWithRelations[]
}

export function UserStatsCards({ users }: UserStatsCardsProps) {
  const totalUsers = users.length
  const ownerCount = users.filter(u => u.user_level_code === 'tenant_owner').length
  const managerCount = users.filter(u =>
    u.user_level_code === 'manager' || u.user_level_code === 'department_manager'
  ).length
  const staffCount = users.filter(u => u.user_level_code === 'staff').length
  const activeCount = users.filter(u => u.status === 'active').length

  const stats = [
    {
      title: 'Tổng số',
      value: totalUsers,
      icon: Users,
      description: `${activeCount} hoạt động`,
      color: 'text-blue-600'
    },
    {
      title: 'Chủ sở hữu',
      value: ownerCount,
      icon: Crown,
      description: 'Quyền cao nhất',
      color: 'text-amber-600'
    },
    {
      title: 'Quản lý',
      value: managerCount,
      icon: UserCog,
      description: 'Quản lý khách sạn',
      color: 'text-green-600'
    },
    {
      title: 'Nhân viên',
      value: staffCount,
      icon: UserCheck,
      description: 'Nhân viên thực hiện',
      color: 'text-muted-foreground'
    }
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div key={stat.title} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{stat.title}</span>
              <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
            </div>
            <div className="text-xl font-bold">{stat.value}</div>
            <p className="text-[10px] text-muted-foreground">{stat.description}</p>
          </div>
        )
      })}
    </div>
  )
}
