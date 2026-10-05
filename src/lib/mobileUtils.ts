import { useBreakpoint } from './breakpoints'

/**
 * Centralized mobile detection utility
 * @deprecated Individual useIsMobile hook - use this instead
 */
export const useMobileDetection = () => useBreakpoint()

// Common mobile breakpoints
export const MOBILE_BREAKPOINT = 768
export const MOBILE_CARD_MIN_HEIGHT = 100
export const MOBILE_STAT_WIDTH = { min: 160, max: 180 }

// Touch target sizes (following accessibility guidelines)
export const TOUCH_TARGET = {
  min: 48,
  comfortable: 56,
  large: 64,
} as const

// Mobile UI constants
export const MOBILE_UI = {
  headerHeight: 64,
  bottomNavHeight: 64,
  contentPadding: 16,
  cardGap: 12,
  statCardWidth: { min: 160, max: 180 },
} as const
