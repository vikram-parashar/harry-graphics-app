import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase, getOAuthRedirectUrl } from './supabase'

/**
 * Auth helpers — port of `@/lib/actions/auth` from the web app.
 *
 *   - sendOtp(email)            → supabase.auth.signInWithOtp({ email })
 *   - verifyOtp(email, token)   → supabase.auth.verifyOtp(...)
 *   - checkProfileExists()      → SELECT id FROM profiles WHERE id = user.id
 *   - upsertProfile({...})      → supabase.from('profiles').upsert(...)
 *   - signInWithGoogle()        → WebBrowser OAuth flow against Supabase
 *
 * Returns the same shape as the original server actions:
 *   { data?: ...; error?: string | null }
 */

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
}

export async function sendOtp(
  email: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  })
  return { error: error ? error.message : null }
}

export async function verifyOtp(
  email: string,
  token: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  })
  return { error: error ? error.message : null }
}

export async function checkProfileExists(): Promise<{ exists: boolean; error: string | null }> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { exists: false, error: userErr?.message ?? 'Not signed in' }
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return { exists: false, error: error.message }
  return { exists: !!data, error: null }
}

export async function upsertProfile(input: {
  full_name: string
  phone?: string
  company_name?: string
}): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { error: userErr?.message ?? 'Not signed in' }
  }
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email ?? null,
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    company_name: input.company_name?.trim() || null,
  })
  return { error: error ? error.message : null }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, company_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!data) {
    // Profile row not yet created — return a stub with email at least.
    return {
      id: user.id,
      full_name: null,
      email: user.email ?? null,
      phone: null,
      company_name: null,
    }
  }
  return data as Profile
}

/**
 * Google OAuth via Supabase, ported from AuthModal.tsx.
 *
 * On web this is a single `signInWithOAuth({ provider, redirectTo })` call
 * that the browser navigates to. On native we use `WebBrowser.openAuthSessionAsync`
 * so the OS opens the Google OAuth flow in an in-app browser, then reopens
 * our app via the `harrygraphics://auth-callback` deep link. PKCE is handled
 * by supabase-js automatically when `flowType: 'pkce'` is set (see lib/supabase.ts).
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = getOAuthRedirectUrl()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  })
  if (error) return { error: error.message }
  if (!data?.url) return { error: 'No OAuth URL returned from Supabase' }

  // Open the in-app browser; supabase-js will detect the redirect in the
  // session URL change and exchange the PKCE code automatically.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  WebBrowser.maybeCompleteAuthSession()
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: 'Sign-in cancelled' }
  }
  // Give supabase-js a tick to consume the redirect URL.
  await new Promise(r => setTimeout(r, 250))
  return { error: null }
}

/** Sign out — clears the local session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Build the redirect URI we'd use if we were doing a manual exchange.
 * (Currently we use `skipBrowserRedirect: true` + WebBrowser, so we
 * don't need to do the exchange ourselves — supabase-js handles it via
 * the deep-link listener. Kept here for debugging.)
 */
export function debugRedirectUri(): string {
  return makeRedirectUri({
    scheme: 'harrygraphics',
    path: 'auth-callback',
  })
}
