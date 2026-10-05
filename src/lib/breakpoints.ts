import { useState, useEffect } from 'react'

export const BREAKPOINTS = {
  xs: 0,      // 0-639px - Mobile portrait
  sm: 640,    // 640-767px - Mobile landscape
  md: 768,    // 768-1023px - Tablet portrait
  lg: 1024,   // 1024-1279px - Tablet landscape
  xl: 1280,   // 1280-1535px - Desktop
  '2xl': 1536 // 1536px+ - Large desktop
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const useBreakpoint = () => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('xl')

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width < BREAKPOINTS.sm) setBreakpoint('xs')
      else if (width < BREAKPOINTS.md) setBreakpoint('sm')
      else if (width < BREAKPOINTS.lg) setBreakpoint('md')
      else if (width < BREAKPOINTS.xl) setBreakpoint('lg')
      else if (width < BREAKPOINTS['2xl']) setBreakpoint('xl')
      else setBreakpoint('2xl')
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    breakpoint,
    // Treat tablet portrait widths as compact layouts as well. The desktop
    // sidebar leaves too little room for tables and KPI cards below 1024px.
    isMobile: breakpoint === 'xs' || breakpoint === 'sm' || breakpoint === 'md',
    isTablet: breakpoint === 'md' || breakpoint === 'lg',
    isDesktop: breakpoint === 'xl' || breakpoint === '2xl',
    width: typeof window !== 'undefined' ? window.innerWidth : 0
  }
}

// Touch target size constants
export const TOUCH_TARGET_SIZE = {
  min: 48, // Minimum for accessibility (48x48px)
  comfortable: 56, // Comfortable size
  large: 64 // Large touch targets
} as const
