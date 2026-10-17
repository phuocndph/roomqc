import { workspaceBase, workspacePath } from '@/lib/workspace';
import { isNativeApp, nativePublicOrigin } from '@/lib/native/platform';
/**
 * Get the correct public URL for QR payments that bypasses Auth Bridge
 * 
 * Preview domains:
 * - *.lovableproject.com (has Auth Bridge - blocked)
 * - id-preview--*.lovable.app (no Auth Bridge - works!)
 * 
 * Live domains:
 * - *.lovable.app (no Auth Bridge - works!)
 */
export function getPublicBaseUrl(): string {
  const origin = isNativeApp() ? nativePublicOrigin() : window.location.origin;
  
  // Check if we're on Preview domain with Auth Bridge
  // Pattern: {project-id}.lovableproject.com
  const lovableProjectMatch = origin.match(
    /^https:\/\/([a-f0-9-]+)\.lovableproject\.com$/
  );
  
  if (lovableProjectMatch) {
    // Convert to id-preview--{project-id}.lovable.app format
    const projectId = lovableProjectMatch[1];
    return `https://id-preview--${projectId}.lovable.app${workspaceBase()}`;
  }
  
  // For all other domains (Live, custom), use as-is
  return `${origin}${workspaceBase()}`;
}

export function buildPublicUrl(path: string): string {
  const base = getPublicBaseUrl();
  return new URL(workspacePath(path), new URL(base).origin).toString();
}
