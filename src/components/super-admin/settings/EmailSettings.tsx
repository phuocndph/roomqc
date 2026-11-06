import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

type EmailStatus = {
  enabled: boolean; provider: string; environment: string; sender: string; replyTo: string | null;
  queue: { pending: number; retry_after_until: string | null };
  logs: { id: string; tenant_id: string | null; recipient_email: string; template_name: string; status: string; error_code: string | null; created_at: string; expires_at: string; provider_id: string | null; accepted_at: string | null; attempts: number }[];
}
const statusNames: Record<string, string> = { queued: 'Đang chờ', processing: 'Đang xử lý', accepted: 'Dịch vụ đã nhận',
  delivered: 'Đã giao', delayed: 'Giao chậm', bounced: 'Bị trả lại', complained: 'Báo cáo spam', failed: 'Thất bại', expired: 'Hết hạn', suppressed: 'Đã chặn gửi' }

export function EmailSettings() {
  const [status, setStatus] = useState<EmailStatus | null>(null), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [email, setEmail] = useState('')
  const [filter, setFilter] = useState(''), [retrying, setRetrying] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('email-admin', { body: { action: 'status' } })
      if (error || !data?.provider) throw new Error(data?.error || 'Không thể đọc cấu hình email. Kiểm tra quyền quản trị và dịch vụ máy chủ.')
      setStatus(data)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể đọc cấu hình email') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const retry = async (id: string) => {
    if (!window.confirm('Thử lại email thất bại này? Hành động được ghi vào nhật ký.')) return
    setRetrying(id)
    try {
      const { data, error } = await supabase.functions.invoke('email-admin', {body:{action:'retry',id}})
      if (error || !data?.success) throw new Error(data?.error || 'Email không còn đủ điều kiện thử lại.')
      toast.success('Đã đưa email vào hàng đợi thử lại.'); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể thử lại') }
    finally { setRetrying(null) }
  }
  const visibleLogs = status?.logs.filter(log => [log.recipient_email, log.tenant_id, log.template_name, log.status, statusNames[log.status]].some(value => value?.toLowerCase().includes(filter.toLowerCase()))) || []
  const test = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('email-admin', { body: { action: 'test', email } })
      if (error || !data?.success) throw new Error(data?.error || 'Chưa gửi được email thử. Kiểm tra cấu hình và địa chỉ nhận thử.')
      toast.success('Đã đưa email thử vào hàng đợi. Làm mới để xem kết quả xử lý.')
      await load()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Không thể gửi thử') }
    finally { setSending(false) }
  }
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Dịch vụ email</h3><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Làm mới</Button></div>
    {loading && !status && <p className="text-sm">Đang tải cấu hình…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {status && <>
      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Trạng thái</dt><dd className="font-medium">{status.enabled ? status.provider === 'mailpit' ? 'Hộp thư thử nghiệm local' : 'Đã cấu hình dịch vụ gửi' : 'Chưa bật dịch vụ gửi'}</dd></div>
        <div><dt className="text-muted-foreground">Người gửi</dt><dd className="break-all">{status.sender}</dd></div>
        <div><dt className="text-muted-foreground">Nhận trả lời</dt><dd>{status.replyTo || 'Chưa cấu hình'}</dd></div>
        <div><dt className="text-muted-foreground">Hàng đợi</dt><dd>{status.queue.pending} email đang chờ</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Thông tin gửi được cấu hình tập trung trên máy chủ. Khóa dịch vụ và mật khẩu không hiển thị hoặc lưu qua màn hình này. Trạng thái giao thư chỉ được xác nhận khi có kết quả từ nhà cung cấp.</p>
      <form onSubmit={test} className="rounded-lg border p-4 space-y-3"><Label htmlFor="email-test-recipient">Email nhận thử</Label><div className="flex flex-col sm:flex-row gap-2"><Input id="email-test-recipient" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="email@example.com" /><Button type="submit" disabled={sending || !status.enabled}>{sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Gửi thử</Button></div><p className="text-xs text-muted-foreground">Môi trường thử nghiệm chỉ gửi vào hộp thư local hoặc địa chỉ được cho phép. Mỗi quản trị viên được gửi một email thử mỗi phút.</p></form>
      <section className="rounded-lg border overflow-hidden"><h4 className="font-medium p-4">100 email gần nhất</h4><div className="px-4 pb-4"><Label htmlFor="email-log-filter">Lọc người nhận, mã đơn vị, loại hoặc trạng thái</Label><Input id="email-log-filter" value={filter} onChange={event=>setFilter(event.target.value)} /></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y text-left"><tr><th className="p-3">Người nhận</th><th className="p-3">Loại</th><th className="p-3">Trạng thái</th><th className="p-3">Thời gian</th><th className="p-3">Thao tác</th></tr></thead><tbody>{visibleLogs.map(log => <tr className="border-b last:border-0" key={log.id}><td className="p-3 break-all">{log.recipient_email}</td><td className="p-3">{log.template_name === 'workspace_ready' ? 'Khách sạn sẵn sàng' : 'Gửi thử'}</td><td className="p-3">{statusNames[log.status] || log.status}{log.error_code && <span className="block text-xs text-red-700">{log.error_code}</span>}</td><td className="p-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString('vi-VN')}</td><td className="p-3">{log.status==='failed' && !log.provider_id && !log.accepted_at && log.attempts<5 && Date.parse(log.expires_at)>Date.now() && <Button size="sm" variant="outline" disabled={!!retrying} onClick={()=>void retry(log.id)}>Thử lại</Button>}</td></tr>)}{!visibleLogs.length && <tr><td colSpan={5} className="p-4 text-muted-foreground">Không có email phù hợp.</td></tr>}</tbody></table></div></section>
    </>}
  </div>
}
