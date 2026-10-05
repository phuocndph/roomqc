import { DoorOpen, CheckCircle, Package, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface SummaryCardProps {
  icon: typeof DoorOpen
  iconColor: string
  iconBg: string
  value: number | string
  label: string
}

function SummaryCard({ icon: Icon, iconColor, iconBg, value, label }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

interface DistributionSummaryCardsProps {
  totalRooms: number
  completedRooms: number
  totalItems: number
  assignedTo?: string | null
}

export function DistributionSummaryCards({ 
  totalRooms, 
  completedRooms, 
  totalItems,
  assignedTo 
}: DistributionSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SummaryCard
        icon={DoorOpen}
        iconColor="text-blue-600"
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        value={totalRooms}
        label="Tổng phòng"
      />
      <SummaryCard
        icon={CheckCircle}
        iconColor="text-green-600"
        iconBg="bg-green-100 dark:bg-green-900/30"
        value={completedRooms}
        label="Đã giao"
      />
      <SummaryCard
        icon={Package}
        iconColor="text-purple-600"
        iconBg="bg-purple-100 dark:bg-purple-900/30"
        value={totalItems}
        label="Tổng sản phẩm"
      />
      <SummaryCard
        icon={User}
        iconColor="text-amber-600"
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        value={assignedTo || 'Chưa phân công'}
        label="Người giao"
      />
    </div>
  )
}
