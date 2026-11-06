import { useQuery } from '@tanstack/react-query'
import { endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { fetchFinancialReport, financialReportPeriod } from '@/lib/financial-report'
import { useReportScope } from './useReportScope'
import type { ExpenseData } from '@/types/dashboard.types'

/** Whole calendar months for charts; range cards use useFinancialReport directly. */
export function useMonthlyExpenses(months = 12) {
  const valid = Number.isInteger(months) && months >= 1 && months <= 120
  const today = new Date()
  const period = financialReportPeriod({
    start: startOfMonth(subMonths(today, valid ? months - 1 : 0)), end: endOfMonth(today),
  })
  const scope = useReportScope(JSON.stringify({ ...period, months }))
  return useQuery({
    queryKey: ['monthly-expenses', ...scope.key],
    enabled: scope.enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ExpenseData[]> => {
      if (!valid) throw new Error('Số tháng phải là số nguyên từ 1 đến 120.')
      const assertCurrent = scope.capture()
      const report = await fetchFinancialReport({ ...period, hotelId: scope.hotelId }, false, signal)
      if (signal.aborted) throw new Error('Đã hủy tải báo cáo.')
      assertCurrent()
      if (!report.monthly_trend.every(m => [m.purchase, m.laundry, m.maintenance].every(Number.isFinite))) {
        throw new Error('Dữ liệu chi phí tháng không hợp lệ. Vui lòng tải lại.')
      }
      return report.monthly_trend.map(m => ({ month: m.month, purchase: m.purchase,
        laundry: m.laundry, maintenance: m.maintenance, total: m.purchase + m.laundry + m.maintenance }))
    },
  })
}
