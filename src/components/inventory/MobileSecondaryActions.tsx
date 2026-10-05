import { useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, Package, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { motion } from 'framer-motion'

interface ActionItem {
  icon: React.ElementType
  label: string
  onClick: () => void
  iconBg: string
  iconColor: string
}

export function MobileSecondaryActions() {
  const navigate = useNavigate()

  const actions: ActionItem[] = [
    {
      icon: ClipboardList,
      label: 'Kiểm kê',
      onClick: () => navigate('/inventory/adjustments'),
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-500',
    },
    {
      icon: FileText,
      label: 'Giao dịch',
      onClick: () => navigate('/inventory/transactions'),
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-500',
    },
    {
      icon: Package,
      label: 'Tài sản',
      onClick: () => navigate('/items'),
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-500',
    },
    {
      icon: BarChart3,
      label: 'Báo cáo',
      onClick: () => navigate('/reports/inventory'),
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
      iconColor: 'text-indigo-500',
    },
  ]

  return (
    <div className="px-4">
      <div className="grid grid-cols-4 gap-2">
        {actions.map((action, index) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className="cursor-pointer border-0 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-200"
              onClick={action.onClick}
            >
              <CardContent className="flex flex-col items-center justify-center p-3 min-h-[70px]">
                <div className={`p-2 rounded-xl ${action.iconBg} mb-1.5`}>
                  <action.icon className={`h-4 w-4 ${action.iconColor}`} />
                </div>
                <span className="text-[11px] font-medium text-center leading-tight">
                  {action.label}
                </span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
