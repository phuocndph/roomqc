import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, toNamespacedPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { validateMobileEnvironment } from './mobile-config.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
process.chdir(project);
const command = process.argv[2] || 'doctor';
const local = process.argv.includes('--local');
// Prefer an explicitly configured toolchain, otherwise reuse the portable one.
if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
  const portable = join(process.env.LOCALAPPDATA, 'RoomQCBuild');
  if (!process.env.JAVA_HOME && existsSync(join(portable, 'jdk/bin/java.exe'))) process.env.JAVA_HOME = join(portable, 'jdk');
  if (!process.env.ANDROID_HOME && existsSync(join(portable, 'android-sdk'))) process.env.ANDROID_HOME = join(portable, 'android-sdk');
  if (process.env.JAVA_HOME) process.env.PATH = `${join(process.env.JAVA_HOME, 'bin')};${process.env.PATH}`;
}
const markerPath = resolve(project, 'dist-mobile/mobile-build.json');
const cap = resolve(project, 'node_modules/@capacitor/cli/bin/capacitor');
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { cwd: project, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with ${result.status}.`);
};
function copyNativeTree(source, destination) {
  mkdirSync(toNamespacedPath(destination), { recursive: true });
  for (const entry of readdirSync(toNamespacedPath(source), { withFileTypes: true })) {
    if (['build', '.gradle', '.idea', 'node_modules'].includes(entry.name)) continue;
    const from = join(source, entry.name), to = join(destination, entry.name);
    if (entry.isDirectory()) copyNativeTree(from, to);
    else if (entry.isFile()) copyFileSync(toNamespacedPath(from), toNamespacedPath(to));
  }
}
function readMarker() {
  if (!existsSync(markerPath)) throw new Error('Build mobile assets first: npm run mobile:build (or mobile:build:local).');
  return JSON.parse(readFileSync(markerPath, 'utf8'));
}
function verify(release = false) {
  const marker = readMarker();
  if (marker.format !== 1 || typeof marker.localDevelopment !== 'boolean') throw new Error('Invalid mobile build marker.');
  validateMobileEnvironment({ VITE_ROOMQC_PUBLIC_WEB_URL: marker.publicWebOrigin,
    VITE_SUPABASE_URL: marker.supabaseOrigin, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_verified_build',
    VITE_ROOMQC_CLUSTER_ORIGINS: marker.clusterOrigins.join(',') }, { local: marker.localDevelopment });
  if (release && marker.localDevelopment) throw new Error('Local HTTP builds cannot be released. Rebuild using real public HTTPS endpoints.');
  const html = readFileSync(resolve(project, 'dist-mobile/index.html'), 'utf8');
  if (/__ROOMQC_|registerSW\.js|src\/main\.tsx/.test(html)) throw new Error('Mobile HTML contains unresolved placeholders or service-worker registration.');
  if (!html.includes('Content-Security-Policy') || !html.includes(marker.supabaseOrigin)) throw new Error('Missing backend CSP allowlist.');
  if (release) {
    for (const [directory, configPath] of [
      ['android/app/src/main/assets/public', 'android/app/src/main/assets/capacitor.config.json'],
      ['ios/App/App/public', 'ios/App/App/capacitor.config.json'],
    ]) {
      const copiedMarker = JSON.parse(readFileSync(resolve(project, directory, 'mobile-build.json'), 'utf8'));
      if (JSON.stringify(copiedMarker) !== JSON.stringify(marker)) throw new Error('Native assets are stale. Run npm run mobile:sync after building.');
      const config = JSON.parse(readFileSync(resolve(project, configPath), 'utf8'));
      if (config.server?.url || config.server?.cleartext || config.android?.allowMixedContent
        || config.android?.webContentsDebuggingEnabled || config.ios?.webContentsDebuggingEnabled) throw new Error('Unsafe native release config. Rebuild and sync with HTTPS endpoints.');
    }
  }
  console.log(`Mobile assets verified (${marker.localDevelopment ? 'INTERNAL TEST ONLY' : 'HTTPS endpoints'}).`);
  return marker;
}
try {
  if (command === 'build') {
    const env = { ...loadEnv('mobile', project, ''), ...process.env };
    if (process.argv.includes('--emulator')) {
      if (!local) throw new Error('--emulator requires --local.');
      const url = new URL(env.VITE_SUPABASE_URL);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('--emulator only maps an existing loopback backend, never a remote backend.');
      url.hostname = '10.0.2.2';
      env.VITE_SUPABASE_URL = url.origin;
      env.VITE_ROOMQC_CLUSTER_ORIGINS = url.origin;
      env.VITE_ROOMQC_PUBLIC_WEB_URL = 'http://10.0.2.2:8082';
      env.VITE_ROOMQC_DIRECTORY_ENABLED = 'false';
      env.VITE_ENABLE_DEMO_DATA = 'false';
      console.log('Internal Android-emulator build: direct local backend; workspace directory disabled for this artifact.');
    }
    const marker = validateMobileEnvironment(env, { local });
    // Override only public VITE_* config; Vite never receives signing/admin secrets.
    for (const [key, value] of Object.entries(env)) if (key.startsWith('VITE_')) process.env[key] = value;
    process.env.VITE_ROOMQC_NATIVE = 'true';
    process.env.VITE_ROOMQC_MOBILE_LOCAL = String(local);
    process.env.VITE_ENABLE_DEMO_DATA = 'false';
    process.env.NODE_ENV = 'production';
    await build({ mode: 'mobile', build: { outDir: 'dist-mobile', emptyOutDir: true } });
    writeFileSync(markerPath, JSON.stringify({ format: 1, ...marker, builtAt: new Date().toISOString() }, null, 2));
    verify();
  } else if (command === 'sync') {
    verify();
    run(process.execPath, [cap, 'sync', ...(process.platform === 'darwin' ? [] : ['android'])]);
    // SPM project/plugin generation works on Windows too. Compilation needs macOS.
    if (process.platform !== 'darwin') run(process.execPath, [cap, 'sync', 'ios']);
  } else if (command === 'verify') {
    verify(process.argv.includes('--release'));
  } else if (command === 'apk') {
    verify();
    run(process.execPath, [cap, 'sync', 'android']);
    let android = resolve(project, 'android');
    if (process.platform === 'win32' && /[^\x00-\x7F]/.test(project)) {
      // Android tooling on Windows rejects non-ASCII project paths. Copy only
      // native sources/plugins and public assets into a separate build directory.
      const buildRoot = join(process.env.LOCALAPPDATA, 'RoomQCBuild');
      mkdirSync(buildRoot, { recursive: true });
      const stage = mkdtempSync(join(buildRoot, 'roomqc-android-'));
      copyNativeTree(android, join(stage, 'android'));
      const dependencies = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')).dependencies;
      for (const name of Object.keys(dependencies)) {
        if ((name.startsWith('@capacitor/') || name.startsWith('@aparajita/'))
          && (name === '@capacitor/android' || existsSync(resolve(project, 'node_modules', name, 'android')))) {
          copyNativeTree(resolve(project, 'node_modules', name), join(stage, 'node_modules', name));
        }
      }
      android = join(stage, 'android');
      console.log(`Using ASCII Android build directory: ${android}`);
    }
    if (process.platform === 'win32') {
      const portableGradle = join(process.env.LOCALAPPDATA, 'RoomQCBuild/gradle-8.14.3/bin/gradle.bat');
      if (existsSync(portableGradle)) run('cmd.exe', ['/d', '/c', portableGradle, 'assembleDebug', '--no-daemon'], { cwd: android });
      else run('java', ['-classpath', join(android, 'gradle/wrapper/gradle-wrapper.jar'),
        'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug', '--no-daemon'], { cwd: android });
    } else run('sh', ['./gradlew', 'assembleDebug', '--no-daemon'], { cwd: android });
    const destination = resolve(project, 'artifacts/mobile');
    mkdirSync(destination, { recursive: true });
    copyFileSync(resolve(android, 'app/build/outputs/apk/debug/app-debug.apk'), resolve(destination, 'roomqc-debug.apk'));
    console.log('Internal test APK: artifacts/mobile/roomqc-debug.apk');
  } else if (command === 'doctor') {
    console.log(`Node: ${process.version}; OS: ${process.platform}`);
    console.log(`Android source: ${existsSync(resolve(project, 'android/app/build.gradle')) ? 'ready' : 'missing'}`);
    console.log(`iOS source: ${existsSync(resolve(project, 'ios/App/App/Info.plist')) ? 'ready' : 'missing'}`);
    console.log(`Mobile assets: ${existsSync(markerPath) ? 'built' : 'not built'}`);
    const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
    console.log(java.error ? 'JDK 21: missing (required to build Android APK)' : java.stderr.trim());
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    console.log(`Android SDK: ${sdk && existsSync(sdk) ? sdk : 'not configured; install Android Studio / set ANDROID_HOME'}`);
    console.log(process.platform === 'darwin' ? 'iOS: use Xcode 26+ and your signing team.' : 'iOS compilation requires macOS + Xcode; source generation works here.');
  } else throw new Error(`Unknown mobile command: ${command}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
