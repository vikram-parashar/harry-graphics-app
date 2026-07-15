import { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { X, ArrowRight } from 'lucide-react-native'
import {
  sendOtp,
  verifyOtp,
  upsertProfile,
  checkProfileExists,
  signInWithGoogle,
} from '@/lib/auth'

type ViewName = 'method' | 'otp' | 'profile'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialView?: ViewName
  /** Called when the user finishes the full flow (otp or profile). */
  onAuthenticated?: () => void
}

/**
 * AuthModal — React Native port of AuthModal.tsx from the harry-graphics-site
 * web app. Three views:
 *   1. method  — Google button + email input + Send OTP
 *   2. otp      — 6-digit code input
 *   3. profile  — Full name + phone + company (skippable)
 *
 * Same visual language as the web: flat, bordered, mono-uppercase labels,
 * CMYK dot row at the bottom, no rounded corners, no shadows.
 */
export default function AuthModal({
  isOpen,
  onClose,
  initialView = 'method',
  onAuthenticated,
}: AuthModalProps) {
  const [view, setView] = useState<ViewName>(initialView)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setView('method')
      setEmail('')
      setOtp('')
      setError('')
      setName('')
      setPhone('')
      setCompany('')
    } else {
      setView(initialView)
    }
  }, [isOpen, initialView])

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    setError('')
    setLoading(true)
    const { error } = await sendOtp(email)
    setLoading(false)
    if (error) setError(error)
    else setView('otp')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) setError(error)
    else {
      // After Google OAuth the session is established. Check if a profile
      // row exists; if not, route to the profile view.
      const { exists } = await checkProfileExists()
      if (!exists) setView('profile')
      else {
        onAuthenticated?.()
        onClose()
      }
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    setLoading(true)
    const { error } = await verifyOtp(email, otp)
    setLoading(false)
    if (error) {
      setError('Invalid OTP. Please try again.')
      return
    }
    const { exists } = await checkProfileExists()
    if (!exists) setView('profile')
    else {
      onAuthenticated?.()
      onClose()
    }
  }

  const handleSaveProfile = async () => {
    setError('')
    setLoading(true)
    const { error } = await upsertProfile({ full_name: name, phone, company_name: company })
    setLoading(false)
    if (error) setError(error)
    else {
      onAuthenticated?.()
      onClose()
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-charcoal/60" onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            className="w-full max-w-md bg-cream border border-charcoal/10"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-charcoal/10 p-6 pb-4">
              <Text className="text-2xl font-bold text-charcoal">
                {view === 'profile' ? 'Complete Profile' : 'Get Started'}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                className="p-2"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={20} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <View className="p-6">
              {error ? (
                <View className="mb-4 border-l-4 border-magenta bg-magenta/10 p-3">
                  <Text className="text-sm text-magenta">{error}</Text>
                </View>
              ) : null}

              {/* ─── VIEW 1: METHOD ─────────────────────────────────── */}
              {view === 'method' && (
                <View className="mt-2 gap-4">
                  <Text className="text-sm text-charcoal-light">
                    Login or create an account to track orders and save quotes.
                  </Text>

                  {/* Google Button */}
                  <TouchableOpacity
                    disabled={loading}
                    onPress={handleGoogleSignIn}
                    className="h-14 flex-row items-center justify-center gap-3 border border-charcoal/20 bg-white active:bg-gray-50 disabled:opacity-50"
                  >
                    {loading ? (
                      <ActivityIndicator color="#1A1A1A" />
                    ) : (
                      <GoogleGIcon />
                    )}
                    <Text className="font-medium text-charcoal">
                      Continue with Google
                    </Text>
                  </TouchableOpacity>

                  {/* Divider */}
                  <View className="flex-row items-center gap-4 py-2">
                    <View className="h-px flex-1 bg-charcoal/10" />
                    <Text className="text-xs uppercase tracking-widest text-charcoal-light">
                      Or
                    </Text>
                    <View className="h-px flex-1 bg-charcoal/10" />
                  </View>

                  {/* Email form */}
                  <View className="gap-3">
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@company.com"
                      placeholderTextColor="#6B6B6B"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="h-14 w-full border border-charcoal/20 bg-white px-4 text-charcoal focus:border-charcoal"
                    />
                    <TouchableOpacity
                      disabled={loading || !email.includes('@')}
                      onPress={handleSendOtp}
                      className="h-14 flex-row items-center justify-center gap-2 bg-charcoal active:bg-charcoal-soft disabled:opacity-50"
                    >
                      {loading ? (
                        <ActivityIndicator color="#F5F1E8" />
                      ) : (
                        <>
                          <Text className="text-white font-semibold">Send OTP</Text>
                          <ArrowRight size={16} color="#F5F1E8" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ─── VIEW 2: OTP ────────────────────────────────────── */}
              {view === 'otp' && (
                <View className="mt-2">
                  <Text className="mb-6 text-sm text-charcoal-light">
                    We sent a 6-digit code to{' '}
                    <Text className="font-semibold text-charcoal">{email}</Text>
                  </Text>
                  <View className="gap-6">
                    <TextInput
                      value={otp}
                      onChangeText={t => setOtp(t.replace(/\D/g, ''))}
                      placeholder="e.g. 12345678"
                      placeholderTextColor="#6B6B6B"
                      keyboardType="number-pad"
                      maxLength={8}
                      className="h-14 w-full border border-charcoal/20 bg-white text-center font-mono text-2xl text-charcoal tracking-[0.5em]"
                    />
                    <TouchableOpacity
                      disabled={loading || otp.length < 6}
                      onPress={handleVerifyOtp}
                      className="h-14 flex-row items-center justify-center bg-charcoal active:bg-charcoal-soft disabled:opacity-50"
                    >
                      {loading ? (
                        <ActivityIndicator color="#F5F1E8" />
                      ) : (
                        <Text className="text-white font-semibold">Verify & Continue</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setView('method')}
                      className="h-12 items-center justify-center"
                    >
                      <Text className="text-charcoal-light">← Back to options</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ─── VIEW 3: PROFILE ────────────────────────────────── */}
              {view === 'profile' && (
                <View className="mt-2">
                  <Text className="mb-6 text-sm text-charcoal-light">
                    Help us personalize your experience. You can skip this and fill it out later.
                  </Text>
                  <View className="gap-4">
                    <ProfileField
                      label="Full Name *"
                      value={name}
                      onChangeText={setName}
                      placeholder=""
                    />
                    <ProfileField
                      label="Phone Number"
                      value={phone}
                      onChangeText={setPhone}
                      placeholder=""
                      keyboardType="phone-pad"
                    />
                    <ProfileField
                      label="Company Name"
                      value={company}
                      onChangeText={setCompany}
                      placeholder=""
                    />
                    <View className="flex-row gap-3 pt-4">
                      <TouchableOpacity
                        disabled={loading || !name.trim()}
                        onPress={handleSaveProfile}
                        className="h-12 flex-1 items-center justify-center bg-charcoal active:bg-charcoal-soft disabled:opacity-50"
                      >
                        {loading ? (
                          <ActivityIndicator color="#F5F1E8" />
                        ) : (
                          <Text className="text-white font-semibold">Save & Continue</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={onClose}
                        className="h-12 flex-1 items-center justify-center border border-charcoal/20 active:bg-charcoal/5"
                      >
                        <Text className="text-charcoal-light">Skip for now</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* CMYK dots footer accent */}
            <View className="flex-row justify-end gap-1.5 px-6 pb-6">
              <View className="h-2 w-2 bg-cyan" />
              <View className="h-2 w-2 bg-magenta" />
              <View className="h-2 w-2 bg-yellow" />
              <View className="h-2 w-2 bg-black-rich" />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'phone-pad' | 'email-address'
}) {
  return (
    <View>
      <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6B6B6B"
        keyboardType={keyboardType ?? 'default'}
        className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal focus:border-charcoal"
      />
    </View>
  )
}

function GoogleGIcon() {
  // Multi-color G logo (SVG paths from the web version).
  return (
    <View style={{ width: 20, height: 20 }}>
      <SvgG />
    </View>
  )
}

// Native SVG via react-native-svg (already a dep of expo-router).
import { Svg, Path } from 'react-native-svg'
function SvgG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}
