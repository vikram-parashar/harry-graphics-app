import type { ExpoConfig, ConfigContext } from 'expo/config'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'YOUR-ANON-KEY'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Harry Graphics',
  slug: 'harry-graphics-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/logo.png',
  scheme: 'harrygraphics',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.harrygraphics.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/logo.png',
      backgroundColor: '#F5F1E8',
    },
    package: 'com.harrygraphics.app',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/logo.svg'
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    tsconfigPaths: true,
  },
  extra: {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_KEY,
    eas: {
      "projectId": "53d3623d-cfc3-40e0-9a25-8541719e5d5e"
    },
  },
})
