import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.onlinedisasterrelief.app',
  appName: 'Online Disaster Relief',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
