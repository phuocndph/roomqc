import type { RevenueReport } from '@/hooks/useRevenueReport'
import { formatCurrency } from '@/lib/utils'

export function NoShowFinanceSummary({ report }: { report: Pick<RevenueReport, 'noShow' | 'recognitionTimezone'> }) {
  const period = report.noShow.currentPeriod
  const review = report.noShow.review
  return (
    <section aria-label="Phí khách không đến và đối soát cọc" className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Khách không đến · cọc và phí</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Ghi nhận theo ngày xử lý cọc ({report.recognitionTimezone}). Cọc đã thu trước đó; phân loại cọc không tạo khoản thu mới.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Phí giữ cọc trong kỳ</dt><dd className="font-semibold">{formatCurrency(period.retainedAmount)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Cọc cần hoàn ghi nhận trong kỳ</dt><dd className="font-semibold">{formatCurrency(period.refundDueAmount)}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">Khoản cần hoàn chưa phải tiền đã hoàn. Phí này không tính vào lượt ở, ADR hoặc RevPAR của phòng. Xem tiền thực thu theo ngày thanh toán tại Dòng tiền.</p>
      {(review.unclassifiedBookings > 0 || review.unallocatedPrepaymentAmount > 0) && (
        <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Cần đối soát trên toàn bộ lịch sử được phép xem: {review.unclassifiedBookings} booking chưa có phân loại cọc hợp lệ;
          {' '}{formatCurrency(review.unallocatedPrepaymentAmount)} tiền trả trước ngoài cọc chưa được phân loại. Các khoản này chưa được cộng vào doanh thu no-show.
        </p>
      )}
    </section>
  )
}
