import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdmin } from '@/lib/userAccess';
import { staffInvitationSession } from '@/lib/staff-invitation';
import { directoryEnabled } from '@/lib/workspace';
import { runtimeConfig } from '@/lib/runtime-config';

/**
 * Authentication hook specifically for Super Admin routes
 * Uses useUser() to get database user with user_level_code
 * Redirects non-super-admin users to home page
 */
export function useSuperAdminAuth() {
  const { user: authUser, session, loading: authLoading, signOut: authSignOut } = useAuth();
  const { user: profile, isLoading: userLoading } = useUser();
  let correlated = false;
  try { correlated = !!authUser && staffInvitationSession(session).actorId === authUser.id; } catch { /* Incomplete session stays outside admin routes. */ }
  const user = correlated && profile?.id === authUser.id ? profile : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const loginPath = directoryEnabled && !runtimeConfig.workspace ? '/admin/login' : '/auth/login';

  const isLoading = authLoading || userLoading;
  const isSuperAdminUser = isSuperAdmin(user) && user.status === 'active' && !user.account_locked && !user.deleted_at;

  useEffect(() => {
    // Wait for both auth and user data to load
    if (isLoading) return;

    // Check if user exists
    if (!user) {
      toast({
        title: 'Yêu cầu đăng nhập',
        description: 'Vui lòng đăng nhập để truy cập cổng quản trị.',
        variant: 'destructive',
      });
      navigate(loginPath);
      return;
    }

    // Check if user is super admin
    if (!isSuperAdminUser) {
      toast({
        title: 'Truy cập bị từ chối',
        description: 'Bạn không có quyền truy cập cổng quản trị viên cấp cao.',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }
  }, [user, isLoading, isSuperAdminUser, navigate, toast, loginPath]);

  const signOut = useCallback(async () => {
    await authSignOut();
    navigate(loginPath);
  }, [authSignOut, navigate, loginPath]);

  return { 
    user, 
    isLoading,
    signOut,
    isSuperAdmin: isSuperAdminUser,
  };
}
