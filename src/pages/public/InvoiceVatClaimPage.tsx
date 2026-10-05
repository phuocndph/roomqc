import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, AlertTriangle, Mail } from 'lucide-react'
import { formatVNCurrency } from '@/lib/pricing'

const schema = z.object({
  company_name: z.string().trim().min(2, 'Nhập tên công ty').max(200),
  tax_code: z.string().trim()
    .transform(v => v.replace(/[^0-9]/g, ''))
    .refine(v => v.length === 10 || v.length === 13, 'MST phải có 10 hoặc 13 số'),
  company_address: z.string().trim().max(300).optional().or(z.literal('')),
  email: z.string().trim().email('Email không hợp lệ').max(200),
})

type FormValues = z.infer<typeof schema>

interface ClaimData {
  status: string
  expires_at: string
  invoice: {
    invoice_number: string
    total_amount: number
    vat_amount: number
    issued_at?: string
    room_number?: string
    check_in_date?: string
    check_out_date?: string
  }
  hotel: { name?: string; address?: string; phone?: string }
  prefill?: Partial<FormValues>
}

export default function InvoiceVatClaimPage() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ClaimData | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { company_name: '', tax_code: '', company_address: '', email: '' },
  })
  const { reset } = form

  useEffect(() => {
    if (!token) return
    (async () => {
      const { data: res, error } = await supabase.rpc('get_vat_claim_public', { p_token: token })
      if (error || (res as any)?.error) {
        setErrorMsg('Mã không hợp lệ hoặc đã hết hạn.')
      } else {
        const d = res as any as ClaimData
        setData(d)
        if (d.prefill) reset({
          company_name: d.prefill.company_name || '',
          tax_code: d.prefill.tax_code || '',
          company_address: d.prefill.company_address || '',
          email: d.prefill.email || '',
        })
      }
      setLoading(false)
    })()
  }, [token, reset])

  const onSubmit = async (values: FormValues) => {
    if (!token) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const { data: res, error } = await supabase.functions.invoke('issue-einvoice', {
        body: { token, ...values, company_address: values.company_address || null },
      })
      if (error) throw error
      if ((res as any)?.error) {
        const errCode = (res as any).error
        const map: Record<string, string> = {
          invalid_email: 'Email không hợp lệ.',
          invalid_tax_code: 'Mã số thuế phải có 10 hoặc 13 số.',
          expired: 'Mã đã hết hạn. Vui lòng liên hệ lễ tân.',
          already_claimed: 'Hoá đơn này đã được yêu cầu trước đó.',
          not_found: 'Không tìm thấy hoá đơn.',
        }
        throw new Error(map[errCode] || 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
      setSuccess(true)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Gửi yêu cầu thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-background border rounded-lg p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
          <div className="text-base font-semibold">Mã QR không hợp lệ</div>
          <div className="text-sm text-muted-foreground mt-1">{errorMsg}</div>
        </div>
      </div>
    )
  }

  const invalidStates = ['expired', 'issued', 'failed']
  if (invalidStates.includes(data.status) && !success) {
    const label = data.status === 'issued'
      ? 'Hoá đơn VAT đã được phát hành. Vui lòng kiểm tra email.'
      : data.status === 'expired'
        ? 'Mã QR đã hết hạn. Vui lòng liên hệ lễ tân để được hỗ trợ.'
        : 'Yêu cầu trước đó thất bại. Vui lòng liên hệ lễ tân.'
    return (
      <div className="min-h-svh bg-muted/30 p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-background border rounded-lg p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
          <div className="text-base font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground mt-3">
            {data.hotel.name} {data.hotel.phone && `· ${data.hotel.phone}`}
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-svh bg-muted/30 p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-background border rounded-lg p-6 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-3" />
          <div className="text-lg font-semibold">Đã ghi nhận yêu cầu</div>
          <div className="text-sm text-muted-foreground mt-2">
            Hoá đơn VAT sẽ được gửi tới <b>{form.getValues('email')}</b> trong vài phút.
          </div>
          <div className="text-xs text-muted-foreground mt-4">
            Cảm ơn quý khách đã sử dụng dịch vụ tại {data.hotel.name}.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="text-center pt-4 pb-2">
          <div className="text-xs text-muted-foreground">Lấy hoá đơn VAT điện tử</div>
          <div className="text-lg font-semibold mt-1">{data.hotel.name}</div>
          {data.hotel.address && <div className="text-xs text-muted-foreground">{data.hotel.address}</div>}
        </div>

        <div className="bg-background border rounded-lg p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Số hoá đơn</span>
            <span className="font-mono font-medium">{data.invoice.invoice_number}</span>
          </div>
          {data.invoice.room_number && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phòng</span>
              <span>{data.invoice.room_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tổng tiền</span>
            <span className="font-semibold">{formatVNCurrency(data.invoice.total_amount)}</span>
          </div>
          {data.invoice.vat_amount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Trong đó VAT</span>
              <span>{formatVNCurrency(data.invoice.vat_amount)}</span>
            </div>
          )}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="bg-background border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium pb-1">Thông tin xuất hoá đơn</div>

          <div className="space-y-1.5">
            <Label htmlFor="company_name" className="text-xs">Tên công ty <span className="text-red-600">*</span></Label>
            <Input id="company_name" {...form.register('company_name')} className="h-10" />
            {form.formState.errors.company_name && (
              <p className="text-xs text-red-600">{form.formState.errors.company_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tax_code" className="text-xs">Mã số thuế (10 hoặc 13 số) <span className="text-red-600">*</span></Label>
            <Input id="tax_code" inputMode="numeric" {...form.register('tax_code')} className="h-10 font-mono" />
            {form.formState.errors.tax_code && (
              <p className="text-xs text-red-600">{form.formState.errors.tax_code.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company_address" className="text-xs">Địa chỉ công ty</Label>
            <Input id="company_address" {...form.register('company_address')} className="h-10" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email nhận hoá đơn <span className="text-red-600">*</span></Label>
            <Input id="email" type="email" inputMode="email" {...form.register('email')} className="h-10" />
            {form.formState.errors.email && (
              <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full h-11 mt-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Gửi yêu cầu hoá đơn VAT
          </Button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            Bằng việc gửi yêu cầu, quý khách đồng ý cho khách sạn sử dụng thông tin trên để phát hành hoá đơn GTGT điện tử và gửi qua email.
          </p>
        </form>
      </div>
    </div>
  )
}
