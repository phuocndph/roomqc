import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { DistributionOrderDetail } from '@/types/distribution.types'

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: unknown) => jsPDF
  }
}

export function printDistributionOrder(order: DistributionOrderDetail) {
  const doc = new jsPDF()
  
  // Title
  doc.setFontSize(18)
  doc.text('PHIEU GIAO HANG', 105, 20, { align: 'center' })
  
  // Order code
  doc.setFontSize(14)
  doc.text(order.order_code, 105, 30, { align: 'center' })
  
  // Order info
  doc.setFontSize(10)
  const infoY = 45
  doc.text(`Ngay tao: ${format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}`, 14, infoY)
  doc.text(`Nguoi tao: ${order.created_by_name}`, 14, infoY + 6)
  doc.text(`Nguoi giao: ${order.assigned_to_name || 'Chua phan cong'}`, 14, infoY + 12)
  doc.text(`Tong phong: ${order.total_rooms}`, 140, infoY)
  doc.text(`Tong san pham: ${order.total_items}`, 140, infoY + 6)
  
  if (order.notes) {
    doc.text(`Ghi chu: ${order.notes}`, 14, infoY + 18)
  }
  
  // Rooms and items
  let currentY = infoY + (order.notes ? 30 : 24)
  
  order.rooms?.forEach((room, roomIndex) => {
    // Check if need new page
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }
    
    // Room header
    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text(`Phong ${room.room_number} - Tang ${room.floor}`, 14, currentY)
    doc.setFont(undefined, 'normal')
    currentY += 6
    
    // Items table for this room
    const tableData = room.items?.map(item => [
      item.item_name,
      item.item_code,
      item.quantity.toString(),
      '' // Checkbox column for confirmation
    ]) || []
    
    if (tableData.length > 0) {
      doc.autoTable({
        startY: currentY,
        head: [['San pham', 'Ma', 'SL', 'Xac nhan']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 30, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      })
      
      currentY = (doc as any).lastAutoTable.finalY + 10
    }
  })
  
  // Signature section
  if (currentY > 230) {
    doc.addPage()
    currentY = 20
  }
  
  currentY += 10
  doc.setFontSize(10)
  doc.text('Nguoi giao hang', 40, currentY, { align: 'center' })
  doc.text('Nguoi nhan', 160, currentY, { align: 'center' })
  
  doc.text('(Ky, ghi ro ho ten)', 40, currentY + 6, { align: 'center' })
  doc.text('(Ky, ghi ro ho ten)', 160, currentY + 6, { align: 'center' })
  
  // Save
  doc.save(`phieu-giao-hang-${order.order_code}.pdf`)
}
