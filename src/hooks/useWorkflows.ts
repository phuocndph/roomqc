import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface WorkflowCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in'
  value: any
}

export interface WorkflowAction {
  id?: string
  action_type: 'create_maintenance' | 'create_purchase_order' | 'create_transaction' | 'send_notification' | 'send_email' | 'update_record' | 'webhook' | 'wait' | 'conditional'
  action_config: Record<string, any>
  order_index: number
  continue_on_failure?: boolean
  max_retries?: number
  retry_delay_seconds?: number
}

export interface Workflow {
  id: string
  tenant_id: string
  name: string
  description?: string
  trigger_type: 'event' | 'schedule' | 'manual'
  trigger_event?: string
  trigger_schedule?: string
  conditions: WorkflowCondition[]
  status: 'active' | 'inactive' | 'error'
  last_run_at?: string
  last_run_status?: 'success' | 'failed'
  last_error?: string
  total_executions: number
  success_count: number
  failed_count: number
  created_by?: string
  created_at: string
  updated_at: string
  actions?: WorkflowAction[]
}

export const useWorkflows = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['workflows', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('workflows')
        .select(`
          *,
          actions:workflow_actions(*)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as Workflow[]
    },
    enabled: !!tenantId,
  })
}

export const useWorkflow = (id: string) => {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflows')
        .select(`
          *,
          actions:workflow_actions(*)
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as unknown as Workflow
    },
    enabled: !!id,
  })
}

export const useCreateWorkflow = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async ({ workflow, actions }: { workflow: Partial<Workflow>, actions: WorkflowAction[] }) => {
      // Create workflow
      const { data: workflowData, error: workflowError } = await supabase
        .from('workflows')
        .insert([{ ...workflow, tenant_id: tenantId } as any])
        .select()
        .single()

      if (workflowError) throw workflowError

      // Create actions
      if (actions && actions.length > 0) {
        const { error: actionsError } = await supabase
          .from('workflow_actions')
          .insert(
            actions.map((action, index) => ({
              workflow_id: workflowData.id,
              ...action,
              order_index: index,
            }))
          )

        if (actionsError) throw actionsError
      }

      return workflowData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Workflow created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create workflow')
    },
  })
}

export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, workflow, actions }: { id: string, workflow: Partial<Workflow>, actions?: WorkflowAction[] }) => {
      // Update workflow
      const { error: workflowError } = await supabase
        .from('workflows')
        .update(workflow as any)
        .eq('id', id)

      if (workflowError) throw workflowError

      // Update actions if provided
      if (actions) {
        // Delete existing actions
        const { error: deleteError } = await supabase
          .from('workflow_actions')
          .delete()
          .eq('workflow_id', id)

        if (deleteError) throw deleteError

        // Insert new actions
        if (actions.length > 0) {
          const { error: insertError } = await supabase
            .from('workflow_actions')
            .insert(
              actions.map((action, index) => ({
                workflow_id: id,
                ...action,
                order_index: index,
              }))
            )

          if (insertError) throw insertError
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['workflow'] })
      toast.success('Workflow updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update workflow')
    },
  })
}

export const useDeleteWorkflow = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Workflow deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete workflow')
    },
  })
}

export const useToggleWorkflow = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string, status: 'active' | 'inactive' }) => {
      const { error } = await supabase
        .from('workflows')
        .update({ status })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Workflow status updated')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update workflow status')
    },
  })
}

export const useWorkflowExecutions = (workflowId: string) => {
  return useQuery({
    queryKey: ['workflow-executions', workflowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('started_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data
    },
    enabled: !!workflowId,
  })
}
