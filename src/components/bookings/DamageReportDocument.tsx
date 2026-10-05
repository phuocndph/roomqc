import { forwardRef } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'
import type { DamageChargeItem } from '@/lib/bookingCalculations'

interface DamageReportDocumentProps {
  guestName: string
  roomNumber: string
  checkoutDate: Date
  damageItems: DamageChargeItem[]
  totalCharge: number
  adjustmentNote?: string
  hotelInfo?: {
    name: string
    address?: string
    phone?: string
  }
}

export const DamageReportDocument = forwardRef<HTMLDivElement, DamageReportDocumentProps>(
  ({ guestName, roomNumber, checkoutDate, damageItems, totalCharge, adjustmentNote, hotelInfo }, ref) => {
    const lostItems = damageItems.filter(item => item.item_type === 'lost')
    const damagedItems = damageItems.filter(item => item.item_type === 'damaged')

    return (
      <div ref={ref} className="p-8 bg-white text-black min-h-[842px] font-sans text-sm">
        {/* Header */}
        <div className="text-center mb-8">
          {hotelInfo?.name && (
            <h1 className="text-xl font-bold uppercase">{hotelInfo.name}</h1>
          )}
          {hotelInfo?.address && (
            <p className="text-xs text-gray-600">{hotelInfo.address}</p>
          )}
          {hotelInfo?.phone && (
            <p className="text-xs text-gray-600">ĐT: {hotelInfo.phone}</p>
          )}
          <div className="mt-4 border-t border-b border-black py-2">
            <h2 className="text-lg font-bold uppercase">BIÊN BẢN XÁC NHẬN THIỆT HẠI</h2>
            <p className="text-xs text-gray-500">DAMAGE CONFIRMATION REPORT</p>
          </div>
        </div>

        {/* Guest & Room Info */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <p><span className="font-medium">Khách hàng:</span> {guestName}</p>
            <p><span className="font-medium">Guest name:</span> {guestName}</p>
          </div>
          <div>
            <p><span className="font-medium">Phòng / Room:</span> {roomNumber}</p>
            <p><span className="font-medium">Ngày / Date:</span> {format(checkoutDate, 'dd/MM/yyyy', { locale: vi })}</p>
          </div>
        </div>

        {/* Damage Items Table */}
        <div className="mb-6">
          <h3 className="font-bold mb-2 border-b pb-1">
            DANH SÁCH ĐỒ DÙNG THIỆT HẠI / LIST OF DAMAGED ITEMS
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left w-12">STT</th>
                <th className="border p-2 text-left">Tên đồ / Item</th>
                <th className="border p-2 text-center w-20">Tình trạng</th>
                <th className="border p-2 text-center w-16">SL</th>
                <th className="border p-2 text-right w-28">Đơn giá</th>
                <th className="border p-2 text-right w-28">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {lostItems.length > 0 && (
                <>
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="border p-2 font-medium text-red-600">
                      Đồ mất / Lost Items
                    </td>
                  </tr>
                  {lostItems.map((item, idx) => (
                    <tr key={item.item_id}>
                      <td className="border p-2 text-center">{idx + 1}</td>
                      <td className="border p-2">{item.item_name}</td>
                      <td className="border p-2 text-center text-red-600">Mất</td>
                      <td className="border p-2 text-center">{item.quantity}</td>
                      <td className="border p-2 text-right">{formatCurrency(item.charge_amount)}</td>
                      <td className="border p-2 text-right">{formatCurrency(item.charge_amount * item.quantity)}</td>
                    </tr>
                  ))}
                </>
              )}
              {damagedItems.length > 0 && (
                <>
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="border p-2 font-medium text-amber-600">
                      Đồ hỏng / Damaged Items
                    </td>
                  </tr>
                  {damagedItems.map((item, idx) => (
                    <tr key={item.item_id}>
                      <td className="border p-2 text-center">{lostItems.length + idx + 1}</td>
                      <td className="border p-2">
                        {item.item_name}
                        {item.damage_type && (
                          <span className="text-xs text-gray-500 ml-1">
                            ({item.damage_type === 'repairable' ? 'Sửa' : 'Thay'})
                          </span>
                        )}
                      </td>
                      <td className="border p-2 text-center text-amber-600">Hỏng</td>
                      <td className="border p-2 text-center">{item.quantity}</td>
                      <td className="border p-2 text-right">{formatCurrency(item.charge_amount)}</td>
                      <td className="border p-2 text-right">{formatCurrency(item.charge_amount * item.quantity)}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-gray-100">
                <td colSpan={5} className="border p-2 text-right">TỔNG CỘNG / TOTAL:</td>
                <td className="border p-2 text-right text-red-600">{formatCurrency(totalCharge)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Adjustment Note */}
        {adjustmentNote && (
          <div className="mb-6 p-3 border rounded bg-yellow-50">
            <p className="font-medium">Ghi chú điều chỉnh / Adjustment Note:</p>
            <p className="italic">{adjustmentNote}</p>
          </div>
        )}

        {/* Confirmation */}
        <div className="mb-8">
          <p className="text-xs text-gray-600 mb-4">
            Tôi xác nhận đã kiểm tra và đồng ý với danh sách thiệt hại nêu trên.
            <br />
            I confirm that I have reviewed and agree with the above damage list.
          </p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 mt-12">
          <div className="text-center">
            <p className="font-medium mb-16">XÁC NHẬN CỦA KHÁCH</p>
            <p className="border-t border-gray-400 pt-2">Guest Signature</p>
          </div>
          <div className="text-center">
            <p className="font-medium mb-16">XÁC NHẬN CỦA NHÂN VIÊN</p>
            <p className="border-t border-gray-400 pt-2">Staff Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Ngày in / Printed: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: vi })}</p>
        </div>
      </div>
    )
  }
)

DamageReportDocument.displayName = 'DamageReportDocument'
