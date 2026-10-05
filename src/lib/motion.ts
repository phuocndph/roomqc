/**
 * Framer Motion configuration optimized for mobile performance
 */

import { Transition, TargetAndTransition } from 'framer-motion'

// Reduced motion configuration - respects user's system preference
export const reducedMotionConfig = {
  reducedMotion: "user" as const
}

// Optimized transitions for mobile
export const mobileOptimizedTransition: Transition = {
  type: "tween",
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94] // easeOutQuad - smooth and snappy
}

export const springTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8
}

export const quickSpring: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
  mass: 0.5
}

// Common animation variants
export const fadeInOut = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 }
}

export const slideUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: mobileOptimizedTransition
}

export const slideDown = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: mobileOptimizedTransition
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: mobileOptimizedTransition
}

// Swipe gesture configurations
export const swipeConfig = {
  dragElastic: 0.1,
  dragMomentum: true,
  dragTransition: { 
    bounceStiffness: 300, 
    bounceDamping: 30 
  }
}

// Check if user prefers reduced motion
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Get transition based on user preference
export const getTransition = (transition: Transition): Transition => {
  if (prefersReducedMotion()) {
    return { duration: 0 }
  }
  return transition
}

// Stagger children animation
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02
    }
  }
}

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: mobileOptimizedTransition
  }
}
