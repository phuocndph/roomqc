import { workspaceNext } from './workspace'

/** The platform entry has no hotel context; redirects still pass the same
 * internal-path and workspace checks as ordinary customer login. */
export function loginNextPath(search = window.location.search, pathname = window.location.pathname): string | null {
  return workspaceNext(new URLSearchParams(search).get('next'), pathname)
    ?? (pathname === '/admin/login' ? '/super-admin' : null)
}
