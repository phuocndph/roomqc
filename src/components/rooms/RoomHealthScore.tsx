import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { RoomCheckWithUser } from '@/types/rooms.types'

interface RoomHealthScoreProps {
  checks: RoomCheckWithUser[]
  totalItems: number
  missingItems: number
  compact?: boolean
}

export function RoomHealthScore({ checks, totalItems, missingItems, compact = false }: RoomHealthScoreProps) {
  // Calculate health score based on various factors
  const calculateHealthScore = () => {
    let score = 100
    
    // Factor 1: Check frequency (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentChecks = checks.filter(c => new Date(c.checked_at) > thirtyDaysAgo)
    
    if (recentChecks.length === 0) {
      score -= 30 // No checks in 30 days
    } else if (recentChecks.length < 5) {
      score -= 15 // Less than 5 checks per month
    }
    
    // Factor 2: Average cleanliness score
    const avgCleanliness = checks.length > 0
      ? checks.reduce((sum, c) => sum + (c.cleanliness_score || 0), 0) / checks.length
      : 5
    
    if (avgCleanliness < 3) {
      score -= 25
    } else if (avgCleanliness < 4) {
      score -= 10
    }
    
    // Factor 3: Missing items percentage
    const missingPercentage = totalItems > 0 ? (missingItems / totalItems) * 100 : 0
    score -= missingPercentage * 0.5
    
    // Factor 4: Incomplete checks
    const incompleteChecks = checks.filter(c => !c.items_complete).length
    const incompletePercentage = checks.length > 0 ? (incompleteChecks / checks.length) * 100 : 0
    score -= incompletePercentage * 0.3
    
    return Math.max(0, Math.min(100, score))
  }
  
  const healthScore = calculateHealthScore()
  
  const getScoreColor = () => {
    if (healthScore >= 80) return 'text-green-600'
    if (healthScore >= 60) return 'text-amber-600'
    return 'text-red-600'
  }
  
  const getScoreLabel = () => {
    if (healthScore >= 80) return 'Xuất sắc'
    if (healthScore >= 60) return 'Tốt'
    if (healthScore >= 40) return 'Cần cải thiện'
    return 'Kém'
  }

  const getProgressColor = () => {
    if (healthScore >= 80) return 'bg-green-500'
    if (healthScore >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }
  
  // Calculate trend (comparing last 5 checks to previous 5)
  const calculateTrend = () => {
    if (checks.length < 6) return 'stable'
    
    const recent5 = checks.slice(0, 5)
    const previous5 = checks.slice(5, 10)
    
    const recentAvg = recent5.reduce((sum, c) => sum + (c.cleanliness_score || 0), 0) / 5
    const previousAvg = previous5.reduce((sum, c) => sum + (c.cleanliness_score || 0), 0) / 5
    
    const diff = recentAvg - previousAvg
    
    if (diff > 0.3) return 'up'
    if (diff < -0.3) return 'down'
    return 'stable'
  }
  
  const trend = calculateTrend()

  // Calculate stats
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const monthlyChecks = checks.filter(c => new Date(c.checked_at) > thirtyDaysAgo).length
  const avgCleanliness = checks.length > 0 
    ? (checks.reduce((sum, c) => sum + (c.cleanliness_score || 0), 0) / checks.length).toFixed(1)
    : 'N/A'

  // Compact variant for mobile
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${getScoreColor()}`}>
            {Math.round(healthScore)}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
        <span className={`text-xs font-medium ${getScoreColor()}`}>
          {getScoreLabel()}
        </span>
        {trend === 'up' && (
          <TrendingUp className="h-4 w-4 text-green-600" />
        )}
        {trend === 'down' && (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )}
        {trend === 'stable' && (
          <Minus className="h-4 w-4 text-muted-foreground" />
        )}
        <Progress value={healthScore} className="flex-1 h-2" />
      </div>
    )
  }
  
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Sức khỏe phòng</p>
      </div>
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${getScoreColor()}`}>
            {Math.round(healthScore)}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${getScoreColor()}`}>
            {getScoreLabel()}
          </span>
          {trend === 'up' && (
            <div className="flex items-center gap-0.5 text-green-600">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[10px]">↑</span>
            </div>
          )}
          {trend === 'down' && (
            <div className="flex items-center gap-0.5 text-red-600">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-[10px]">↓</span>
            </div>
          )}
          {trend === 'stable' && (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      
      <Progress value={healthScore} className="h-1.5 mb-3" />
      
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        <div className="p-1.5 bg-muted/50 rounded">
          <p className="font-semibold text-foreground">{monthlyChecks}</p>
          <p className="text-muted-foreground">kiểm/tháng</p>
        </div>
        <div className="p-1.5 bg-muted/50 rounded">
          <p className="font-semibold text-foreground">{avgCleanliness}/5</p>
          <p className="text-muted-foreground">sạch TB</p>
        </div>
        <div className="p-1.5 bg-muted/50 rounded">
          <p className={`font-semibold ${missingItems > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {missingItems}/{totalItems}
          </p>
          <p className="text-muted-foreground">thiếu</p>
        </div>
      </div>
    </div>
  )
}