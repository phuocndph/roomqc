import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdmin } from '@/lib/userAccess';

/**
 * Authentication hook specifically for Super Admin routes
 * Uses useUser() to get database user with user_level_code
 * Redirects non-super-admin users to home page
 */
export function useSuperAdminAuth() {
  const { loading: authLoading, signOut: authSignOut } = useAuth();
  const { user, isLoading: userLoading } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isLoading = authLoading || userLoading;
  const isSuperAdminUser = isSuperAdmin(user);

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
      navigate('/auth/login');
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
  }, [user, isLoading, isSuperAdminUser, navigate, toast]);

  const signOut = useCallback(async () => {
    await authSignOut();
    navigate('/auth/login');
  }, [authSignOut, navigate]);

  return { 
    user, 
    isLoading,
    signOut,
    isSuperAdmin: isSuperAdminUser,
  };
}
