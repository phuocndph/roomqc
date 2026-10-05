import { ReactNode } from 'react';

interface AutoLoginGateProps {
  children: ReactNode;
}

/**
 * Supabase's persisted refresh token already restores PWA sessions securely.
 * The old implementation attempted to read a plaintext local credential,
 * which is intentionally no longer stored. Keep this wrapper for compatibility
 * with existing routes while making it a transparent render gate.
 */
export const AutoLoginGate = ({ children }: AutoLoginGateProps) => <>{children}</>;

export default AutoLoginGate;
