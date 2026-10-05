import { useMemo, useState } from 'react'
import {
  Search, FileText, Download, Plus, MoreHorizontal, CheckCircle, XCircle,
  Eye, Edit, Copy, Printer, Mail, FileSpreadsheet, Check, X, AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useGuestInvoices, useUpdateGuestInvoice, useCreateGuestInvoice, GuestInvoice } from '@/hooks/useGuestInvoices'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils'
import { format, startOfMonth, endOfDay } from 'date-fns'
import { generateInvoicePDF, printInvoice, buildVatClaimUrl } from '@/components/invoices/InvoicePDFTemplate'
import { useEnsureVatClaimToken } from '@/hooks/useVatClaimToken'
import { toast } from 'sonner'
import { exportToExcel } from '@/utils/exportUtils'
import { downloadWorkbook, objectRecordsToRows } from '@/lib/excelUtils'
import CreateInvoiceDialog from '@/components/invoices/CreateInvoiceDialog'
import InvoicePreviewDialog from '@/components/invoices/InvoicePreviewDialog'
import EditInvoiceDialog from '@/components/invoices/EditInvoiceDialog'
import SendInvoiceEmailDialog from '@/components/invoices/SendInvoiceEmailDialog'
import VatRequestDetailDialog from '@/components/invoices/VatRequestDetailDialog'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'issued', label: 'Đã xuất' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-amber-600',
  issued: 'text-green-600',
  cancelled: 'text-red-600',
  pending: 'text-amber-600',
}

const VAT_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  issued: 'Đã xuất',
  cancelled: 'Đã hủy',
  draft: 'Nháp',
}

