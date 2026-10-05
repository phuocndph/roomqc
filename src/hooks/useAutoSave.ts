import { useEffect, useRef, useCallback } from 'react'
import { useToast } from './use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

interface UseAutoSaveOptions<T> {
  data: T
  onSave: (data: T) => Promise<void>
  delay?: number
  enabled?: boolean
}

export function useAutoSave<T>({ 
  data, 
  onSave, 
  delay = 2000,
  enabled = true 
}: UseAutoSaveOptions<T>) {
  const { toast } = useToast()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const previousDataRef = useRef<T>(data)
  const isSavingRef = useRef(false)

  const save = useCallback(async () => {
    if (isSavingRef.current || !enabled) return

    try {
      isSavingRef.current = true
      await onSave(data)
      previousDataRef.current = data
      
      toast({
        title: 'Đã lưu tự động',
        description: 'Thay đổi đã được lưu',
        duration: 2000,
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi lưu tự động',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      isSavingRef.current = false
    }
  }, [data, onSave, enabled, toast])

  useEffect(() => {
    if (!enabled) return

    // Check if data has changed
    if (JSON.stringify(data) !== JSON.stringify(previousDataRef.current)) {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        save()
      }, delay)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [data, delay, enabled, save])

  return {
    isSaving: isSavingRef.current,
    triggerSave: save,
  }
}
