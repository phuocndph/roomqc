import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
import {importPKCS8,importSPKI,SignJWT,jwtVerify} from 'jose';
import {readSetupBackfillFile} from './setup-backfill-files.mjs';
import {validateRecoveryCredential} from './setup-recovery.mjs';
import {uuidPattern} from './errors.mjs';
import {exact} from './probe-secrets.mjs';

const invalid=code=>Object.assign(new Error(code),{code});
const sha=value=>createHash('sha256').update(value).digest('hex');
export const credentialCanonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const receiptFields=['commandId','operation','version','clusterId','bindingSha256','releaseSha256','credentialId',
  'affectedIds','historicalResult','predecessorId','overlapDeadline','iat','exp','signerAlgorithm','signerFingerprint'];

// Claims come exclusively from the committed, caller-scoped issue receipt.
// This check does not authenticate that receipt: the publisher re-reads it over
// the caller's narrow DB session before signing, and fences on live status.
export function credentialIssueReceipt(value,binding,{now=Date.now(),minimumValidityMs=10000}={}){
  if(!exact(value,receiptFields)||value.operation!=='issue'||value.historicalResult!==true
    ||!uuidPattern.test(value.commandId??'')||!uuidPattern.test(value.credentialId??'')
    ||!Number.isSafeInteger(value.version)||value.version<1||value.version>=9007199254740990
    ||value.clusterId!==binding.clusterId||value.bindingSha256!==binding.bindingHash||value.releaseSha256!==binding.releaseFingerprint
    ||!Array.isArray(value.affectedIds)||value.affectedIds.length!==1||value.affectedIds[0]!==value.credentialId
    ||value.predecessorId!==null&&!uuidPattern.test(value.predecessorId??'')
    ||value.predecessorId===null&&value.overlapDeadline!==null
    ||value.predecessorId!==null&&(typeof value.overlapDeadline!=='string'||!Number.isFinite(Date.parse(value.overlapDeadline)))
    ||!Number.isSafeInteger(value.iat)||!Number.isSafeInteger(value.exp)||!Number.isSafeInteger(value.exp*1000)
    ||value.exp-value.iat<120||value.exp-value.iat>3600||!Number.isFinite(now)
    ||!Number.isSafeInteger(minimumValidityMs)||minimumValidityMs<1000||minimumValidityMs>60000
    ||value.iat*1000>now+5000||value.exp*1000<=now+minimumValidityMs
    ||!['HS256','RS256','ES256'].includes(value.signerAlgorithm)||!/^[a-f0-9]{64}$/.test(value.signerFingerprint??''))
    throw invalid('SETUP_PUBLICATION_RECEIPT_INVALID');
  return Object.freeze(structuredClone(value));
}

export function credentialReceiptClaims(receipt){
  return {role:'roomqc_setup_recovery',aud:'authenticated',iss:'roomqc-setup-recovery/v1',jti:receipt.credentialId,
    cluster_id:receipt.clusterId,binding_sha256:receipt.bindingSha256,iat:receipt.iat,exp:receipt.exp};
}

/** The only retained signer object is in memory; no private key is returned.
 * HS256 pins SHA256(raw secret bytes), minimum 32 bytes. Asymmetric pins
 * SHA256(SPKI DER), RSA >=2048 bits or P-256, PKCS8 private PEM input. */
export async function loadCredentialReceiptSigner(config,receipt){
  try{
    if(!exact(config,['algorithm','fingerprint','keyFile','keyId'])||config.algorithm!==receipt.signerAlgorithm
      ||config.fingerprint!==receipt.signerFingerprint||config.keyId!==null&&
      (typeof config.keyId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(config.keyId)))throw invalid();
    const material=await readSetupBackfillFile(config.keyFile,16384);
    let signingKey,verificationKey,fingerprint;
    if(config.algorithm==='HS256'){
      const bytes=Buffer.from(material,'utf8');
      if(bytes.length<32||bytes.length>4096||/[\x00-\x1f\x7f]/.test(material))throw invalid();
      fingerprint=sha(bytes);signingKey=verificationKey=new Uint8Array(bytes);
    }else{
      if(!material.startsWith('-----BEGIN PRIVATE KEY-----'))throw invalid();
      const key=createPrivateKey(material),publicKey=createPublicKey(key),details=key.asymmetricKeyDetails;
      if(config.algorithm==='RS256'&&(key.asymmetricKeyType!=='rsa'||details.modulusLength<2048)
        ||config.algorithm==='ES256'&&(key.asymmetricKeyType!=='ec'||details.namedCurve!=='prime256v1'))throw invalid();
      fingerprint=sha(publicKey.export({type:'spki',format:'der'}));
      signingKey=await importPKCS8(material,config.algorithm);
      verificationKey=await importSPKI(publicKey.export({type:'spki',format:'pem'}),config.algorithm);
    }
    if(fingerprint!==config.fingerprint)throw invalid();
    const assertUnchanged=async()=>{
      if(sha(await readSetupBackfillFile(config.keyFile,16384))!==sha(material))throw invalid('SETUP_PUBLICATION_SIGNER_CHANGED');
    };
    const verify=async(value,binding,committed,{now=Date.now()}={})=>{
      try{
        validateRecoveryCredential(value,binding,{now});
        const {payload,protectedHeader}=await jwtVerify(value.token,verificationKey,{algorithms:[config.algorithm],
          issuer:'roomqc-setup-recovery/v1',audience:'authenticated',currentDate:new Date(now),clockTolerance:0});
        const header={alg:config.algorithm,typ:'JWT',...(config.keyId===null?{}:{kid:config.keyId})};
        if(credentialCanonical(payload)!==credentialCanonical(credentialReceiptClaims(committed))
          ||credentialCanonical(protectedHeader)!==credentialCanonical(header))throw invalid();
        return value;
      }catch{throw invalid('SETUP_PUBLICATION_TOKEN_INVALID')}
    };
    return Object.freeze({algorithm:config.algorithm,fingerprint,assertUnchanged,verify,
      async sign(committed,binding,publishableKey,{now=Date.now()}={}){
        await assertUnchanged();credentialIssueReceipt(committed,binding,{now});
        const token=await new SignJWT(credentialReceiptClaims(committed)).setProtectedHeader({alg:config.algorithm,typ:'JWT',
          ...(config.keyId===null?{}:{kid:config.keyId})}).sign(signingKey);
        return verify({version:1,clusterId:binding.clusterId,bindingSha256:binding.bindingHash,publishableKey,token},binding,committed,{now});
      }});
  }catch(error){if(error?.code==='SETUP_PUBLICATION_SIGNER_CHANGED')throw error;throw invalid('SETUP_PUBLICATION_SIGNER_INVALID')}
}