export default function GuestInvoicesPage() {
  const [tab, setTab] = useState<'receipt' | 'vat_request'>('receipt')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<GuestInvoice | null>(null)
  const [editInvoice, setEditInvoice] = useState<GuestInvoice | null>(null)
  const [emailInvoice, setEmailInvoice] = useState<GuestInvoice | null>(null)
  const [vatDetailInvoice, setVatDetailInvoice] = useState<GuestInvoice | null>(null)
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  })

  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { user, role } = useUser() as any

  const canExport = ['owner', 'hotel_manager', 'department_manager'].includes(role)

  const rangeFilter = {
    from: dateRange.from ?? undefined,
    to: dateRange.to ?? undefined,
  }

  const { data: receipts = [], isLoading: loadingReceipts } = useGuestInvoices({
    status: tab === 'receipt' ? statusFilter : 'all',
    search: tab === 'receipt' ? search : undefined,
    invoice_type: 'receipt',
    ...rangeFilter,
  })

  const { data: vatRequests = [], isLoading: loadingVat } = useGuestInvoices({
    invoice_type: 'vat_request',
    ...rangeFilter,
  })

  const updateInvoice = useUpdateGuestInvoice()
  const createInvoice = useCreateGuestInvoice()
  const ensureToken = useEnsureVatClaimToken()

  const hotelInfo = selectedHotel ? {
    name: selectedHotel.name,
    address: (selectedHotel as any).address,
    phone: (selectedHotel as any).phone,
    taxCode: (selectedHotel as any).tax_code,
  } : undefined

  const vatPendingCount = useMemo(
    () => vatRequests.filter(v => v.status === 'pending').length,
    [vatRequests],
  )

  // Receipt stats
  const receiptStats = useMemo(() => {
    const total = receipts.length
    const sum = receipts.reduce((s, r) => s + (r.total_amount || 0), 0)
    const printed = receipts.filter(r => r.status === 'issued').length
    const drafts = receipts.filter(r => r.status === 'draft').length
    return { total, sum, printed, drafts }
  }, [receipts])

  const vatStats = useMemo(() => {
    const total = vatRequests.length
    const pending = vatRequests.filter(v => v.status === 'pending').length
    const issued = vatRequests.filter(v => v.status === 'issued').length
    const cancelled = vatRequests.filter(v => v.status === 'cancelled').length
    return { total, pending, issued, cancelled }
  }, [vatRequests])

  const buildQrPayload = async (inv: GuestInvoice) => {
    try {
      const t = await ensureToken(inv.id)
      const url = buildVatClaimUrl(inv, t?.token)
      if (!url) return undefined
      return { url, label: `${url.replace(/^https?:\/\//, '')} · Hạn 7 ngày` }
    } catch (e: any) {
      toast.error('Không tạo được mã QR VAT', { description: e?.message })
      return undefined
    }
  }

  const handlePrint = async (inv: GuestInvoice) => {
    const qr = await buildQrPayload(inv)
    printInvoice(inv, 'K80', hotelInfo, qr)
  }

  const handleDownloadPDF = async (inv: GuestInvoice) => {
    const qr = await buildQrPayload(inv)
    generateInvoicePDF(inv, 'K80', hotelInfo, qr)
  }

  const handleIssue = (id: string) => {
    updateInvoice.mutate({ id, status: 'issued', issued_at: new Date().toISOString() })
  }

  const handleCancel = (id: string) => {
    updateInvoice.mutate({ id, status: 'cancelled' })
  }

  const handleDuplicate = async (inv: GuestInvoice) => {
    if (!tenant?.id || !selectedHotel?.id) return
    await createInvoice.mutateAsync({
      tenant_id: tenant.id,
      hotel_id: selectedHotel.id,
      guest_name: inv.guest_name,
      guest_phone: inv.guest_phone,
      guest_address: inv.guest_address,
      guest_tax_code: inv.guest_tax_code,
      company_name: inv.company_name,
      room_number: inv.room_number,
      check_in_date: inv.check_in_date,
      check_out_date: inv.check_out_date,
      line_items: inv.line_items,
      subtotal: inv.subtotal,
      vat_rate: inv.vat_rate,
      vat_amount: inv.vat_amount,
      service_fee_rate: inv.service_fee_rate,
      service_fee_amount: inv.service_fee_amount,
      total_amount: inv.total_amount,
      deposit_amount: inv.deposit_amount,
      amount_paid: 0,
      payment_method: inv.payment_method,
      notes: `Nhân bản từ ${inv.invoice_number}`,
      status: 'draft',
      created_by: user?.id || null,
    })
  }

  const handleExportReceiptExcel = async () => {
    const data = receipts.map(inv => ({
      'Số HĐ': inv.invoice_number,
      'Khách hàng': inv.guest_name,
      'Phòng': inv.room_number || '',
      'Tổng tiền': inv.total_amount,
      'Đã TT': inv.amount_paid,
      'Trạng thái': STATUS_OPTIONS.find(s => s.value === inv.status)?.label || inv.status,
      'Ngày tạo': inv.created_at ? format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm') : '',
    }))
    await exportToExcel(data, `phieu-thu-${format(new Date(), 'yyyy-MM-dd')}`, 'Phiếu thu')
  }

  const handleExportVatExcel = async () => {
    const rows = vatRequests.map((inv, i) => ({
      'STT': i + 1,
      'Ngày yêu cầu': format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm'),
      'Tên công ty': inv.company_name || '',
      'MST': inv.guest_tax_code || '',
      'Địa chỉ': inv.guest_address || '',
      'Email kế toán': inv.accountant_email || '',
      'Các dịch vụ': (inv.line_items || []).map(li => `${li.description} x${li.quantity}`).join('; '),
      'Thành tiền': inv.subtotal,
      'Trạng thái': VAT_STATUS_LABEL[inv.status] || inv.status,
    }))
    await downloadWorkbook([{
      name: 'Yêu cầu HĐVAT',
      rows: objectRecordsToRows(rows),
    }], `yeu-cau-hdvat-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  if (isAllHotelsMode) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <div className="text-sm text-muted-foreground max-w-md">
          Vui lòng chọn một khách sạn cụ thể để quản lý hóa đơn khách.
        </div>
      </div>
    )
  }

  const StatCard = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
    <div className="border rounded-lg p-3 flex-1 min-w-[140px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tone || ''}`}>{value}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Hóa đơn khách</h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'receipt' && (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleExportReceiptExcel} disabled={receipts.length === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button type="button" size="sm" className="h-8" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> Tạo phiếu thu
              </Button>
            </>
          )}
          {tab === 'vat_request' && canExport && (
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleExportVatExcel} disabled={vatRequests.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Xuất Excel
            </Button>
          )}
        </div>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Khoảng thời gian:</span>
        <DateRangePicker value={dateRange} onChange={setDateRange} className="h-8 text-xs" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="receipt">Phiếu thu</TabsTrigger>
          <TabsTrigger value="vat_request" className="relative">
            Yêu cầu HĐVAT
            {vatPendingCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">
                {vatPendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: PHIẾU THU */}
        <TabsContent value="receipt" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <StatCard label="Tổng phiếu" value={receiptStats.total} />
            <StatCard label="Tổng tiền" value={formatCurrency(receiptStats.sum)} />
            <StatCard label="Đã in" value={receiptStats.printed} tone="text-green-600" />
            <StatCard label="Còn nợ (nháp)" value={receiptStats.drafts} tone="text-amber-600" />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm số HĐ, tên khách..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadingReceipts ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p className="text-sm">Chưa có phiếu thu nào</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {receipts.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer" onClick={() => setPreviewInvoice(inv)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{inv.invoice_number}</span>
                      <span className={`text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>
                        {STATUS_OPTIONS.find(s => s.value === inv.status)?.label}
                      </span>
                      {inv.email_sent_at && <Mail className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="text-sm">{inv.guest_name} {inv.room_number && `• P.${inv.room_number}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.created_at && format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm font-medium">{formatCurrency(inv.total_amount)}</div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handlePrint(inv) }}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => setPreviewInvoice(inv)}>
                        <Eye className="h-4 w-4 mr-2" /> Xem trước
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadPDF(inv)}>
                        <Download className="h-4 w-4 mr-2" /> Tải PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePrint(inv)}>
                        <Printer className="h-4 w-4 mr-2" /> In
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEmailInvoice(inv)}>
                        <Mail className="h-4 w-4 mr-2" /> Gửi email
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {inv.status === 'draft' && (
                        <DropdownMenuItem onClick={() => setEditInvoice(inv)}>
                          <Edit className="h-4 w-4 mr-2" /> Chỉnh sửa
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(inv)}>
                        <Copy className="h-4 w-4 mr-2" /> Nhân bản
                      </DropdownMenuItem>
                      {inv.status === 'draft' && (
                        <DropdownMenuItem onClick={() => handleIssue(inv.id)}>
                          <CheckCircle className="h-4 w-4 mr-2" /> Xuất chính thức
                        </DropdownMenuItem>
                      )}
                      {inv.status !== 'cancelled' && (
                        <DropdownMenuItem onClick={() => handleCancel(inv.id)} className="text-red-600">
                          <XCircle className="h-4 w-4 mr-2" /> Hủy hóa đơn
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: YÊU CẦU HĐVAT */}
        <TabsContent value="vat_request" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <StatCard label="Tổng yêu cầu" value={vatStats.total} />
            <StatCard label="Chờ xử lý" value={vatStats.pending} tone="text-amber-600" />
            <StatCard label="Đã xuất" value={vatStats.issued} tone="text-green-600" />
            <StatCard label="Đã hủy" value={vatStats.cancelled} tone="text-red-600" />
          </div>

          {loadingVat ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : vatRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p className="text-sm">Chưa có yêu cầu xuất HĐVAT nào</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ngày yêu cầu</th>
                    <th className="px-3 py-2 text-left font-medium">Phòng</th>
                    <th className="px-3 py-2 text-left font-medium">Tên công ty</th>
                    <th className="px-3 py-2 text-left font-medium">MST</th>
                    <th className="px-3 py-2 text-left font-medium">Địa chỉ</th>
                    <th className="px-3 py-2 text-left font-medium">Email kế toán</th>
                    <th className="px-3 py-2 text-left font-medium">Dịch vụ</th>
                    <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                    <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vatRequests.map((inv) => {
                    const services = (inv.line_items || []).map(li => li.description).join(', ')
                    return (
                      <tr key={inv.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setVatDetailInvoice(inv)}>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {format(new Date(inv.created_at), 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td className="px-3 py-2 text-xs">{inv.room_number || '—'}</td>
                        <td className="px-3 py-2 font-medium">{inv.company_name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{inv.guest_tax_code || '—'}</td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={inv.guest_address || ''}>
                          {inv.guest_address || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">{inv.accountant_email || '—'}</td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={services}>
                          {services || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-right whitespace-nowrap">
                          {formatCurrency(inv.subtotal)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>
                            {VAT_STATUS_LABEL[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {inv.status === 'pending' && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600"
                                title="Đánh dấu đã xuất"
                                onClick={() => setVatDetailInvoice(inv)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600"
                                title="Hủy yêu cầu"
                                onClick={() => handleCancel(inv.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Xem"
                            onClick={() => setVatDetailInvoice(inv)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateInvoiceDialog open={showCreate} onOpenChange={setShowCreate} />
      <InvoicePreviewDialog
        invoice={previewInvoice}
        open={!!previewInvoice}
        onOpenChange={(v) => { if (!v) setPreviewInvoice(null) }}
        onSendEmail={(inv) => { setPreviewInvoice(null); setEmailInvoice(inv) }}
        hotelInfo={hotelInfo}
      />
      <EditInvoiceDialog
        invoice={editInvoice}
        open={!!editInvoice}
        onOpenChange={(v) => { if (!v) setEditInvoice(null) }}
      />
      <SendInvoiceEmailDialog
        invoice={emailInvoice}
        open={!!emailInvoice}
        onOpenChange={(v) => { if (!v) setEmailInvoice(null) }}
        hotelInfo={hotelInfo}
      />
      <VatRequestDetailDialog
        invoice={vatDetailInvoice}
        open={!!vatDetailInvoice}
        onOpenChange={(v) => { if (!v) setVatDetailInvoice(null) }}
        onOpenEmail={(inv) => { setVatDetailInvoice(null); setEmailInvoice(inv) }}
      />
    </div>
  )
}
