import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const buildRoot = join(process.env.LOCALAPPDATA || '', 'RoomQCBuild');
const sdk = process.env.ANDROID_HOME || join(buildRoot, 'android-sdk');
const adb = join(sdk, 'platform-tools/adb.exe');
const emulator = join(sdk, 'emulator/emulator.exe');
const serial = 'emulator-5556';
const avd = 'RoomQC_API_36';
function run(args, { optional = false } = {}) {
  const result = spawnSync(adb, args, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (!optional && (result.error || result.status !== 0)) throw new Error(result.error?.message || result.stderr || `adb failed: ${args[0]}`);
  return result.stdout?.trim() || '';
}
try {
  if (process.platform !== 'win32') throw new Error('This launcher targets the Windows portable emulator.');
  if (!existsSync(emulator) || !existsSync(adb)) throw new Error('Run scripts/setup-mobile-emulator.ps1 first.');
  const apk = resolve(project, 'artifacts/mobile/roomqc-debug.apk');
  if (!existsSync(apk)) throw new Error('Build an APK first: npm run mobile:apk');
  const marker = JSON.parse(readFileSync(resolve(project, 'dist-mobile/mobile-build.json'), 'utf8'));
  if (!marker.localDevelopment || marker.supabaseOrigin !== 'http://10.0.2.2:54321') {
    throw new Error('This launcher expects the local Android-emulator build. Rebuild with mobile:build:local -- --emulator, then mobile:apk.');
  }
  const available = spawnSync(emulator, ['-list-avds'], { encoding: 'utf8', windowsHide: true });
  if (!available.stdout?.split(/\r?\n/).includes(avd)) throw new Error('Run scripts/setup-mobile-emulator.ps1 to create the RoomQC AVD.');
  run(['start-server']);
  const devices = run(['devices']);
  if (new RegExp(`^${serial}\\s`, 'm').test(devices)) {
    const name = run(['-s', serial, 'emu', 'avd', 'name']);
    // Emulator console emits CRCRLF on Windows, unlike ordinary adb output.
    if (name.split(/[\r\n]+/)[0].trim() !== avd) throw new Error('Port 5556 belongs to another emulator; it was left untouched.');
  } else {
    const artifacts = resolve(project, 'artifacts/mobile');
    mkdirSync(artifacts, { recursive: true });
    const output = openSync(join(artifacts, 'emulator-stdout.log'), 'a');
    const errors = openSync(join(artifacts, 'emulator-stderr.log'), 'a');
    const child = spawn(emulator, ['-avd', avd, '-port', '5556', '-memory', '3072', '-cores', '4', '-gpu', 'auto', '-no-boot-anim', '-no-audio', ...(process.argv.includes('--cold') ? ['-no-snapshot-load'] : [])], {
      detached: true, windowsHide: true, stdio: ['ignore', output, errors], env: { ...process.env, ANDROID_HOME: sdk },
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.unref(); closeSync(output); closeSync(errors);
    console.log('Starting the RoomQC Android emulator. First boot may take a few minutes.');
  }
  const deadline = Date.now() + 300000;
  let ready = false;
  while (Date.now() < deadline) {
    if (run(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { optional: true }) === '1') { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error('Emulator did not finish booting. See artifacts/mobile/emulator-stderr.log.');
  console.log(run(['-s', serial, 'install', '-r', apk]));
  console.log(run(['-s', serial, 'shell', 'am', 'start', '-n', 'com.roomqc.app/.MainActivity']));
  console.log('RoomQC is open. Keep local Supabase running. No production data or other emulators were changed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
