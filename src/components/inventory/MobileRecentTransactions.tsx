import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, ChevronRight, PackagePlus, PackageMinus, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { motion } from 'framer-motion'

export function MobileRecentTransactions() {
  const navigate = useNavigate()
  const { t } = useTranslation('inventory')
  const { data: stats } = useInventoryDashboard()

  const todayIn = stats?.today_transactions?.in || 0
  const todayOut = stats?.today_transactions?.out || 0
  const total = stats?.today_transactions?.total || 0

  return (
    <div className="px-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-muted">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{t('mobileTransactions.todayTitle')}</h2>
          <Badge variant="outline" className="rounded-full">
            {total}
          </Badge>
        </div>
        <button
          onClick={() => navigate('/inventory/transactions')}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          {t('mobileTransactions.viewAll')}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Transaction Summary */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/inventory/transactions?type=in')}
        >
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200/50 dark:border-blue-800/50 cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <PackagePlus className="h-5 w-5 text-blue-500" />
                </div>
                <Clock className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {todayIn}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 font-medium mt-1">
                {t('mobileTransactions.inboundSlips')}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/inventory/transactions?type=out')}
        >
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200/50 dark:border-orange-800/50 cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <PackageMinus className="h-5 w-5 text-orange-500" />
                </div>
                <Clock className="h-3.5 w-3.5 text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {todayOut}
              </p>
              <p className="text-xs text-orange-600/70 dark:text-orange-400/70 font-medium mt-1">
                {t('mobileTransactions.outboundSlips')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
