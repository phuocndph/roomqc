import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'

interface Stats {
  total: number; vacant: number; occupied: number; check_in: number
  check_out: number; cleaning: number; maintenance: number; out_of_order: number
}

interface Props { stats: Stats }

export function MobileRoomStatsBar({ stats }: Props) {
  const { t } = useTranslation(['rooms'])
  const items: Array<[number, string, string]> = [
    [stats.total, t('stats.total'), ''],
    [stats.vacant, t('stats.vacant'), 'text-green-600'],
    [stats.occupied, t('stats.occupied'), 'text-blue-600'],
    [stats.check_in, t('stats.checkIn'), 'text-purple-600'],
    [stats.check_out, t('stats.checkOut'), 'text-indigo-600'],
    [stats.cleaning, t('stats.cleaning'), 'text-yellow-600'],
    [stats.maintenance, t('stats.maintenance'), 'text-orange-600'],
    [stats.out_of_order, t('stats.outOfOrder'), 'text-red-600'],
  ]
  return (
    <div className="px-4 pb-3 overflow-x-auto">
      <div className="flex gap-3 min-w-max">
        {items.map(([value, label, color], i) => (
          <Card key={i} className="min-w-[100px]">
            <CardContent className="p-3">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
