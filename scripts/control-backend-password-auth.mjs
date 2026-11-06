// Build-only extension. No runtime env, fixture identities or secrets enter
// the build context. Pinned vendor source, builder and runtime are immutable.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const passwordAuthCommit='4eee58f296d9698a1c2c0ae14d7a0b379c7622d3';
// Timestamp of that exact upstream commit, not the local checkout/build clock.
export const passwordAuthSourceDateEpoch=1788964129;
export const passwordAuthPlatform='linux/amd64';
export async function preparePasswordAuth({repository,root,privateRun,noCache=false}) {
  assert.equal(typeof noCache,'boolean');
  const source=join(root,'password-auth-source');
  await privateRun('git',['clone','--depth','1','--branch','v2.197.0','https://github.com/supabase/auth.git',source],{timeout:180000});
  assert.equal((await privateRun('git',['rev-parse','HEAD'],{cwd:source})).stdout.trim(),passwordAuthCommit);
  assert.equal((await privateRun('git',['show','-s','--format=%ct','HEAD'],{cwd:source})).stdout.trim(),String(passwordAuthSourceDateEpoch));
  const paths=['Dockerfile','roomqc_password.go','roomqc_password_test.go'],sources=[];
  for(const file of paths) {
    const data=await readFile(join(repository,'deploy','auth','password-guard',file));
    const dest=file==='Dockerfile'?join(source,'Dockerfile.roomqc'):join(source,'internal','api',file);
    await writeFile(dest,data,{flag:'wx'});
    sources.push({path:'deploy/auth/password-guard/'+file,sha256:createHash('sha256').update(data).digest('hex')});
  }
  const file=join(source,'internal','api','user.go'),original=await readFile(file,'utf8');
  let modified=original;
  const replace=(before,after)=>{assert.equal(modified.split(before).length,2,'Exact pinned GoTrue patch point');modified=modified.replace(before,after)};
  replace('type UserUpdateParams struct {','type UserUpdateParams struct {\n\tRoomQCPasswordChangeID string `json:"roomqc_password_change_id,omitempty"`');
  replace('\t// must be captured before setting password below (via user.SetPassword)',
    '\troomQCPreviousPassword := ""\n\tif user.EncryptedPassword != nil { roomQCPreviousPassword = *user.EncryptedPassword }\n'+
    '\tvar roomQCChangeID uuid.UUID\n\tif params.Password != nil {\n'+
    '\t\tif !config.Security.UpdatePasswordRequireCurrentPassword || config.AuditLog.DisablePostgres {\n'+
    '\t\t\treturn apierrors.NewHTTPError(http.StatusServiceUnavailable, apierrors.ErrorCode("password_change_guard_unavailable"), "Password change configuration unavailable")\n\t\t}\n'+
    '\t\tvar roomQCErr error\n\t\troomQCChangeID, roomQCErr = roomQCPasswordChangeID(params.RoomQCPasswordChangeID)\n'+
    '\t\tif roomQCErr != nil { return roomQCErr }\n\t}\n\n\t// must be captured before setting password below (via user.SetPassword)');
  replace('\t\t\tif terr = user.UpdatePassword(tx, sessionID); terr != nil {',
    '\t\t\tif terr = roomQCPasswordGuard(tx, false, user.ID, sessionID, roomQCPreviousPassword, roomQCChangeID); terr != nil { return terr }\n'+
    '\t\t\tif terr = user.UpdatePassword(tx, sessionID); terr != nil {');
  replace('\t\t\t// this is the first time a user sets a password on their account',
    '\t\t\tif terr = roomQCPasswordGuard(tx, true, user.ID, sessionID, roomQCPreviousPassword, roomQCChangeID); terr != nil { return terr }\n\n'+
    '\t\t\t// this is the first time a user sets a password on their account');
  await writeFile(file,modified);
  // Explicitly exclude VCS data; the image contains only the reviewed source.
  await writeFile(join(source,'.dockerignore'),'.git\n');
  const sourceHash=createHash('sha256').update(JSON.stringify({commit:passwordAuthCommit,
    sourceDateEpoch:passwordAuthSourceDateEpoch,platform:passwordAuthPlatform,rewriteTimestamp:true,sources,modified})).digest('hex');
  const tag='roomqc/gotrue:password-guard-'+sourceHash.slice(0,16);
  await privateRun('docker',['build','--platform',passwordAuthPlatform,'--provenance=false',
    '--output','type=image,rewrite-timestamp=true,unpack=false',
    '--build-arg','SOURCE_DATE_EPOCH='+passwordAuthSourceDateEpoch,...(noCache?['--no-cache']:[]),
    '--file',join(source,'Dockerfile.roomqc'),'--tag',tag,
    '--label','roomqc.password-auth.source='+sourceHash,source],{timeout:1200000});
  const info=JSON.parse((await privateRun('docker',['image','inspect',tag])).stdout)[0];
  assert.equal(info.Config.Labels?.['roomqc.password-auth.source'],sourceHash);
  assert.match(info.Id,/^sha256:[a-f0-9]{64}$/);
  assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
  assert.equal(Date.parse(info.Created),passwordAuthSourceDateEpoch*1000,'Build clock must not change the reviewed image');
  const binary=(await privateRun('docker',['run','--rm','--read-only','--network','none',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--label','roomqc.password-auth.verify='+sourceHash,
    '--entrypoint','sha256sum',info.Id,'/usr/local/bin/auth'])).stdout;
  const binarySha256=binary.match(/^([a-f0-9]{64})\s+\/usr\/local\/bin\/auth\s*$/)?.[1];
  assert.ok(binarySha256,'Read-only image binary checksum required');
  return {tag,imageId:info.Id,sourceHash,upstreamCommit:passwordAuthCommit,sources,
    sourceDateEpoch:passwordAuthSourceDateEpoch,platform:passwordAuthPlatform,
    imageCreated:info.Created,binarySha256,rootFsLayers:info.RootFS.Layers,rewriteTimestamp:true,
    configSha256:createHash('sha256').update(JSON.stringify(info.Config)).digest('hex'),
    originalUserSourceHash:createHash('sha256').update(original).digest('hex'),
    patchedUserSourceHash:createHash('sha256').update(modified).digest('hex'),guardAlwaysEnabled:true,
    goTests:'go test ./internal/api -run ^TestRoomQCPassword -count=1',notUpstreamFullTestSuite:true};
}
