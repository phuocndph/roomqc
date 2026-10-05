import { useState } from 'react'
import { FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { OperationsInsightsData, AiAdvice } from '@/hooks/useOperationsInsights'
import type { Finding } from '@/lib/operationsAdvisor'

interface Props {
  insights: OperationsInsightsData
  advice: AiAdvice[]
  fallbackFindings: Finding[]
  hotelName?: string
}

export function ExportInsightsPdfButton({ insights, advice, fallbackFindings, hotelName }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const doc = new jsPDF()
      // jsPDF mặc định không có font Việt — dùng helper chuyển bỏ dấu nếu cần
      // Thử dùng font built-in với UTF-8 (jsPDF có hỗ trợ một phần)
      doc.setFont('helvetica', 'normal')

      let y = 15
      doc.setFontSize(16)
      doc.text(`Bao cao Danh gia Van hanh${hotelName ? ' - ' + stripDiacritics(hotelName) : ''}`, 14, y)
      y += 8
      doc.setFontSize(10)
      doc.text(
        `Ky: ${insights.dateRange.start.toLocaleDateString('vi-VN')} - ${insights.dateRange.end.toLocaleDateString('vi-VN')}`,
        14,
        y,
      )
      y += 10

      doc.setFontSize(12)
      doc.text('CHI SO CHINH', 14, y)
      y += 6
      doc.setFontSize(10)
      const k = insights.derived
      const rows: [string, string][] = [
        ['Loi nhuan thuan', formatCurrency(k.profit)],
        ['Bien loi nhuan', `${k.profitMargin.toFixed(1)}%`],
        ['Doanh thu / phong / ngay (RevPAR)', formatCurrency(k.revpar)],
        ['Ty le lap day', `${k.occupancy.toFixed(1)}%`],
        ['Gia phong TB (ADR)', formatCurrency(k.adr)],
        ['Chi phi / phong / ngay', formatCurrency(k.costPerRoomDay)],
        ['Doanh thu dich vu them', `${k.extraRevenueShare.toFixed(1)}%`],
      ]
      rows.forEach(([label, value]) => {
        doc.text(label, 14, y)
        doc.text(value, 120, y)
        y += 6
      })

      y += 4
      doc.setFontSize(12)
      doc.text('LOI KHUYEN UU TIEN', 14, y)
      y += 6
      doc.setFontSize(10)

      const items: Array<{ title: string; action: string; impact?: number }> =
        advice.length > 0
          ? advice.map(a => ({ title: a.title, action: a.action, impact: a.impactVnd }))
          : fallbackFindings.slice(0, 5).map(f => ({ title: f.finding, action: f.suggestion, impact: f.impactVnd }))

      items.forEach((it, idx) => {
        if (y > 270) { doc.addPage(); y = 15 }
        doc.setFont('helvetica', 'bold')
        const title = stripDiacritics(`${idx + 1}. ${it.title}`)
        const titleLines = doc.splitTextToSize(title, 180)
        doc.text(titleLines, 14, y)
        y += titleLines.length * 5
        doc.setFont('helvetica', 'normal')
        const actionLines = doc.splitTextToSize(stripDiacritics(`-> ${it.action}`), 180)
        doc.text(actionLines, 14, y)
        y += actionLines.length * 5
        if (it.impact) {
          doc.text(`Tac dong: ~${formatCurrency(it.impact)}/thang`, 14, y)
          y += 6
        }
        y += 3
      })

      doc.save(`danh-gia-van-hanh-${insights.dateRange.start.toISOString().slice(0, 10)}.pdf`)
      toast.success('Đã xuất PDF')
    } catch (e) {
      console.error(e)
      toast.error('Xuất PDF thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <FileText className="mr-2 h-4 w-4" />
      {loading ? 'Đang xuất...' : 'Xuất PDF'}
    </Button>
  )
}

/** Bỏ dấu tiếng Việt để jsPDF render được với font Latin built-in. */
function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}
