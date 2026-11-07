import type { CapacitorConfig } from '@capacitor/cli'
import { existsSync, readFileSync } from 'node:fs'
import { KeyboardResize } from '@capacitor/keyboard'

const marker = 'dist-mobile/mobile-build.json'
const localDevelopment = existsSync(marker) && JSON.parse(readFileSync(marker, 'utf8')).localDevelopment === true

const config: CapacitorConfig = {
  appId: 'com.roomqc.app',
  appName: 'RoomQC',
  webDir: 'dist-mobile',
  backgroundColor: '#ffffff',
  loggingBehavior: 'debug',
  // Bundle the UI in the app; never load a remote website via server.url.
  server: { androidScheme: 'https', cleartext: localDevelopment },
  android: { allowMixedContent: localDevelopment },
  ios: { contentInset: 'never', preferredContentMode: 'mobile', allowsLinkPreview: false },
  plugins: {
    Keyboard: { resize: KeyboardResize.Body, resizeOnFullScreen: true },
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
}

export default config
