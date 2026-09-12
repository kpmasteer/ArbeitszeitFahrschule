import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'de.fahrschulzeit.app',
  appName: 'FahrschulKalender',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
