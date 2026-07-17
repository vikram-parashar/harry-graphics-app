import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import type { Session } from '@supabase/supabase-js'

/**
 * Screen 1 — Auth.
 *
 * Full-screen cream page with the Harry Graphics wordmark and a single
 * "GET STARTED" button that opens the AuthModal (ported from the web).
 *
 * If a session is already active (e.g. secure-store had one), we skip
 * straight to /projects.
 */
export default function AuthScreen() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let mounted = true
      ; (async () => {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session)
        setChecking(false)
        if (data.session) router.replace('/projects')
      })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) {
        setModalOpen(false)
        router.replace('/projects')
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <View className="flex-1 bg-cream">
      {/* Top accent bar (mirrors the dashboard-shell charcoal header) */}
      <View className="h-14 flex-row items-center justify-between border-b-2 border-charcoal bg-charcoal px-4">
        <Text className="text-lg font-bold text-cream">Harry Graphics</Text>
        <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
          Studio
        </Text>
      </View>

      {/* Body — wordmark + tagline + CTA */}
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-5xl font-bold text-charcoal">Harry Graphics</Text>
        <Text className="mt-2 font-mono text-center text-xs uppercase tracking-widest text-charcoal-light">
          Your Primary Source for ID Cards & Printing Needs
        </Text>

        <Text className="mt-10 text-center text-sm text-charcoal-light">
          Login or create an account to manage projects, capture photos,
          and upload finished work to the studio.
        </Text>

        <TouchableOpacity
          disabled={checking}
          onPress={() => setModalOpen(true)}
          className="mt-8 h-14 w-full max-w-sm items-center justify-center border-2 border-charcoal bg-charcoal active:bg-charcoal-soft"
        >
          <Text className="font-mono text-sm uppercase tracking-widest text-cream w-60 text-center">
            Get Started
          </Text>
        </TouchableOpacity>

        {checking ? (
          <Text className="mt-4 font-mono text-xs uppercase tracking-widest text-charcoal-light">
            Checking session…
          </Text>
        ) : null}
      </View>

      {/* Bottom accent — CMYK dots (matches AuthModal footer) */}
      <View className="flex-row justify-center gap-1.5 pb-8">
        <View className="h-2 w-2 bg-cyan" />
        <View className="h-2 w-2 bg-magenta" />
        <View className="h-2 w-2 bg-yellow" />
        <View className="h-2 w-2 bg-black-rich" />
      </View>

      <AuthModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialView="method"
        onAuthenticated={() => {
          setModalOpen(false)
          router.replace('/projects')
        }}
      />
    </View>
  )
}
