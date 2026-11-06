import { useQuery } from '@tanstack/react-query'
import { fetchOperationsReport, operationsReportRequest } from '@/lib/operations-report'
import { useReportScope } from './useReportScope'
import type { DateRange } from '@/types/reports.types'

export function useOperationsFinancialReport(current: DateRange, previous?: DateRange) {
  const request = operationsReportRequest(current, previous)
  const scope = useReportScope(JSON.stringify(request))
  const query = useQuery({
    queryKey: ['operations-financial-report', ...scope.key],
    enabled: scope.enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const assertCurrent = scope.capture()
      const report = await fetchOperationsReport({ ...request, hotelId: scope.hotelId }, signal)
      assertCurrent()
      return report
    },
  })
  return { ...query, scopeEnabled: scope.enabled, data: scope.enabled && !query.error ? query.data : undefined }
}
