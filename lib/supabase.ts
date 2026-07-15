import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY as string

const expoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

console.log(supabaseUrl, supabaseKey, 'dfja')
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: expoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export const SUPABASE_URL = supabaseUrl

export const STORAGE_BUCKET = 'id-project-data'

export function getOAuthRedirectUrl(): string {
  if (Platform.OS === 'web') {
    return `${window.location.origin}/auth/callback`
  }
  return process.env.EXPO_PUBLIC_OAUTH_REDIRECT ?? 'harrygraphics://auth-callback'
}
