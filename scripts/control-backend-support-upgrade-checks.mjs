import {runSupportUpgradePhase} from '/control/testing/setup-support-upgrade-native.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_SUPPORT_UPGRADE_INPUT??'null');
try{console.log(JSON.stringify(await runSupportUpgradePhase(input)))}
catch(error){process.stderr.write(String(error.stack)+'\n');console.log(JSON.stringify({verified:false,phase:input?.phase,
  errorCode:/^[A-Z0-9_]{3,80}$/.test(error?.code??'')?error.code:'OWNED_SUPPORT_UPGRADE_FAILED'}));process.exitCode=1}
