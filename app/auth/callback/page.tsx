'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'
import { getSupabase } from '@/lib/supabase'

function CallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      router.replace('/login')
      return
    }

    const queryError = params.get('error_description') ?? params.get('error')
    if (queryError) {
      setFailed(queryError)
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      router.replace('/')
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish()
    })

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session) finish()
    })

    const timeout = setTimeout(() => {
      if (!settled) setFailed('The sign-in did not complete. Please try again.')
    }, 10_000)

    return () => {
      clearTimeout(timeout)
      data.subscription.unsubscribe()
    }
  }, [params, router])

  if (failed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-[16px] font-semibold">Sign-in could not be completed</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{failed}</p>
          <Link href="/login" className="btn-primary mt-4 w-full">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <Spinner label="Signing you in…" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-bg">
          <Spinner label="Signing you in…" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  )
}
