/**
 * @deprecated Legacy wizard kiểm tra phòng (1,619 dòng).
 *
 * KHÔNG dùng cho luồng kiểm tra hàng ngày/định kỳ/checkin/checkout — đã chuyển
 * sang Lean (`/rooms/:id/check-lean`, `/check-replenish`, `/check-delivery`).
 *
 * File này CHỈ còn được `RoomCheckRouter` gọi khi URL chứa một trong các tín hiệu:
 *   - `?inspection=...`           (checkout-inspection cũ)
 *   - `?distribution_order_id=`    (xuất kho từ phiếu phân phối)
 *   - `?room_order_id=`            (đơn đặt hàng theo phòng)
 *   - `?type=delivery|replenish` khi flag `settings.room_check.use_lean` tắt
 *
 * Khi 3 luồng còn lại đã có biến thể Lean, hãy XOÁ hẳn file này và nhánh
 * `<RoomCheckPage />` trong `RoomCheckRouter.tsx`.
 */
import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ChevronLeft, ChevronRight, Check, Loader2, ClipboardCheck, LogIn, LogOut, Settings, Clock, Package, PackagePlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { roomCheckFormSchema } from '@/lib/validations/rooms.schemas'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Form } from '@/components/ui/form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useRoom } from '@/hooks/useRooms'
import { useCreateRoomCheck } from '@/hooks/useRoomChecks'
import { useUser } from '@/hooks/useUser'
import { useRoomCheckSession } from '@/hooks/useRoomCheckSession'
import { useRoomBooking } from '@/hooks/useRoomBooking'
import { usePendingInspections, useRoomHasPendingInspection, useAutoCreateCheckoutInspection } from '@/hooks/useCheckoutInspection'
import { useCreateMultipleChargeableConsumptions, type CreateChargeableConsumptionInput } from '@/hooks/useChargeableConsumptions'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { sendTelegramNotification, createInAppNotification } from '@/hooks/useNotificationTriggers'
import { CheckTypeStep } from '@/components/rooms/check-steps/CheckTypeStep'
import { ItemsCheckStep } from '@/components/rooms/check-steps/ItemsCheckStep'
import { ReviewStep } from '@/components/rooms/check-steps/ReviewStep'
import { ChargeableItemsStep } from '@/components/rooms/check-steps/ChargeableItemsStep'
import { CleaningRequestStep } from '@/components/rooms/check-steps/CleaningRequestStep'
import { Phase1ConfirmStep } from '@/components/rooms/check-steps/Phase1ConfirmStep'
import { DeliveryItemsStep } from '@/components/rooms/check-steps/DeliveryItemsStep'
import { cn } from '@/lib/utils'
import type { RoomCheckFormData, LostItem, DamagedItem } from '@/types/rooms.types'

// Icon mapping for check types
const CHECK_TYPE_ICONS: Record<CheckType, any> = {
  daily: ClipboardCheck,
  checkin: LogIn,
  checkout: LogOut,
  maintenance: Settings,
  delivery: Package,
  replenish: PackagePlus,
}

// Session storage key for referrer
const getReferrerKey = (roomId: string) => `room-check-referrer-${roomId}`

