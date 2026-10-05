// Extend window interface for PasswordCredential API
declare global {
  interface Window {
    PasswordCredential: new (data: { id: string; password: string; name?: string }) => Credential;
  }
}

const LEGACY_STORAGE_KEY = 'app_saved_credential_v1';
const LOGGED_OUT_FLAG = 'app_user_logged_out_v1';

/**
 * SECURITY: We no longer persist plaintext passwords (even XOR-obfuscated) in
 * localStorage. Auto-login for PWA relies on the Supabase refresh token that
 * supabase-js already keeps in storage, plus the browser's native
 * PasswordCredential API (Chrome/Edge desktop) when available.
 *
 * Any legacy payload left over from older builds is purged on first call.
 */
function purgeLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Save credential.
 *   - Never persists the raw password to localStorage.
 *   - Hands password to the browser's native PasswordCredential API when
 *     supported (so the OS/browser password manager can resume sessions).
 *   - Clears the "explicitly logged out" flag so PWA auto-login can resume.
 */
export async function storeCredential(email: string, password: string): Promise<boolean> {
  purgeLegacy();

  try {
    localStorage.removeItem(LOGGED_OUT_FLAG);
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined' && 'PasswordCredential' in window) {
    try {
      const credential = new window.PasswordCredential({
        id: email,
        password,
        name: email,
      });
      await navigator.credentials.store(credential);
    } catch (error) {
      console.warn('[Credential] Native store failed (non-fatal):', error);
    }
  }

  return true;
}

/**
 * Legacy API kept for backwards compatibility.
 * We no longer persist plaintext passwords, so this always returns null.
 * Callers should rely on supabase.auth.getSession() / refreshSession() for
 * resuming sessions, and getStoredCredential() for native browser autofill.
 */
export function getLocalCredential(): { email: string; password: string } | null {
  purgeLegacy();
  return null;
}

/**
 * Clear any locally cached credential state and mark explicit logout.
 */
export function clearLocalCredential(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(LOGGED_OUT_FLAG, '1');
  } catch {
    // ignore
  }
}

/**
 * User explicitly logged out in last session?
 */
export function wasExplicitlyLoggedOut(): boolean {
  try {
    return localStorage.getItem(LOGGED_OUT_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * Request stored credentials from browser native API (Chrome/Edge only).
 * Returns null if no credentials found or user cancels.
 */
export async function getStoredCredential(): Promise<{ email: string; password: string } | null> {
  if (typeof navigator === 'undefined' || !('credentials' in navigator)) {
    return null;
  }

  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    } as CredentialRequestOptions);

    if (credential && credential.type === 'password') {
      const pwdCred = credential as Credential & { id: string; password?: string };
      return {
        email: pwdCred.id,
        password: pwdCred.password || '',
      };
    }
  } catch (error) {
    console.warn('[Credential] Failed to get credentials:', error);
  }

  return null;
}
