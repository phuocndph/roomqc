// Synthetic claim shapes only; these are NOT signed Supabase credentials.
import {randomBytes,randomUUID} from 'node:crypto';
export const syntheticToken=claims=>Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'
  +Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic-signature';
export function syntheticBundle({expiresIn=3600,userId=randomUUID(),sessionId=randomUUID(),refreshToken=randomBytes(32).toString('hex')}={}){
  const now=Math.floor(Date.now()/1000);
  return {credential:{publishableKey:'fixture-public',token:syntheticToken({role:'roomqc_control_probe',exp:now+86400})},
    auth:{token:syntheticToken({role:'authenticated',sub:userId,session_id:sessionId,exp:now+expiresIn}),refreshToken,userId,sessionId}};
}
export const syntheticRelease={clusterId:'cluster-a',releaseId:'fixture-v3',artifactDigest:'b'.repeat(64),frontendArtifactDigest:'c'.repeat(64),
  migrationSetHash:'d'.repeat(64),schemaManifestHash:'a'.repeat(64)};