export function RoomCheckPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  
  // Lưu referrer khi mount để quay về đúng trang khi hủy/hoàn thành
  useEffect(() => {
    if (!id) return
    const REFERRER_KEY = getReferrerKey(id)
    
    // Chỉ lưu nếu chưa có (tránh ghi đè khi refresh)
    if (!sessionStorage.getItem(REFERRER_KEY)) {
      try {
        // Lấy referrer từ document.referrer
        const referrer = document.referrer 
          ? new URL(document.referrer).pathname 
          : null
        
        // Chỉ lưu nếu referrer hợp lệ và không phải trang check này
        if (referrer && referrer.startsWith('/') && !referrer.includes('/check')) {
          sessionStorage.setItem(REFERRER_KEY, referrer)
        }
      } catch {
        // Ignore URL parsing errors
      }
    }
  }, [id])
  const prefilledType = searchParams.get('type') as 'daily' | 'checkin' | 'checkout' | 'maintenance' | 'delivery' | 'replenish' | null
  const shouldAutoResume = searchParams.get('resume') === 'true'
  const inspectionIdFromUrl = searchParams.get('inspection') // Lấy checkout inspection ID từ URL
  const distributionOrderId = searchParams.get('distribution_order_id') // Phiếu giao hàng
  const roomOrderId = searchParams.get('room_order_id') // Phòng trong phiếu giao
  
  const { user, hasAnyRole } = useUser()
  
  // Hook để lấy pending inspection và auto-start
  const { 
    pendingInspection, 
    isLoading: isInspectionLoading,
    startInspection 
  } = usePendingInspections(id)
  
  // Hook để kiểm tra phòng có yêu cầu inspection không (bất kể assigned cho ai)
  const { 
    roomInspection, 
    isLoading: isLoadingRoomInspection 
  } = useRoomHasPendingInspection(id)
  
  // Flag để tránh gọi startInspection nhiều lần
  const hasAutoStartedInspection = useRef(false)
  
  // Stable inspection ID để tránh race condition khi submit
  const [stableInspectionId, setStableInspectionId] = useState<string | undefined>(
    inspectionIdFromUrl || undefined
  )
  
  // Tính toán effective inspection ID (từ URL hoặc từ pending inspection)
  const effectiveInspectionId = inspectionIdFromUrl || pendingInspection?.id
  const isManager = hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'])
  const { data: roomData, isLoading } = useRoom(id)
  const { data: currentBooking } = useRoomBooking(id)
  const createCheck = useCreateRoomCheck()
  const { 
    session: existingSession, 
    isLoading: isSessionLoading,
    createSession, 
    deleteSession,
    takeOverSession,
    updateSessionCheckType,
  } = useRoomCheckSession(id)
  
  // Auto-skip step 1 if check type is provided via URL
  const shouldAutoSkip = !!prefilledType
  const initialStep = shouldAutoSkip ? 2 : 1
  
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const [showCheckinBlockDialog, setShowCheckinBlockDialog] = useState(false)
  const [showTakeOverDialog, setShowTakeOverDialog] = useState(false)
  const [conflictSession, setConflictSession] = useState<{ userName: string; startedAt: string } | null>(null)
  const [quickMode, setQuickMode] = useState(false)
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})
  const [sessionCompleted, setSessionCompleted] = useState(false)
  const [hasResumed, setHasResumed] = useState(false) // Flag to prevent useEffect conflicts
  const [chargeableItems, setChargeableItems] = useState<CreateChargeableConsumptionInput[]>([])
  const [chargeableNotes, setChargeableNotes] = useState('')
  const [autoCreatedInspectionId, setAutoCreatedInspectionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false) // Track submission state
  
  // NEW: 2-phase checkout state
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(1)
  const [phase1Submitted, setPhase1Submitted] = useState(false)
  const [isSubmittingPhase1, setIsSubmittingPhase1] = useState(false)
  const createChargeableConsumptions = useCreateMultipleChargeableConsumptions()
  const autoCreateInspection = useAutoCreateCheckoutInspection()
  
  const form = useForm<RoomCheckFormData>({
    resolver: zodResolver(roomCheckFormSchema),
    defaultValues: {
      check_type: prefilledType || 'daily', // Pre-fill from URL
      cleanliness_score: 5,
      items_complete: true,
      items_missing: [],
      items_damaged: [],
      notes: '',
      photos: [],
      // Cleaning request defaults
      needs_cleaning: false,
      cleaning_priority: 'medium',
      cleaning_notes: '',
      room_condition: 'clean',
    },
  })
  
  // Parse data correctly from useRoom
  const room = roomData?.room
  const hotel = roomData?.hotel
  const items = roomData?.items || []
  const recentChecks = roomData?.recent_checks || []
  
  // Watch check_type từ form để detect khi user chọn checkout hoặc delivery
  const watchedCheckType = form.watch('check_type')
  
  // Sync check_type to session when user changes it in step 1
  useEffect(() => {
    if (existingSession?.id && watchedCheckType && watchedCheckType !== existingSession.check_type) {
      updateSessionCheckType(existingSession.id, watchedCheckType)
    }
  }, [watchedCheckType, existingSession?.id, existingSession?.check_type, updateSessionCheckType])

  // Calculate steps based on check type
  const isCheckoutType = watchedCheckType === 'checkout'
  const isDeliveryType = watchedCheckType === 'delivery'
  const isReplenishType = watchedCheckType === 'replenish'
  
  const getTotalSteps = () => {
    if (quickMode) return 2
    // Checkout 4 bước: Type -> Phase1 Items (mất/hỏng) -> Phase1 Confirm (báo lễ tân) -> Phase2 Items + Mức bẩn (gộp)
    if (isCheckoutType) return 4
    if (isDeliveryType) return 3 // Type -> DeliveryItems/Cleaning -> Review
    if (isReplenishType) return 3 // Type -> Items+Cleaning -> Review
    return 3 // Type -> Items -> Review
  }
  const totalSteps = getTotalSteps()
  
  useEffect(() => {
    if (!isLoading && !room) {
      navigate('/rooms')
    }
  }, [room, isLoading, navigate])
  
  // Chặn nếu phòng có yêu cầu inspection giao cho nhân viên khác
  useEffect(() => {
    if (!isLoadingRoomInspection && roomInspection && !roomInspection.isAssignedToMe) {
      toast({
        title: 'Không có quyền',
        description: `Phòng này đang có yêu cầu kiểm tra checkout giao cho ${roomInspection.assignedUserName || 'nhân viên khác'}. Bạn không được phép kiểm tra phòng này.`,
        variant: 'destructive',
      })
      navigate('/rooms')
    }
  }, [isLoadingRoomInspection, roomInspection, navigate])
  
  // Normalize URL: nếu có pendingInspection mà URL chưa có type=checkout thì thêm vào
  // GUARD: không redirect khi URL có context giao hàng (distribution_order_id / room_order_id
  // / returnTo) — tránh đẩy NV giao hàng vào nhầm flow kiểm tra checkout.
  useEffect(() => {
    const hasDistributionContext =
      !!searchParams.get('distribution_order_id') ||
      !!searchParams.get('room_order_id') ||
      !!searchParams.get('returnTo')

    if (
      !isInspectionLoading &&
      pendingInspection &&
      !prefilledType &&
      !inspectionIdFromUrl &&
      !hasDistributionContext
    ) {
      // Navigate với replace để không tạo history mới
      navigate(`/rooms/${id}/check?type=checkout&inspection=${pendingInspection.id}`, { replace: true })
    }
  }, [isInspectionLoading, pendingInspection, prefilledType, inspectionIdFromUrl, id, navigate, searchParams])
  
  // Cập nhật stableInspectionId khi pendingInspection load xong
  useEffect(() => {
    if (pendingInspection?.id && !stableInspectionId) {
      
      setStableInspectionId(pendingInspection.id)
    }
  }, [pendingInspection?.id, stableInspectionId])
  
  // Auto-start inspection khi nhân viên vào trang checkout hoặc chọn check_type = checkout
  // Điều này đảm bảo status được cập nhật dù nhân viên vào bằng đường nào
  useEffect(() => {
    // Derive checkout mode từ URL HOẶC từ form selection
    const isCheckoutMode = prefilledType === 'checkout' || watchedCheckType === 'checkout'
    
    // Chỉ auto-start khi:
    // 1. Đang là checkout type (từ URL hoặc form)
    // 2. Có pending inspection với status = 'pending'
    // 3. Chưa auto-start trước đó
    // 4. Không đang pending mutation
    if (
      isCheckoutMode &&
      pendingInspection?.status === 'pending' &&
      !hasAutoStartedInspection.current &&
      !startInspection.isPending
    ) {
      
      hasAutoStartedInspection.current = true
      startInspection.mutate(pendingInspection.id)
    }
  }, [prefilledType, watchedCheckType, pendingInspection?.id, pendingInspection?.status, startInspection])
  
  // HYBRID APPROACH: Auto-create checkout inspection when user selects checkout type 
  // and room has active booking but NO existing inspection request
  useEffect(() => {
    const isCheckoutMode = watchedCheckType === 'checkout'
    const hasActiveBooking = !!currentBooking?.id
    const hasPendingOrInProgressInspection = !!pendingInspection || !!roomInspection
    const alreadyAutoCreated = !!autoCreatedInspectionId
    
    // Auto-create khi:
    // 1. User chọn checkout type (từ form)
    // 2. Có active booking trong phòng
    // 3. KHÔNG có inspection request nào đang pending/in_progress
    // 4. Chưa auto-create trong session này
    // 5. Có đủ room data
    // 6. Không đang pending mutation
    if (
      isCheckoutMode &&
      hasActiveBooking &&
      !hasPendingOrInProgressInspection &&
      !alreadyAutoCreated &&
      room?.id &&
      room?.tenant_id &&
      room?.hotel_id &&
      !autoCreateInspection.isPending &&
      !isInspectionLoading &&
      !isLoadingRoomInspection
    ) {
      
      autoCreateInspection.mutate({
        tenantId: room.tenant_id,
        hotelId: room.hotel_id,
        roomId: room.id,
        bookingId: currentBooking.id,
      }, {
        onSuccess: (result) => {
          setAutoCreatedInspectionId(result.id)
          setStableInspectionId(result.id)
          // Update URL với inspection ID mới
          navigate(`/rooms/${id}/check?type=checkout&inspection=${result.id}`, { replace: true })
        }
      })
    }
  }, [
    watchedCheckType, 
    currentBooking?.id, 
    pendingInspection, 
    roomInspection,
    autoCreatedInspectionId,
    room?.id, 
    room?.tenant_id, 
    room?.hotel_id,
    autoCreateInspection,
    isInspectionLoading,
    isLoadingRoomInspection,
    id,
    navigate,
  ])
  
  // Create check session on mount
  useEffect(() => {
    const initSession = async () => {
      if (room && user && !existingSession && !isLoading && !isSessionLoading) {
        const checkType = prefilledType || 'daily'
        const result = await createSession(
          room.id,
          checkType,
          user.full_name || user.email || 'Unknown',
          room.tenant_id
        )
        
        if (!result) {
          toast({
            title: 'Không thể tạo session',
            description: 'Có người khác đang kiểm tra phòng này',
            variant: 'destructive',
          })
          navigate('/rooms')
        }
      }
    }
    
    initSession()
  }, [room, user, isLoading, isSessionLoading, existingSession, createSession, navigate, prefilledType])
  
  // Restore form from existing session or show take over dialog for managers
  useEffect(() => {
    // Skip if already resumed to prevent conflicts
    if (hasResumed) return
    
    if (!isSessionLoading && existingSession) {
      // Check if session belongs to current user
      if (existingSession.user_id !== user?.id) {
        // Nếu là manager, cho phép take over
        if (isManager) {
          setConflictSession({
            userName: existingSession.user_name,
            startedAt: existingSession.started_at,
          })
          setShowTakeOverDialog(true)
        } else {
          // Staff không có quyền take over
          toast({
            title: 'Phòng đang được kiểm tra',
            description: `${existingSession.user_name} đang kiểm tra phòng này`,
            variant: 'destructive',
          })
          navigate('/rooms')
        }
        return
      }
      
      // Only restore check_type if no localStorage progress (don't reset form)
      const saved = localStorage.getItem(`room-check-${id}`)
      if (!saved) {
        form.setValue('check_type', existingSession.check_type)
      }
    }
  }, [existingSession, user, id, form, navigate, isSessionLoading, hasResumed, isManager])
  
  // Handle manager take over
  const handleTakeOver = async () => {
    if (!room || !user) return
    
    const checkType = prefilledType || 'daily'
    const result = await takeOverSession(
      room.id,
      checkType,
      user.full_name || user.email || 'Unknown',
      room.tenant_id
    )
    
    if (result) {
      setShowTakeOverDialog(false)
      setConflictSession(null)
      setHasResumed(true) // Prevent re-triggering effects
    } else {
      navigate('/rooms')
    }
  }
  
  // Cleanup session only when user closes/refreshes tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (id && !sessionCompleted) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/room_check_sessions?room_id=eq.${id}`,
          JSON.stringify({})
        )
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [id, sessionCompleted])
  
  // Auto-save to localStorage (when form values change)
  useEffect(() => {
    const subscription = form.watch((data) => {
      if (id && currentStep > 1) {
        localStorage.setItem(
          `room-check-${id}`,
          JSON.stringify({
            data,
            step: currentStep,
            quickMode,
            timestamp: Date.now(),
          })
        )
      }
    })
    return () => subscription.unsubscribe()
  }, [form, id, currentStep, quickMode])

  // Persist progress when navigating steps (even if no field changes)
  useEffect(() => {
    if (!id) return
    if (currentStep <= 1) return

    const data = form.getValues()
    localStorage.setItem(
      `room-check-${id}`,
      JSON.stringify({
        data,
        step: currentStep,
        quickMode,
        timestamp: Date.now(),
      })
    )
  }, [id, currentStep, quickMode, form])
  
  // Check for saved progress on mount
  useEffect(() => {
    // Skip if already resumed
    if (hasResumed) return
    
    if (id && existingSession && existingSession.user_id === user?.id) {
      const saved = localStorage.getItem(`room-check-${id}`)
      if (saved) {
        try {
          const { data, step, quickMode: savedQuickMode, timestamp } = JSON.parse(saved)
          // Only resume if less than 1 hour old
          if (Date.now() - timestamp < 3600000) {
            // Auto-resume if query param is set, otherwise show dialog
            if (shouldAutoResume) {
              // Force check_type to match prefilledType (URL is source of truth for assigned tasks)
              const restoredData = shouldAutoSkip ? { ...data, check_type: prefilledType } : data
              form.reset(restoredData)
              // Force step >= 2 when type is pre-assigned (cannot return to type-selection step)
              setCurrentStep(shouldAutoSkip ? Math.max(2, step) : step)
              setQuickMode(shouldAutoSkip ? false : savedQuickMode)
              setHasResumed(true) // Mark as resumed to prevent conflicts
            } else {
              setShowResumeDialog(true)
            }
          } else {
            localStorage.removeItem(`room-check-${id}`)
          }
        } catch (e) {
          localStorage.removeItem(`room-check-${id}`)
        }
      }
    }
  }, [id, existingSession, user, shouldAutoResume, shouldAutoSkip, prefilledType, hasResumed, form])
  
  const clearSavedProgress = () => {
    if (id) {
      localStorage.removeItem(`room-check-${id}`)
    }
  }
  
  const resumeCheck = () => {
    if (id) {
      const saved = localStorage.getItem(`room-check-${id}`)
      if (saved) {
        try {
          const { data, step, quickMode: savedQuickMode } = JSON.parse(saved)
          // Force check_type to match prefilledType (URL is source of truth for assigned tasks)
          const restoredData = shouldAutoSkip ? { ...data, check_type: prefilledType } : data
          form.reset(restoredData)
          // Force step >= 2 when type is pre-assigned (cannot return to type-selection step)
          setCurrentStep(shouldAutoSkip ? Math.max(2, step) : step)
          setQuickMode(shouldAutoSkip ? false : savedQuickMode)
          setHasResumed(true) // Mark as resumed to prevent conflicts
        } catch (e) {
          // If error, start from beginning with check_type from session
          if (existingSession) {
            form.setValue('check_type', existingSession.check_type)
          }
        }
      }
    }
    setShowResumeDialog(false)
  }
  
  const startFresh = () => {
    clearSavedProgress()
    
    // Keep check_type from URL (assigned task) > existingSession > default
    const checkType = prefilledType || existingSession?.check_type || 'daily'
    
    form.reset({
      check_type: checkType,
      cleanliness_score: 5,
      items_complete: true,
      items_missing: [],
      items_damaged: [],
      notes: '',
      photos: [],
    })
    // When task type is pre-assigned via URL, skip step 1 (type selection)
    setCurrentStep(shouldAutoSkip ? 2 : 1)
    setQuickMode(false)
    setShowResumeDialog(false)
  }
  
  const handleNext = async () => {
    let isValid = false
    
    if (currentStep === 1) {
      isValid = await form.trigger(['check_type'])
      // In quick mode, mark all items as complete automatically
      if (isValid && quickMode) {
        form.setValue('items_complete', true)
        form.setValue('items_missing', [])
        form.setValue('items_damaged', [])
      }
      // Reset phase when starting checkout
      if (isValid && isCheckoutType) {
        setCurrentPhase(1)
        setPhase1Submitted(false)
      }
    } else if (currentStep === 2 && !quickMode && (isDeliveryType || isReplenishType)) {
      // Delivery/Replenish step 2 = Items + Cleaning - không cần validate strict
      isValid = true
    } else if (currentStep === 2 && !quickMode && isCheckoutType) {
      // Step 2 Checkout: Phase 1 Items
      isValid = await form.trigger(['items_complete', 'items_missing', 'items_damaged'])
      
      // AUTO-SKIP Phase1 Confirm: Nếu không có phụ thu/mất/hỏng
      if (isValid) {
        const lostItems = (form.getValues('items_lost') || []) as LostItem[]
        const damagedItems = (form.getValues('items_damaged') || []) as DamagedItem[]
        const hasCharges = chargeableItems.length > 0 || lostItems.length > 0 || damagedItems.length > 0
        
        if (!hasCharges) {
          // Không có gì để báo lễ tân -> skip Phase1 Confirm, vào Phase 2
          setPhase1Submitted(true)
          setCurrentPhase(2)
          setCurrentStep(4) // Skip step 3 (Phase1 Confirm), go to step 4 (Phase2 Items)
          return
        }
      }
    } else if (currentStep === 2 && !quickMode && !isDeliveryType && !isReplenishType) {
      // Step 2: Items check (regular for others)
      isValid = await form.trigger(['items_complete', 'items_missing', 'items_damaged'])
    } else if (currentStep === 2 && quickMode) {
      // Quick mode: step 2 là review cuối
      isValid = await form.trigger(['cleanliness_score'])
    } else if (currentStep === 3 && isCheckoutType) {
      // Checkout step 3 = Phase 1 Confirm
      // Block navigation if Phase 1 hasn't been submitted yet
      if (!phase1Submitted) {
        toast({
          title: 'Chưa gửi báo cáo',
          description: 'Vui lòng gửi báo cáo cho lễ tân trước khi tiếp tục.',
          variant: 'destructive',
        })
        return
      }
      isValid = true
    } else if (currentStep === 3 && (isDeliveryType || isReplenishType)) {
      // Delivery/Replenish step 3 = Review - validate cleanliness
      isValid = await form.trigger(['cleanliness_score'])
    } else if (currentStep === 4 && isCheckoutType) {
      // Checkout step 4 = Phase 2 Items (bổ sung/giặt/thay)
      isValid = true
    } else if (currentStep === 3 && !isCheckoutType && !isDeliveryType && !isReplenishType) {
      // Non-checkout/non-delivery/non-replenish: step 3 là Review cuối
      isValid = await form.trigger(['cleanliness_score'])
    }
    
    if (isValid && currentStep < totalSteps) {
      // For checkout phase transitions
      if (isCheckoutType && currentStep === 3 && phase1Submitted) {
        setCurrentPhase(2) // Move to Phase 2
      }
      setCurrentStep(currentStep + 1)
    }
  }
  
  // NEW: Handle Phase 1 submission (send charges to reception)
  const handlePhase1Submit = async () => {
    if (!room || !user) return
    
    setIsSubmittingPhase1(true)
    
    try {
      // 1. Save chargeable consumptions if any
      if (chargeableItems.length > 0) {
        
        const savedItems = await createChargeableConsumptions.mutateAsync(chargeableItems)
        
        // 2. Send notification to reception
        if (savedItems && savedItems.length > 0) {
          const totalAmount = savedItems.reduce((sum, item) => sum + (item.total_amount || 0), 0)
          await supabase.functions.invoke('notify-chargeable', {
            body: {
              tenant_id: room.tenant_id,
              hotel_id: room.hotel_id,
              booking_id: currentBooking?.id,
              room_id: id,
              room_number: room.room_number,
              items: savedItems.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                total: item.total_amount,
              })),
              total_amount: totalAmount,
              recorded_by_name: user.full_name || user.email,
            },
          })
          
        }
      }
      
      // 3. Also notify about lost/damaged items if any
      const lostItems = (form.getValues('items_lost') || []) as LostItem[]
      const damagedItems = (form.getValues('items_damaged') || []) as DamagedItem[]
      
      if (lostItems.length > 0 || damagedItems.length > 0) {
        const lostTotal = lostItems.reduce((sum, item) => sum + (item.estimated_value || 0), 0)
        const damagedTotal = damagedItems.reduce((sum, item) => sum + (item.damage_cost || 0), 0)
        
        // Send notification for lost/damaged items
        try {
          await supabase.functions.invoke('notify-chargeable', {
            body: {
              tenant_id: room.tenant_id,
              hotel_id: room.hotel_id,
              booking_id: currentBooking?.id,
              room_id: id,
              room_number: room.room_number,
              items: [], // No chargeable items in this notification
              total_amount: 0,
              lost_items: lostItems.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                estimated_value: item.estimated_value || 0,
              })),
              damaged_items: damagedItems.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                damage_cost: item.damage_cost || 0,
                damage_type: item.damage_type,
              })),
              lost_total: lostTotal,
              damaged_total: damagedTotal,
              recorded_by_name: user.full_name || user.email,
            },
          })
          
        } catch (notifyError) {
          console.error('[RoomCheckPage] Failed to send lost/damaged notification:', notifyError)
        }
      }
      
      // 4. Save phase1_damage_data to checkout_inspection_requests for realtime updates
      const finalInspectionId = stableInspectionId || autoCreatedInspectionId || inspectionIdFromUrl || pendingInspection?.id
      
      if (finalInspectionId && (lostItems.length > 0 || damagedItems.length > 0 || chargeableItems.length > 0)) {
        try {
          const phase1DamageData = {
            lost_items: lostItems.map(item => ({
              item_id: item.item_id,
              item_name: item.item_name,
              quantity: item.quantity || 1,
              estimated_value: item.estimated_value || 0,
            })),
            damaged_items: damagedItems.map(item => ({
              item_id: item.item_id,
              item_name: item.item_name,
              quantity: item.quantity || 1,
              damage_cost: item.damage_cost || 0,
              damage_type: item.damage_type,
            })),
            lost_total: lostItems.reduce((sum, item) => sum + (item.estimated_value || 0), 0),
            damaged_total: damagedItems.reduce((sum, item) => sum + (item.damage_cost || 0), 0),
          }
          
          await supabase
            .from('checkout_inspection_requests')
            .update({ phase1_damage_data: phase1DamageData as any })
            .eq('id', finalInspectionId)
          
          
        } catch (dmgError) {
          console.error('[RoomCheckPage] Failed to save phase1_damage_data:', dmgError)
        }
      }

      // 5. Mark Phase 1 as submitted
      setPhase1Submitted(true)
      setCurrentPhase(2)
      setCurrentStep(4) // Move to Phase 2 Items
      
      toast({
        title: 'Đã gửi cho lễ tân',
        description: 'Bạn có thể tiếp tục kiểm tra đồ bổ sung',
      })
    } catch (error) {
      console.error('[RoomCheckPage] Phase 1 submit error:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi thông báo. Vui lòng thử lại.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingPhase1(false)
    }
  }
  
  const handleBack = () => {
    if (currentStep > 1) {
      // CHẶN: Khi task được giao với type cố định (URL có ?type=...), không cho quay về step 1 (chọn loại)
      if (shouldAutoSkip && currentStep <= 2) {
        return
      }
      // CHẶN: Sau khi đã báo lễ tân (phase1Submitted = true), KHÔNG cho quay về step 3 (màn confirm) hay step trước đó
      // Quy trình bắt buộc: báo lễ tân xong → tiếp tục ghi đồ cần thay & dọn, không có lựa chọn quay lui
      if (isCheckoutType && phase1Submitted && currentStep <= 4) {
        toast({
          title: 'Không thể quay lại',
          description: 'Bạn đã báo lễ tân thu tiền. Vui lòng hoàn tất ghi đồ cần thay & dọn.',
          variant: 'destructive',
        })
        return
      }
      setCurrentStep(currentStep - 1)
    }
  }
  
  const handleCancel = () => {
    setShowCancelDialog(true)
  }
  
  const confirmCancel = async () => {
    if (id) {
      await deleteSession(id)
      setSessionCompleted(true)
    }
    
    // Lấy referrer từ sessionStorage và navigate về đó
    const REFERRER_KEY = getReferrerKey(id || '')
    const savedReferrer = sessionStorage.getItem(REFERRER_KEY)
    sessionStorage.removeItem(REFERRER_KEY) // Xóa sau khi sử dụng
    
    // Validate và navigate
    if (savedReferrer && savedReferrer.startsWith('/')) {
      navigate(savedReferrer)
    } else {
      // Fallback: Manager về chi tiết phòng, Staff về danh sách
      navigate(isManager ? `/rooms/${id}` : '/rooms')
    }
  }
  
  const getCheckTypeLabel = (type: string) => {
    const labels = {
      daily: 'Kiểm tra hàng ngày',
      checkin: 'Kiểm tra check-in',
      checkout: 'Kiểm tra check-out',
      maintenance: 'Kiểm tra bảo trì',
      delivery: 'Kiểm tra sau giao hàng',
      replenish: 'Bổ sung đồ & Dọn dẹp',
    }
    return labels[type as keyof typeof labels] || type
  }
  
  const onSubmit = async (data: RoomCheckFormData) => {
    // Guard: Prevent double submit
    if (!id || !user?.id || createCheck.isPending || isSubmitting) return
    
    // Bắt đầu submitting - KHÔNG đóng dialog ngay
    setIsSubmitting(true)
    
    // Ưu tiên: stableInspectionId > autoCreatedInspectionId > URL > pendingInspection
    const finalInspectionId = stableInspectionId || autoCreatedInspectionId || inspectionIdFromUrl || pendingInspection?.id
    
    
    
    
    
    // Warning nếu là checkout mà không có inspectionId
    if (data.check_type === 'checkout' && !finalInspectionId) {
      console.warn('[RoomCheckPage] Checkout mode without inspectionId - will use fallback query')
    }
    
    try {
      // Save chargeable consumptions for checkout if any
      // Skip if already submitted in Phase 1 (2-phase checkout flow)
      if (data.check_type === 'checkout' && chargeableItems.length > 0 && !phase1Submitted) {
        
        const savedItems = await createChargeableConsumptions.mutateAsync(chargeableItems)
        
        // Fire-and-forget: notify chargeable
        if (savedItems && savedItems.length > 0) {
          const totalAmount = savedItems.reduce((sum, item) => sum + (item.total_amount || 0), 0)
          supabase.functions.invoke('notify-chargeable', {
            body: {
              tenant_id: room?.tenant_id,
              hotel_id: room?.hotel_id,
              booking_id: currentBooking?.id,
              room_id: id,
              room_number: room?.room_number,
              items: savedItems.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                total: item.total_amount,
              })),
              total_amount: totalAmount,
              recorded_by_name: user?.full_name || user?.email,
            },
          }).catch(e => console.error('[RoomCheckPage] Chargeable notification error:', e))
        }
      }
      
      // === BƯỚC QUAN TRỌNG: Chỉ await lưu dữ liệu chính ===
      const createdCheck = await createCheck.mutateAsync({
        roomId: id,
        data,
        itemQuantities: Object.keys(itemQuantities).length > 0 ? itemQuantities : undefined,
        inspectionId: finalInspectionId || undefined,
      })
      
      // === THÀNH CÔNG → Navigate ngay, không chờ thêm ===
      clearSavedProgress()
      setShowSubmitDialog(false)
      setShowCheckinBlockDialog(false)
      
      if (data.check_type === 'delivery' && distributionOrderId) {
        toast({
          title: 'Đã hoàn tất giao hàng',
          description: `Đã giao hàng và kiểm tra phòng ${room?.room_number}`,
        })
        navigate(`/inventory/distributions/${distributionOrderId}`)
      } else {
        toast({
          title: 'Đã tạo phiếu cho ca dọn phòng',
          description: `Phòng ${room?.room_number} — ca sau sẽ nhận thông báo ngay`,
        })
        // Staff về thẳng /my-tasks để bốc việc tiếp; Manager về chi tiết phòng để theo dõi
        navigate(isManager ? `/rooms/${id}` : '/my-tasks')
      }
      
      // === CHẠY NỀN: Các task không cần chờ ===
      const backgroundTasks: Promise<any>[] = []
      
      // Delete session
      if (id) {
        backgroundTasks.push(
          deleteSession(id).then(() => setSessionCompleted(true)).catch(e => console.error('[BG] Delete session error:', e))
        )
      }
      
      // Auto-complete housekeeping tasks by check type
      const taskTypeMap: Record<string, string> = {
        checkout: 'checkout_inspection',
        checkin: 'checkin_prep',
        replenish: 'amenity_request',
        daily: 'cleaning',
      }
      const taskType = taskTypeMap[data.check_type]
      if (taskType && room?.id) {
        backgroundTasks.push(
          (async () => {
            try {
              const { data: relatedTask } = await supabase
                .from('housekeeping_tasks')
                .select('id')
                .eq('room_id', room.id)
                .eq('task_type', taskType)
                .in('status', ['pending', 'in_progress'])
                .maybeSingle()
              
              if (relatedTask) {
                
                // F-FSM-02: ghi `room_check_id` (field non-status) trước, rồi
                // chuyển status qua RPC `transition_task_status` để có audit log.
                if (createdCheck?.id) {
                  await supabase
                    .from('housekeeping_tasks')
                    .update({ room_check_id: createdCheck.id })
                    .eq('id', relatedTask.id)
                }
                const { error: tErr } = await supabase.rpc('transition_task_status', {
                  _task_id: relatedTask.id,
                  _to_status: 'completed',
                  _note: 'Tự động hoàn tất khi nộp room check',
                })
                if (tErr) console.error('[BG] transition_task_status failed:', tErr.message)
              }
              
              queryClient.invalidateQueries({ queryKey: ['my-housekeeping-tasks'] })
              queryClient.invalidateQueries({ queryKey: ['pending-task-count'] })
              queryClient.invalidateQueries({ queryKey: ['hotel-housekeeping-tasks'] })
              queryClient.invalidateQueries({ queryKey: ['unified-tasks'] })
            } catch (e) {
              console.error('[BG] Auto-complete task error:', e)
            }
          })()
        )
      }
      
      // Checkout-specific: send completion notification back to requester
      if (data.check_type === 'checkout' && room?.id && user?.id) {
        backgroundTasks.push(
          (async () => {
            try {
              const { data: inspectionData } = await supabase
                .from('checkout_inspection_requests')
                .select('id, requested_by, hotel_id')
                .eq('room_id', room.id)
                .in('status', ['pending', 'in_progress'])
                .maybeSingle()
              
              if (inspectionData?.requested_by && user?.tenant_id) {
                const roomNumber = room?.room_number || ''
                const staffName = user?.full_name || 'Nhân viên'
                
                await Promise.allSettled([
                  createInAppNotification({
                    userId: inspectionData.requested_by,
                    tenantId: user.tenant_id,
                    title: `✅ Hoàn thành kiểm tra phòng ${roomNumber}`,
                    body: `${staffName} đã hoàn thành kiểm tra checkout.`,
                    type: 'room_checkout',
                    actionUrl: '/bookings',
                  }),
                  sendTelegramNotification({
                    tenantId: user.tenant_id,
                    hotelId: inspectionData.hotel_id,
                    userIds: [inspectionData.requested_by],
                    title: `✅ Hoàn thành kiểm tra phòng ${roomNumber}`,
                    message: `${staffName} đã hoàn thành kiểm tra checkout. Phòng sẵn sàng để checkout.`,
                    notificationType: 'checkout',
                    actionUrl: '/bookings',
                  }),
                ])
              }
            } catch (e) {
              console.error('[BG] Checkout notification error:', e)
            }
          })()
        )
      }
      
      // Fire-and-forget all background tasks
      Promise.allSettled(backgroundTasks).catch(() => {})
      
    } catch (error) {
      console.error('Error creating room check:', error)
      
      if (error instanceof Error && error.message.includes('Duplicate')) {
        toast({
          title: 'Lỗi',
          description: 'Bạn vừa kiểm tra phòng này rồi. Vui lòng đợi 5 phút.',
          variant: 'destructive',
        })
        setShowSubmitDialog(false)
        setShowCheckinBlockDialog(false)
        navigate(isManager ? `/rooms/${id}` : '/rooms')
      } else {
        toast({
          title: 'Lỗi',
          description: error instanceof Error 
            ? error.message 
            : 'Không thể hoàn thành kiểm tra. Vui lòng thử lại.',
          variant: 'destructive',
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Đang tải thông tin phòng...</p>
        </div>
      </div>
    )
  }
  
  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Không tìm thấy thông tin phòng</p>
          <Button onClick={() => navigateBack(navigate, '/rooms')} variant="outline">
            Quay lại danh sách phòng
          </Button>
        </div>
      </div>
    )
  }
  
  const progress = (currentStep / totalSteps) * 100
  
  return (
    <>
      {/* Take Over Dialog - For Managers */}
      <AlertDialog open={showTakeOverDialog} onOpenChange={(open) => {
        if (!open) navigate('/rooms')
        setShowTakeOverDialog(open)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Phòng đang được kiểm tra
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div>
                <strong>{conflictSession?.userName}</strong> đang kiểm tra phòng này
                {conflictSession?.startedAt && (
                  <span className="block text-sm mt-1">
                    Bắt đầu lúc: {new Date(conflictSession.startedAt).toLocaleString('vi-VN')}
                    <span className="ml-2 text-amber-600">
                      ({Math.floor((Date.now() - new Date(conflictSession.startedAt).getTime()) / 60000)} phút trước)
                    </span>
                  </span>
                )}
              </div>
              <div className="p-2 bg-muted rounded text-sm">
                <strong>Bạn là quản lý:</strong> Có thể tiếp quản phiên kiểm tra này.
                Session cũ sẽ bị hủy và nhân viên đó sẽ mất tiến trình.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigateBack(navigate, '/rooms')}>Quay lại</AlertDialogCancel>
            <AlertDialogAction onClick={handleTakeOver}>Tiếp quản</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Dialog */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tiếp tục kiểm tra?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có kiểm tra chưa hoàn thành. Bạn muốn tiếp tục hay bắt đầu lại?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={startFresh}>Bắt đầu lại</AlertDialogCancel>
            <AlertDialogAction onClick={resumeCheck}>Tiếp tục</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy kiểm tra phòng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn hủy? Tiến trình đã lưu sẽ được giữ lại để bạn có thể tiếp tục sau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục kiểm tra</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>Hủy và thoát</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Submit Confirmation Dialog — viết lại bằng câu dễ hiểu cho cô buồng phòng */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                if (isCheckoutType) return 'Tạo phiếu cho ca dọn phòng tiếp theo?'
                const cond = form.watch('room_condition')
                const isDaily = watchedCheckType === 'daily'
                if (isDaily && cond && cond !== 'clean') return 'Tạo phiếu lau dọn?'
                if (isDaily && cond === 'clean') return 'Hoàn tất kiểm tra hằng ngày?'
                return 'Hoàn tất kiểm tra?'
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {isCheckoutType ? (
                <>
                  <div className="text-sm">Ca dọn phòng sẽ nhận phiếu với các thông tin sau:</div>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                    {form.watch('room_condition') && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mức bẩn:</span>
                          <strong>
                            {form.watch('room_condition') === 'clean' ? 'Sạch'
                              : form.watch('room_condition') === 'dirty' ? 'Bẩn nhẹ'
                              : 'Rất bẩn'}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mức độ dọn:</span>
                          <strong>
                            {form.watch('room_condition') === 'clean' ? 'Dọn nhẹ (~15 phút)'
                              : form.watch('room_condition') === 'dirty' ? 'Dọn bình thường (~30 phút)'
                              : 'Dọn kỹ (~45-60 phút)'}
                          </strong>
                        </div>
                      </>
                    )}
                    {(() => {
                      const laundryItems = form.watch('items_sent_to_laundry') || []
                      const replacedItems = form.watch('items_replaced') || []
                      const consumedItems = form.watch('items_consumed') || []
                      const sumQty = (arr: any[]) => arr.reduce((s, i) => s + (Number(i?.quantity) || 0), 0)
                      const laundryQty = sumQty(laundryItems)
                      const replacedQty = sumQty(replacedItems)
                      const consumedQty = sumQty(consumedItems)
                      return (
                        <>
                          {laundryQty > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cần giặt:</span>
                              <strong>{laundryQty} cái</strong>
                            </div>
                          )}
                          {replacedQty > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cần thay/bổ sung:</span>
                              <strong>{replacedQty} cái</strong>
                            </div>
                          )}
                          {consumedQty > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Đã hết:</span>
                              <strong>{consumedQty} cái</strong>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Sau khi xong, bạn sẽ về danh sách công việc để nhận phòng tiếp theo.
                  </div>
                </>
              ) : watchedCheckType === 'daily' && form.watch('room_condition') === 'clean' ? (
                <>
                  <div className="text-sm">Phòng sạch sẽ, đồ dùng đầy đủ — <strong>không cần dọn lại</strong>.</div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="text-muted-foreground">Hệ thống chỉ ghi nhận lượt kiểm tra hôm nay.</div>
                    <div className="text-muted-foreground">Khách vẫn ở phòng → phòng giữ nguyên trạng thái <strong className="text-blue-600">Đang sử dụng</strong>.</div>
                  </div>
                  {(() => {
                    const missingCount = (form.watch('items_missing') || []).length
                    const damagedCount = (form.watch('items_damaged') || []).length
                    if (missingCount === 0 && damagedCount === 0) return null
                    return (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
                        <div className="font-medium text-amber-700">⚠️ Vẫn có việc cần xử lý song song:</div>
                        {missingCount > 0 && (
                          <div className="text-amber-700">
                            • {missingCount} món thiếu/cần bổ sung → sẽ gửi yêu cầu cho <strong>kho</strong>
                          </div>
                        )}
                        {damagedCount > 0 && (
                          <div className="text-amber-700">
                            • {damagedCount} món hỏng → sẽ gửi yêu cầu cho <strong>bảo trì</strong>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </>
              ) : watchedCheckType === 'daily' && form.watch('room_condition') && form.watch('room_condition') !== 'clean' ? (
                <>
                  <div className="text-sm">Bộ phận buồng phòng sẽ nhận task lau dọn ngay.</div>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mức bẩn:</span>
                      <strong>{form.watch('room_condition') === 'dirty' ? 'Bẩn nhẹ' : 'Rất bẩn'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Độ ưu tiên:</span>
                      <strong>{form.watch('room_condition') === 'very_dirty' ? 'Cao' : 'Bình thường'}</strong>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Khách vẫn ở phòng → phòng <strong>không đổi trạng thái</strong>, chỉ tạo task riêng cho buồng phòng.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm">Vui lòng kiểm tra lại thông tin trước khi hoàn tất:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Loại kiểm tra: <strong>{getCheckTypeLabel(form.watch('check_type'))}</strong></li>
                    <li>Trạng thái đồ dùng: <strong>{form.watch('items_complete') ? 'Đầy đủ' : 'Có vấn đề'}</strong></li>
                    {form.watch('items_missing')?.length > 0 && (
                      <li className="text-orange-600">Thiếu {form.watch('items_missing').length} vật phẩm</li>
                    )}
                    {form.watch('items_damaged')?.length > 0 && (
                      <li className="text-red-600">Hỏng {form.watch('items_damaged').length} vật phẩm</li>
                    )}
                  </ul>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createCheck.isPending || isSubmitting}>
              Kiểm tra lại
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={form.handleSubmit(onSubmit)}
              disabled={createCheck.isPending || isSubmitting}
            >
              {(createCheck.isPending || isSubmitting) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {(() => {
                    if (isCheckoutType) return 'Xong - Tạo phiếu cho ca sau'
                    const cond = form.watch('room_condition')
                    if (watchedCheckType === 'daily' && cond === 'clean') return 'Xong - Chỉ ghi nhận'
                    if (watchedCheckType === 'daily' && cond && cond !== 'clean') return 'Xong - Tạo phiếu lau dọn'
                    return 'Xác nhận hoàn tất'
                  })()}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Check-in Block Dialog - Warning when room not ready */}
      <AlertDialog open={showCheckinBlockDialog} onOpenChange={setShowCheckinBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-warning">⚠️ Phòng chưa sẵn sàng</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>Phòng này có vấn đề cần giải quyết trước khi cho khách check-in:</div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {(form.watch('items_damaged')?.length || 0) > 0 && (
                  <li className="text-destructive font-medium">
                    {form.watch('items_damaged').length} thiết bị/đồ dùng bị hỏng
                  </li>
                )}
                {(form.watch('items_missing')?.length || 0) > 0 && (
                  <li className="text-warning font-medium">
                    {form.watch('items_missing').length} vật phẩm thiếu
                  </li>
                )}
              </ul>
              <div className="mt-3 p-2 bg-muted rounded text-sm">
                <strong>Khuyến nghị:</strong> Quay lại sửa các vấn đề trước khi hoàn tất kiểm tra check-in.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại sửa</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowCheckinBlockDialog(false)
                setShowSubmitDialog(true)
              }}
            >
              Vẫn hoàn tất
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <div className="space-y-4">
        {/* Page header - hidden on mobile, info already in check type header */}
        <div className="hidden sm:block">
          <PageHeader
            title={`Kiểm tra phòng ${room.room_number}`}
            description={`${room.room_type} - Tầng ${room.floor}`}
          />
        </div>
        
      {/* Compact Check Type Header + Progress - merged into one section */}
      {(() => {
        const checkTypeConfig = getCheckTypeConfig(watchedCheckType)
        const CheckTypeIcon = CHECK_TYPE_ICONS[watchedCheckType as CheckType]
        return (
          <div className={cn('p-3 rounded-lg border', checkTypeConfig.headerColor)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {CheckTypeIcon && <CheckTypeIcon className={cn('h-5 w-5', checkTypeConfig.headerTextColor)} />}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={cn('font-medium text-sm', checkTypeConfig.headerTextColor)}>
                      {checkTypeConfig.label}
                    </h3>
                    {/* Mobile-only: room number */}
                    <span className="sm:hidden text-xs font-semibold text-foreground">
                      P.{room.room_number}
                    </span>
                  </div>
                </div>
              </div>
              {/* Cancel button as X icon in top right */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleCancel}
              >
                <span className="text-lg">✕</span>
              </Button>
            </div>
            {/* Inline progress */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {currentStep}/{totalSteps}
              </span>
              <Progress value={progress} className="h-1.5 flex-1" />
            </div>
            {checkTypeConfig.showBookingInfo && currentBooking && (
              <div className="mt-2 pt-2 border-t border-inherit flex items-center justify-between">
                <p className="text-sm font-medium">{currentBooking.guest_name || 'Khách'}</p>
                <p className="text-xs text-muted-foreground">
                  {currentBooking.check_in_date && currentBooking.check_out_date && 
                    `${new Date(currentBooking.check_in_date).toLocaleDateString('vi-VN')} - ${new Date(currentBooking.check_out_date).toLocaleDateString('vi-VN')}`
                  }
                </p>
              </div>
            )}
          </div>
        )
      })()}
      
      {/* Main content - div instead of Card for compact mobile */}
      <div className="border rounded-lg">
        
        <div className="px-2 py-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {currentStep === 1 && (
                <CheckTypeStep 
                  form={form} 
                  quickMode={quickMode}
                  setQuickMode={setQuickMode}
                  roomId={id}
                  hotelId={roomData?.room?.hotel_id ?? roomData?.hotel?.id}
                />
              )}
              {/* Step instruction banners */}
              {currentStep === 2 && !quickMode && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  {isCheckoutType ? (
                    <>
                      <p className="font-medium text-foreground">Xem khách có làm mất hay hỏng đồ không</p>
                      <p className="text-xs mt-0.5">Xem từng món. Nếu còn nguyên thì bấm ✓. Nếu khách làm <strong>mất</strong> hoặc <strong>hỏng</strong> thì bấm nút tương ứng — lễ tân sẽ thu tiền khách.</p>
                    </>
                  ) : isDeliveryType ? (
                    <>
                      <p className="font-medium text-foreground">Xác nhận đồ đã giao</p>
                      <p className="text-xs mt-0.5">So sánh đồ thực tế với danh sách giao. Xác nhận đúng số lượng hoặc ghi nhận chênh lệch.</p>
                    </>
                  ) : isReplenishType ? (
                    <>
                      <p className="font-medium text-foreground">Kiểm tra & bổ sung đồ dùng</p>
                      <p className="text-xs mt-0.5">Xem đồ còn đủ không. Nếu <strong>thiếu</strong> hoặc <strong>hết</strong> thì đánh dấu để yêu cầu bổ sung từ kho.</p>
                    </>
                  ) : watchedCheckType === 'checkin' ? (
                    <>
                      <p className="font-medium text-foreground">Kiểm tra phòng trước khi khách nhận</p>
                      <p className="text-xs mt-0.5">Đảm bảo đồ đầy đủ và hoạt động tốt. Nếu <strong>thiếu</strong> hoặc <strong>hỏng</strong> — đánh dấu để xử lý trước khi khách vào.</p>
                    </>
                  ) : watchedCheckType === 'daily' ? (
                    <>
                      <p className="font-medium text-foreground">Kiểm tra vệ sinh & đồ dùng hàng ngày</p>
                      <p className="text-xs mt-0.5">Xem từng món. Còn nguyên & dùng được → ✓. <strong>Thiếu / Hỏng / Hết</strong> → bấm nút tương ứng. Đánh giá thêm vệ sinh tổng thể bên dưới.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">Kiểm tra sau bảo trì</p>
                      <p className="text-xs mt-0.5">Xác nhận thiết bị đã sửa hoạt động bình thường. Đánh dấu OK hoặc báo vẫn còn hỏng.</p>
                    </>
                  )}
                </div>
              )}
              {currentStep === 3 && !quickMode && isCheckoutType && !phase1Submitted && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Xem lại & báo lễ tân</p>
                  <p className="text-xs mt-0.5">Kiểm tra danh sách bên dưới. Khi bấm gửi, lễ tân sẽ nhận thông báo ngay để thu tiền khách.</p>
                </div>
              )}
              {currentStep === 4 && !quickMode && isCheckoutType && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Ghi đồ cần thay & mức bẩn</p>
                  <p className="text-xs mt-0.5">Ghi rõ đồ nào cần <strong>giặt, thay, bổ sung</strong> và chọn mức bẩn của phòng. Ca sau sẽ nhận phiếu này và mang đồ đến dọn.</p>
                </div>
              )}

              {/* Step 2: Items Check - Phase 1 for checkout, DeliveryItems for delivery, regular for others */}
              {currentStep === 2 && !quickMode && isDeliveryType && distributionOrderId && roomOrderId && (
                <div className="space-y-6">
                  <DeliveryItemsStep
                    distributionOrderId={distributionOrderId}
                    roomOrderId={roomOrderId}
                    form={form}
                    roomId={id!}
                    hotelId={room.hotel_id}
                    tenantId={room.tenant_id}
                  />
                  <CleaningRequestStep form={form} mode="checkout" />
                </div>
              )}
              {currentStep === 2 && !quickMode && isCheckoutType && (
                <ItemsCheckStep 
                  form={form} 
                  items={items} 
                  roomId={id!}
                  hotelId={room.hotel_id}
                  tenantId={room.tenant_id}
                  bookingId={currentBooking?.id || null}
                  checkType={watchedCheckType as 'daily' | 'checkin' | 'checkout' | 'maintenance'}
                  phase={1}
                  onQuantitiesChange={setItemQuantities}
                />
              )}

              {/* Step 2 for Daily/Maintenance/Checkin: Items Check + Cleaning Assessment */}
              {currentStep === 2 && !quickMode && !isCheckoutType && !isDeliveryType && !isReplenishType && (
                <div className="space-y-6">
                  <ItemsCheckStep 
                    form={form} 
                    items={items} 
                    roomId={id!}
                    hotelId={room.hotel_id}
                    tenantId={room.tenant_id}
                    bookingId={currentBooking?.id || null}
                    checkType={watchedCheckType as 'daily' | 'checkin' | 'checkout' | 'maintenance'}
                    onQuantitiesChange={setItemQuantities}
                  />
                  {watchedCheckType === 'daily' && (
                    <CleaningRequestStep form={form} mode="daily" />
                  )}
                </div>
              )}
              {/* Step 3 for Checkout: Phase 1 Confirm with Chargeable Items */}
              {currentStep === 3 && !quickMode && isCheckoutType && (
                <div className="space-y-6">
                  {/* Chargeable items selection */}
                  {currentBooking && (
                    <ChargeableItemsStep
                      hotelId={room.hotel_id}
                      bookingId={currentBooking.id}
                      roomId={id!}
                      onItemsChange={setChargeableItems}
                      notes={chargeableNotes}
                      onNotesChange={setChargeableNotes}
                    />
                  )}
                  {/* Phase 1 confirmation */}
                  <Phase1ConfirmStep
                    chargeableItems={chargeableItems}
                    lostItems={(form.getValues('items_lost') || []) as LostItem[]}
                    damagedItems={(form.getValues('items_damaged') || []) as DamagedItem[]}
                    roomNumber={room.room_number}
                    guestName={currentBooking?.guest_name}
                    onSubmitPhase1={handlePhase1Submit}
                    onContinue={() => setCurrentStep(4)}
                    isSubmitting={isSubmittingPhase1}
                    phase1Submitted={phase1Submitted}
                  />
                </div>
              )}
              {/* Step 4 (cuối) for Checkout: Phase 2 Items (bổ sung/giặt/thay) + Mức bẩn (gộp).
                  Bấm "Hoàn thành" sẽ mở dialog xác nhận tạo phiếu cho ca sau. */}
              {currentStep === 4 && !quickMode && isCheckoutType && (
                <div className="space-y-6">
                  <ItemsCheckStep 
                    form={form} 
                    items={items} 
                    roomId={id!}
                    hotelId={room.hotel_id}
                    tenantId={room.tenant_id}
                    bookingId={currentBooking?.id || null}
                    checkType={watchedCheckType as 'daily' | 'checkin' | 'checkout' | 'maintenance'}
                    phase={2}
                    onQuantitiesChange={setItemQuantities}
                  />
                  <CleaningRequestStep form={form} mode="checkout" />
                </div>
              )}
              {/* Review Step - adjusts based on check type */}
              {((currentStep === 2 && quickMode) || 
                (currentStep === 3 && !isCheckoutType && !isDeliveryType && !isReplenishType) ||
                (currentStep === 3 && (isDeliveryType || isReplenishType))) && (
                <ReviewStep form={form} room={room} checkType={watchedCheckType as CheckType} currentBooking={currentBooking} />
              )}
              
              <div className="sticky bottom-0 z-10 bg-background border-t p-3 -mx-2 md:relative md:mx-0 md:p-0 md:pt-6 md:border-t">
                <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {currentStep > 1
                    && !(currentStep === 2 && shouldAutoSkip)
                    && !(currentStep === 4 && isCheckoutType && phase1Submitted) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBack}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Quay lại
                    </Button>
                  )}
                </div>
                
                {currentStep < totalSteps ? (
                  // Hide "Tiếp theo" on Step 3 checkout when Phase 1 not yet submitted
                  (currentStep === 3 && isCheckoutType && !phase1Submitted) ? null : (
                    <Button type="button" onClick={handleNext}>
                      Tiếp theo
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  )
                ) : (
                  <Button 
                    type="button"
                    onClick={() => {
                      // Validate form trước khi mở dialog
                      form.trigger().then((isValid) => {
                        if (isValid) {
                          const checkTypeVal = form.getValues('check_type')
                          const damagedCount = form.getValues('items_damaged')?.length || 0
                          const missingCount = form.getValues('items_missing')?.length || 0
                          const checkTypeConf = getCheckTypeConfig(checkTypeVal)
                          
                          // Check-in: Cảnh báo nếu phòng chưa sẵn sàng
                          if (checkTypeConf.blockOnDamaged && (damagedCount > 0 || missingCount > 0)) {
                            setShowCheckinBlockDialog(true)
                          } else {
                            setShowSubmitDialog(true)
                          }
                        } else {
                          toast({
                            title: 'Chưa hợp lệ',
                            description: 'Vui lòng kiểm tra lại các trường bắt buộc trước khi hoàn thành.',
                            variant: 'destructive',
                          })
                        }
                      })
                    }}
                    disabled={createCheck.isPending || isSubmitting}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {(createCheck.isPending || isSubmitting) ? 'Đang lưu...' : 'Hoàn thành'}
                  </Button>
                )}
                </div>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
    </>
  )
}
