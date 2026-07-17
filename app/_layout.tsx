import '../global.css'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { setCurrentUserId } from '@/lib/storage'
import { Session } from '@supabase/supabase-js'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
      ; (async () => {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session)
        // Set user_id for storage scoping
        setCurrentUserId(data.session?.user?.id ?? null)
        setReady(true)
      })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Update user_id whenever auth state changes
      setCurrentUserId(s?.user?.id ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#F5F1E8',
          headerTitleStyle: { fontWeight: 'bold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#F5F1E8' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="projects"
          options={{ title: 'Projects', headerBackVisible: false }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="capture"
          options={{ title: 'Capture', headerShown: false }}
        />
        <Stack.Screen
          name="photo_gallery"
          options={{ title: 'Photo Gallery' }}
        />
        <Stack.Screen
          name="filter"
          options={{ title: 'Filter' }}
        />
      </Stack>
    </>
  )
}
