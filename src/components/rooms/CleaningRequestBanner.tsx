import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, UserPlus, CheckCircle, Eye, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { useCreateTask } from '@/hooks/useHousekeepingTasks'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CleaningRequestBannerProps {
  roomId: string
  roomNumber: string
  hotelId: string
  onTaskCreated?: () => void
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình', 
  high: 'Cao',
  urgent: 'Khẩn cấp',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  in_progress: 'Đang thực hiện',
}

export function CleaningRequestBanner({ 
  roomId, 
  roomNumber, 
  hotelId,
  onTaskCreated 
}: CleaningRequestBannerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useUser()
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [priority, setPriority] = useState<string>('medium')
  const [notes, setNotes] = useState('')
  
  const { data: staffList, isLoading: staffLoading } = useOnShiftStaffList(hotelId)
  const createTask = useCreateTask()
  
  // Check for existing cleaning task
  const { data: existingTask, isLoading: taskLoading } = useQuery({
    queryKey: ['existing-cleaning-task', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select(`
          id, 
          status, 
          priority,
          assigned_to,
          created_at,
          users:assigned_to(full_name)
        `)
        .eq('room_id', roomId)
        .eq('task_type', 'cleaning')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (error) throw error
      return data
    },
    enabled: !!roomId,
  })
  
  const handleAssignStaff = async () => {
    if (!selectedStaffId) {
      toast.error('Vui lòng chọn nhân viên')
      return
    }
    
    try {
      await createTask.mutateAsync({
        room_id: roomId,
        hotel_id: hotelId,
        task_type: 'cleaning',
        title: `Dọn dẹp phòng ${roomNumber}`,
        description: notes || `Yêu cầu dọn dẹp phòng ${roomNumber} sau checkout`,
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
        assigned_to: selectedStaffId,
      })
      
      toast.success(`Đã giao việc dọn phòng ${roomNumber}`)
      
      setShowAssignDialog(false)
      onTaskCreated?.()
    } catch (error) {
      console.error('Failed to create cleaning task:', error)
      toast.error('Không thể phân công. Vui lòng thử lại.')
    }
  }
  
  const handleSelfAssign = async () => {
    if (!user?.id) return
    
    try {
      await createTask.mutateAsync({
        room_id: roomId,
        hotel_id: hotelId,
        task_type: 'cleaning',
        title: `Dọn dẹp phòng ${roomNumber}`,
        description: `Tự nhận dọn dẹp phòng ${roomNumber}`,
        priority: 'medium',
        assigned_to: user.id,
      })
      
      toast.success(`Bạn đã nhận dọn phòng ${roomNumber}`)
      
      onTaskCreated?.()
      // Navigate to the task
      navigate('/housekeeping')
    } catch (error) {
      console.error('Failed to self-assign:', error)
    }
  }

  // Loading state
  if (taskLoading) {
    return (
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/50 border-border">
        <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
    )
  }

  // If existing task found - show info instead of create buttons
  if (existingTask) {
    const assignedName = (existingTask.users as any)?.full_name || 'Chưa giao'
    
    return (
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <div className="flex-shrink-0 p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
          <RefreshCw className="h-5 w-5 text-blue-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              🧹 Đã có yêu cầu dọn phòng
            </h4>
            <Badge variant="outline" className="text-xs">
              {STATUS_LABELS[existingTask.status] || existingTask.status}
            </Badge>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            Giao cho: <span className="font-medium">{assignedName}</span>
            {existingTask.priority && ` • Ưu tiên: ${PRIORITY_LABELS[existingTask.priority] || existingTask.priority}`}
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
            onClick={() => navigate('/my-tasks')}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Xem task
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-blue-600 hover:text-blue-700"
            onClick={() => setShowAssignDialog(true)}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            Giao lại
          </Button>
        </div>
      </div>
    )
  }

  // No existing task - show create buttons
  return (
    <>
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <div className="flex-shrink-0 p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            🧹 Phòng cần dọn dẹp
          </h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            Phòng đang ở trạng thái "Đang dọn". Vui lòng phân công nhân viên hoặc tự nhận dọn.
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={handleSelfAssign}
            disabled={createTask.isPending}
          >
            {createTask.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Tự dọn
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setShowAssignDialog(true)}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            Phân công
          </Button>
        </div>
      </div>

      {/* Assign Staff Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân công dọn phòng {roomNumber}</DialogTitle>
            <DialogDescription>
              Chọn nhân viên để giao việc dọn dẹp phòng này
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Staff Select */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Nhân viên
                <span className="text-muted-foreground text-xs font-normal">(đang trong ca)</span>
              </Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhân viên..." />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {staffLoading ? (
                    <div className="py-2 px-3 text-sm text-muted-foreground">Đang tải...</div>
                  ) : staffList && staffList.length > 0 ? (
                    staffList.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        <div className="flex items-center gap-2">
                          <span>{staff.full_name || staff.email}</span>
                          {staff.user_level_code && (
                            <span className="text-xs text-muted-foreground">
                              ({staff.user_level_code})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="py-2 px-3 text-sm text-muted-foreground">
                      Không có nhân viên đang trong ca
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* Priority Select */}
            <div className="space-y-2">
              <Label>Mức độ ưu tiên</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú cho nhân viên..."
                className="resize-none h-20"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleAssignStaff}
              disabled={!selectedStaffId || createTask.isPending}
            >
              {createTask.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Phân công
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
