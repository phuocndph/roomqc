import { emptyRevenueData, type RevenueReport } from './useRevenueReport'
export function reportFixture(): RevenueReport {
  const noShow = () => ({ retainedAmount: 0, refundDueAmount: 0, resolutionsCount: 0, cashMovement: 0 as const })
  return { today: emptyRevenueData(), currentPeriod: emptyRevenueData(), previousPeriod: emptyRevenueData(),
    monthlyTrends: [], recognizedMonthlyTrends: [], revenueGrowth: 0, byType: [], bySource: [], topRooms: [],
    noShow: { today: noShow(), currentPeriod: noShow(), previousPeriod: noShow(), monthlyTrends: [],
      review: { unclassifiedBookings: 0, unallocatedPrepaymentAmount: 0 } },
    recognitionTimezone: 'Asia/Ho_Chi_Minh', periodStart: '2026-10-01', periodEnd: '2026-10-31' }
}
