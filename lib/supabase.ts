import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseEnabled = Boolean(url && anonKey)
export const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? 'attachments'

/** Optional single-account lock. When set, only this email may use the vault. */
export const allowedEmail = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL ?? '').trim().toLowerCase()

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  }
  return client
}

export async function signInWithGoogle() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured on this deployment.')
  const redirectTo = `${window.location.origin}/auth/callback`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  })
  if (error) throw error
}

export async function signOut() {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
}

export function isEmailAllowed(email: string | null | undefined) {
  if (!allowedEmail) return true
  if (!email) return false
  return email.trim().toLowerCase() === allowedEmail
}

const signedUrlCache = new Map<string, { url: string; expires: number }>()

export async function getSignedUrl(path: string) {
  const supabase = getSupabase()
  if (!supabase) return null
  const cached = signedUrlCache.get(path)
  if (cached && cached.expires > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}
