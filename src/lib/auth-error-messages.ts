/**
 * Maps Supabase auth error messages to i18n translation keys
 */

const AUTH_ERROR_MAP: Record<string, string> = {
  // Login errors
  'Invalid login credentials': 'errors.invalidCredentials',
  'invalid_credentials': 'errors.invalidCredentials',
  
  // Email confirmation
  'Email not confirmed': 'errors.emailNotConfirmed',
  
  // User not found
  'User not found': 'errors.emailNotFound',
  
  // Registration errors
  'User already registered': 'errors.emailExists',
  
  // Password errors. Keep this specific: a generic message containing
  // "password" can also mean invalid credentials, not a weak password.
  'Password should be at least': 'errors.weakPassword',
  'Password must': 'errors.weakPassword',
  
  // Network errors
  'Failed to fetch': 'errors.networkError',
  'NetworkError': 'errors.networkError',
  'Load failed': 'errors.networkError',
  'fetch failed': 'errors.networkError',
  'Network request failed': 'errors.networkError',
  'ERR_NETWORK': 'errors.networkError',
  'ERR_CONNECTION_REFUSED': 'errors.networkError',
  'ECONNREFUSED': 'errors.networkError',
  'CORS': 'errors.networkError',
  
  // Rate limiting
  'For security purposes': 'errors.tooManyAttempts',
  'rate limit': 'errors.tooManyAttempts',
};

/**
 * Get the i18n translation key for a Supabase auth error message
 * @param errorMessage - The error message from Supabase
 * @returns The translation key to use with t()
 */
export function getAuthErrorKey(error: unknown): string {
  const authError = error && typeof error === 'object'
    ? error as { message?: unknown; name?: unknown; code?: unknown; status?: unknown }
    : null;
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : typeof authError?.message === 'string'
        ? authError.message
        : '';
  const name = typeof authError?.name === 'string' ? authError.name : '';
  const code = typeof authError?.code === 'string' ? authError.code : '';

  // Supabase uses AuthRetryableFetchError for transport failures. Check the
  // error metadata before matching text so a localized/changed message still
  // produces a useful retry hint.
  if (/retryablefetch|network|fetch/i.test(name) || /network|fetch|cors|connection/i.test(code)) {
    return 'errors.networkError';
  }

  if (!message) return 'errors.unknown';
  
  // Check exact match first
  if (AUTH_ERROR_MAP[message]) {
    return AUTH_ERROR_MAP[message];
  }
  
  // Check partial match (case-insensitive)
  const lowerMessage = message.toLowerCase();
  for (const [key, value] of Object.entries(AUTH_ERROR_MAP)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      return value;
    }
  }
  
  // Default fallback
  return 'errors.unknown';
}
