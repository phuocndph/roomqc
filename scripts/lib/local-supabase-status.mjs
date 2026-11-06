import {execFileSync} from 'node:child_process';

// Local diagnostics only. The ephemeral path is opt-in so normal product
// commands never download or invoke a CLI implicitly.
export function readLocalSupabaseStatus(){
  const command=process.env.ROOMQC_USE_EPHEMERAL_SUPABASE_CLI==='1'
    ?process.platform==='win32'
      ?['cmd.exe',['/d','/s','/c','npx --yes supabase@3.0.0 status --output json']]
      :['npx',['--yes','supabase@3.0.0','status','--output','json']]
    :process.platform==='win32'
      ?['cmd.exe',['/d','/s','/c','npx --no-install supabase status --output json']]
      :['npx',['--no-install','supabase','status','--output','json']];
  const raw=execFileSync(command[0],command[1],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
  return JSON.parse(raw.slice(raw.indexOf('{')));
}
