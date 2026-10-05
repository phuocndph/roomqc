import { useTenant } from './useTenant'

export type UsageMode = 'homestay' | 'standard' | 'full'

// Mode hierarchy: homestay < standard < full
const MODE_LEVEL: Record<UsageMode, number> = {
  homestay: 0,
  standard: 1,
  full: 2,
}

export const useUsageMode = () => {
  const { tenant } = useTenant()
  const usageMode = ((tenant as any)?.usage_mode as UsageMode) || 'full'

  const hasMode = (minMode: UsageMode): boolean => {
    return MODE_LEVEL[usageMode] >= MODE_LEVEL[minMode]
  }

  return { usageMode, hasMode }
}
