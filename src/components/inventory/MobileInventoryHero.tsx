import { TrendingUp, TrendingDown, Sparkles, Activity, PackagePlus, PackageMinus } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { formatCurrency } from '@/lib/utils'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function MobileInventoryHero() {
  const { data: stats } = useInventoryDashboard()
  
  const stockHealthPercent = stats?.total_items_count 
    ? Math.round(((stats.total_items_count - (stats.low_stock_count || 0)) / stats.total_items_count) * 100)
    : 100

  const todayIn = stats?.today_transactions?.in || 0
  const todayOut = stats?.today_transactions?.out || 0
  const hasChange = stats?.stock_value_change_percent !== undefined && stats.stock_value_change_percent !== 0
  const isPositive = (stats?.stock_value_change_percent || 0) > 0

  return (
    <div className="px-4 pt-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-primary-foreground"
      >
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
        <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full blur-xl" />
        
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-white/20">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-medium opacity-90">Tổng giá trị kho</span>
          </div>
          
          {/* Main Value */}
          <motion.p 
            className="text-3xl font-bold tracking-tight"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            {formatCurrency(stats?.total_stock_value || 0)}
          </motion.p>
          
          {/* Change Indicator */}
          {hasChange && (
            <motion.div 
              className={cn(
                "inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-medium",
                isPositive ? "bg-green-500/20" : "bg-red-500/20"
              )}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>
                {isPositive ? '+' : ''}
                {stats?.stock_value_change_percent?.toFixed(1)}% so với tháng trước
              </span>
            </motion.div>
          )}
          
          {/* Quick Insight - Today's Activity */}
          <motion.div 
            className="flex items-center gap-4 mt-3 py-2 px-3 rounded-xl bg-white/10"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Activity className="h-4 w-4 opacity-70" />
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <PackagePlus className="h-3.5 w-3.5 text-green-300" />
                <span className="font-medium">+{todayIn}</span>
                <span className="opacity-70 text-xs">nhập</span>
              </span>
              <span className="w-px h-4 bg-white/30" />
              <span className="flex items-center gap-1">
                <PackageMinus className="h-3.5 w-3.5 text-orange-300" />
                <span className="font-medium">-{todayOut}</span>
                <span className="opacity-70 text-xs">xuất</span>
              </span>
            </div>
          </motion.div>
          
          {/* Stock Health */}
          <motion.div 
            className="mt-4 pt-4 border-t border-white/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm opacity-90">Sức khỏe kho hàng</span>
              <span className={cn(
                "text-sm font-bold px-2 py-0.5 rounded-full",
                stockHealthPercent >= 80 ? "bg-green-500/20" :
                stockHealthPercent >= 50 ? "bg-yellow-500/20" :
                "bg-red-500/20"
              )}>
                {stockHealthPercent}%
              </span>
            </div>
            <Progress 
              value={stockHealthPercent} 
              className="h-2.5 bg-white/20" 
            />
            <p className="text-xs opacity-70 mt-1.5">
              {stats?.low_stock_count || 0} sản phẩm cần bổ sung
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
