'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { getSupabase, signInWithGoogle, supabaseEnabled, allowedEmail } from '@/lib/supabase'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.63 0 3.86 2.5 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [router])

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/ssc-emblem.webp"
            alt="Staff Selection Commission"
            className="h-16 w-auto select-none"
            draggable={false}
          />
        </div>

        <div className="card p-6">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">Your study vault, everywhere.</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            Capture questions during mocks, attach handwritten solutions and revise chapter by chapter — on your
            laptop and your phone.
          </p>

          {supabaseEnabled ? (
            <div className="mt-5 space-y-2.5">
              <Button
                variant="primary"
                className="h-10 w-full"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await signInWithGoogle()
                  } catch (signInError) {
                    setError(signInError instanceof Error ? signInError.message : 'Sign-in failed')
                    setBusy(false)
                  }
                }}
              >
                <GoogleMark /> Continue with Google
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted">
                {allowedEmail
                  ? `Only ${allowedEmail} is authorised for this vault.`
                  : 'Your account is the only one that can access this vault.'}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <Link href="/" className="btn-primary h-10 w-full">
                Open my local vault
              </Link>
              <p className="text-[11px] leading-relaxed text-muted">
                No Supabase project is connected yet, so this vault runs entirely on this device. Sign-in and
                cross-device sync unlock automatically once the environment variables are set.
              </p>
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-center text-[11px] text-faint">
          No analytics. No sharing. Your questions stay yours.
        </p>
      </div>
    </div>
  )
}
