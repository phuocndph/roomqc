import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ReportTargetEditor } from '@/components/reports/ReportTargetEditor'
import { Target } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'

export function SetTargetsDialog({ periodDate }: { periodDate: Date }) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
      <Target className="h-3.5 w-3.5" />Đặt mục tiêu
    </Button></DialogTrigger>
    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="text-base">Mục tiêu tháng {format(periodDate, 'MM/yyyy')}</DialogTitle></DialogHeader>
      {open && <ReportTargetEditor kind="financial" month={format(startOfMonth(periodDate), 'yyyy-MM-dd')} onSaved={() => setOpen(false)} />}
      <DialogFooter><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Đóng</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
