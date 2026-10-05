import { useState } from 'react'
import { useToast } from './use-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { downloadWorkbook, objectRecordsToRows, type ExcelRow } from '@/lib/excelUtils'

export function useReportExport() {
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()
  
  const exportToPDF = async (
    reportData: {
      title: string
      dateRange: string
      summary?: Record<string, any>
      tables?: Array<{
        title: string
        headers: string[]
        rows: any[][]
        footer?: any[]
      }>
      notes?: string[]
    },
    reportType: string,
    chartElements?: HTMLElement[]
  ) => {
    setIsExporting(true)
    
    try {
      const doc = new jsPDF('l', 'mm', 'a4')
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      
      // Header with logo
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(reportData.title, pageWidth / 2, 20, { align: 'center' })
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(reportData.dateRange, pageWidth / 2, 28, { align: 'center' })
      
      // Add line separator
      doc.setLineWidth(0.5)
      doc.line(20, 32, pageWidth - 20, 32)
      
      let y = 40
      
      // Summary section
      if (reportData.summary) {
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Tóm tắt', 20, y)
        y += 8
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        const summaryEntries = Object.entries(reportData.summary)
        const cols = 2
        const colWidth = (pageWidth - 40) / cols
        
        summaryEntries.forEach(([key, value], index) => {
          const col = index % cols
          const row = Math.floor(index / cols)
          const x = 20 + col * colWidth
          const currentY = y + row * 8
          
          doc.setFont('helvetica', 'normal')
          doc.text(`${formatLabel(key)}:`, x, currentY)
          doc.setFont('helvetica', 'bold')
          doc.text(formatValue(value), x + 60, currentY)
        })
        
        y += Math.ceil(summaryEntries.length / cols) * 8 + 10
      }
      
      // Tables
      if (reportData.tables) {
        for (const table of reportData.tables) {
          if (y > pageHeight - 60) {
            doc.addPage()
            y = 20
          }
          
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text(table.title, 20, y)
          y += 5
          
          autoTable(doc, {
            startY: y,
            head: [table.headers],
            body: table.rows,
            foot: table.footer ? [table.footer] : undefined,
            styles: { 
              fontSize: 8, 
              cellPadding: 2,
              font: 'helvetica',
            },
            headStyles: { 
              fillColor: [66, 139, 202],
              fontStyle: 'bold',
            },
            footStyles: {
              fillColor: [240, 240, 240],
              fontStyle: 'bold',
            },
            alternateRowStyles: {
              fillColor: [250, 250, 250],
            },
            margin: { left: 20, right: 20 },
          })
          
          y = (doc as any).lastAutoTable.finalY + 15
        }
      }
      
      // Charts as images
      if (chartElements && chartElements.length > 0) {
        for (const chartElement of chartElements) {
          doc.addPage()
          
          const canvas = await html2canvas(chartElement, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
          })
          
          const imgData = canvas.toDataURL('image/png')
          const imgWidth = pageWidth - 40
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          
          doc.addImage(imgData, 'PNG', 20, 20, imgWidth, Math.min(imgHeight, pageHeight - 40))
        }
      }
      
      // Notes/Recommendations
      if (reportData.notes && reportData.notes.length > 0) {
        doc.addPage()
        y = 20
        
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Ghi chú & Đề xuất', 20, y)
        y += 10
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        reportData.notes.forEach((note) => {
          const lines = doc.splitTextToSize(note, pageWidth - 40)
          lines.forEach((line: string) => {
            if (y > pageHeight - 20) {
              doc.addPage()
              y = 20
            }
            doc.text(line, 20, y)
            y += 6
          })
          y += 4
        })
      }
      
      // Footer with page numbers and timestamp
      const pageCount = (doc.internal as any).pages.length - 1
      const timestamp = new Date().toLocaleString('vi-VN')
      
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(
          `Trang ${i} / ${pageCount}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        )
        doc.text(
          `Xuất lúc: ${timestamp}`,
          20,
          pageHeight - 10
        )
        doc.text(
          'HotelPro System',
          pageWidth - 20,
          pageHeight - 10,
          { align: 'right' }
        )
      }
      
      const filename = `${reportType}_${formatDate(new Date())}.pdf`
      doc.save(filename)
      
      toast({
        title: 'Thành công',
        description: `Đã xuất báo cáo PDF: ${filename}`,
      })
    } catch (error) {
      console.error('PDF export error:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể xuất PDF. Vui lòng thử lại.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }
  
  const exportToExcel = async (
    reportData: {
      title: string
      dateRange: string
      summary?: Record<string, any>
      tables?: Array<{
        title: string
        headers: string[]
        rows: any[][]
        footer?: any[]
      }>
      chartData?: any[]
    },
    reportType: string
  ) => {
    setIsExporting(true)
    
    try {
      const sheets: { name: string; rows: readonly ExcelRow[]; columnWidths?: number[] }[] = []
      
      // Info sheet
      const infoData = [
        ['Báo cáo', reportData.title],
        ['Kỳ báo cáo', reportData.dateRange],
        ['Xuất lúc', new Date().toLocaleString('vi-VN')],
        [],
      ]
      
      // Summary sheet
      if (reportData.summary) {
        infoData.push(['TÓM TẮT'])
        Object.entries(reportData.summary).forEach(([key, value]) => {
          infoData.push([formatLabel(key), formatValue(value)])
        })
      }
      
      sheets.push({ name: 'Thông tin', rows: infoData, columnWidths: [30, 20] })
      
      // Detail sheets
      if (reportData.tables) {
        reportData.tables.forEach((table, index) => {
          const sheetData = [table.headers, ...table.rows]
          if (table.footer) {
            sheetData.push(table.footer)
          }
          
          // Auto-size columns
          const maxWidth = table.headers.map((_, colIndex) => {
            const columnData = sheetData.map(row => row[colIndex])
            return Math.max(
              ...columnData.map(cell => 
                cell ? cell.toString().length : 10
              )
            )
          })
          
          const sheetName = table.title.substring(0, 31)
          sheets.push({
            name: sheetName,
            rows: sheetData,
            columnWidths: maxWidth.map(w => Math.min(w + 2, 50)),
          })
        })
      }
      
      // Chart data sheet
      if (reportData.chartData && reportData.chartData.length > 0) {
        sheets.push({ name: 'Dữ liệu biểu đồ', rows: objectRecordsToRows(reportData.chartData) })
      }
      
      const filename = `${reportType}_${formatDate(new Date())}.xlsx`
      await downloadWorkbook(sheets, filename)
      
      toast({
        title: 'Thành công',
        description: `Đã xuất báo cáo Excel: ${filename}`,
      })
    } catch (error) {
      console.error('Excel export error:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể xuất Excel. Vui lòng thử lại.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }
  
  return {
    exportToPDF,
    exportToExcel,
    isExporting,
  }
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    total_value: 'Tổng giá trị',
    total_items: 'Tổng items',
    total_types: 'Tổng loại',
    low_stock_count: 'Tồn kho thấp',
    utilization_rate: 'Tỷ lệ sử dụng (%)',
    total_cost: 'Tổng chi phí',
    purchase_cost: 'Chi phí mua sắm',
    laundry_cost: 'Chi phí giặt là',
    maintenance_cost: 'Chi phí bảo trì',
    total_batches: 'Tổng số lô',
    total_weight: 'Tổng cân nặng (kg)',
    avg_quality: 'Chất lượng TB',
    on_time_rate: 'Tỷ lệ đúng hạn (%)',
  }
  
  return labels[key] || key.replace(/_/g, ' ')
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-'
  
  if (typeof value === 'number') {
    // Currency
    if (value > 100000) {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(value)
    }
    // Percentage
    if (value < 100 && value > 0 && value % 1 !== 0) {
      return `${value.toFixed(2)}%`
    }
    // Regular number
    return value.toLocaleString('vi-VN')
  }
  
  return String(value)
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '')
}
