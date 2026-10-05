import * as React from "react";
import { useBreakpoint } from "@/lib/breakpoints";

const MOBILE_BREAKPOINT = 768;

/**
 * @deprecated Use useBreakpoint() from @/lib/breakpoints instead
 * This hook is kept for backward compatibility but will be removed in future versions
 * 
 * Migration example:
 * const isMobile = useIsMobile() 
 * → const { isMobile } = useBreakpoint()
 */
export function useIsMobile() {
  console.warn(
    'useIsMobile is deprecated. Use useBreakpoint() from @/lib/breakpoints instead. ' +
    'Example: const { isMobile } = useBreakpoint()'
  );
  
  const { isMobile } = useBreakpoint();
  return isMobile;
}
