import { useState, useEffect, useCallback } from 'react'
import { differenceInMinutes, differenceInHours } from 'date-fns'

export interface ShiftDuration {
  hours: number
  minutes: number
  totalMinutes: number
  formatted: string
}

/**
 * Hook to calculate live shift duration with auto-update every minute
 */
export function useShiftTimer(shiftStartAt: string | null | undefined): ShiftDuration {
  const calculateDuration = useCallback((): ShiftDuration => {
    if (!shiftStartAt) {
      return { hours: 0, minutes: 0, totalMinutes: 0, formatted: '0h 0p' }
    }
    
    const start = new Date(shiftStartAt)
    const now = new Date()
    
    const totalMinutes = differenceInMinutes(now, start)
    const hours = differenceInHours(now, start)
    const minutes = totalMinutes % 60
    
    return {
      hours,
      minutes,
      totalMinutes,
      formatted: `${hours}h ${minutes}p`
    }
  }, [shiftStartAt])

  const [duration, setDuration] = useState<ShiftDuration>(calculateDuration)

  useEffect(() => {
    // Initial calculation
    setDuration(calculateDuration())

    // Update every 60 seconds
    const interval = setInterval(() => {
      setDuration(calculateDuration())
    }, 60000)

    return () => clearInterval(interval)
  }, [calculateDuration])

  return duration
}

/**
 * Get shift status based on duration and thresholds
 */
export type ShiftStatus = 'normal' | 'warning' | 'overtime'

export function getShiftStatus(
  totalMinutes: number,
  warningHours: number = 8,
  maxHours: number = 10
): ShiftStatus {
  const hours = totalMinutes / 60
  if (hours >= maxHours) return 'overtime'
  if (hours >= warningHours) return 'warning'
  return 'normal'
}

/**
 * Get status color class based on shift status
 */
export function getShiftStatusColor(status: ShiftStatus): string {
  switch (status) {
    case 'overtime':
      return 'text-red-600'
    case 'warning':
      return 'text-amber-600'
    default:
      return 'text-green-600'
  }
}
