import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from './useUser';

interface ValidationResult {
  can_change: boolean;
  blockers: Array<{
    resource: string;
    current: number;
    limit: number;
    message: string;
  }>;
  warnings: Array<{
    resource: string;
    current_gb?: number;
    limit_gb?: number;
    message: string;
  }>;
}

export function useValidatePlanChange(newPlanId: string) {
  const { tenantId } = useUser();

  return useQuery({
    queryKey: ['validate-plan-change', tenantId, newPlanId],
    queryFn: async () => {
      if (!tenantId || !newPlanId) return null;

      const { data, error } = await supabase.rpc('validate_plan_change', {
        p_tenant_id: tenantId,
        p_new_plan_id: newPlanId,
      });

      if (error) throw error;
      return data as unknown as ValidationResult;
    },
    enabled: !!tenantId && !!newPlanId,
    staleTime: 30000, // 30 seconds
  });
}
