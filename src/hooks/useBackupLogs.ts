import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface BackupLog {
  id: string
  tenant_id: string
  backup_type: string
  backup_scope: string[]
  status: string
  file_path: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  error_message: string | null
  created_at: string
  completed_at: string | null
  created_by: string | null
}

export const useBackupLogs = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['backup-logs', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data as BackupLog[]
    },
    enabled: !!tenantId,
  })
}

export const useLatestBackup = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['latest-backup', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data as BackupLog | null
    },
    enabled: !!tenantId,
  })
}
