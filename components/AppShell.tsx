'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { PanelRightClose } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { db, getUserId } from '@/lib/db'
import { seedIfNeeded } from '@/lib/seed'
import { moveQuestion } from '@/lib/store'
import { getSupabase, isEmailAllowed, signOut, supabaseEnabled } from '@/lib/supabase'
import { startSync } from '@/lib/sync'
import { useSyncState } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { QuickCapture } from './QuickCapture'
import { MobileHeader, MobileNav } from './shell/MobileNav'
import { Sidebar } from './shell/Sidebar'
import { Button, Sheet, Spinner, Toaster, toast } from './ui'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const sync = useSyncState()
  const isFocusMode = /\/revise(\/|$)/.test(pathname)

  const [mounted, setMounted] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [activeDrag, setActiveDrag] = useState<{ id: string; text: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(!supabaseEnabled)
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const userId = await getUserId()
      await seedIfNeeded(userId)
      if (!cancelled) setMounted(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => startSync(), [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline caching is a progressive enhancement */
    })
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session) {
        router.replace('/login')
        return
      }
      if (!isEmailAllowed(data.session.user.email)) {
        setBlockedEmail(data.session.user.email ?? 'unknown account')
        return
      }
      setAuthChecked(true)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/login')
        return
      }
      if (!isEmailAllowed(session.user.email)) {
        setBlockedEmail(session.user.email ?? 'unknown account')
        return
      }
      setBlockedEmail(null)
      setAuthChecked(true)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { text?: string } | undefined
    setActiveDrag({ id: String(event.active.id), text: data?.text ?? '' })
  }

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null)
    const overId = event.over?.id
    if (typeof overId !== 'string' || !overId.startsWith('chapter:')) return
    const chapterId = overId.slice('chapter:'.length)
    const questionId = String(event.active.id)
    const chapter = await db.chapters.get(chapterId)
    await moveQuestion(questionId, chapterId)
    toast(`Moved to ${chapter?.name ?? 'chapter'}`)
  }

  if (!mounted || !authChecked) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <Spinner label="Opening your vault…" />
      </div>
    )
  }

  if (blockedEmail) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-6">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-[16px] font-semibold">This vault is private</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-ink">{blockedEmail}</span> is not the authorised account for this
            vault. Sign in with the owner account to continue.
          </p>
          <Button
            variant="primary"
            className="mt-4 w-full"
            onClick={async () => {
              await signOut()
              router.replace('/login')
            }}
          >
            Use another account
          </Button>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={(event) => void onDragEnd(event)}
      onDragCancel={() => setActiveDrag(null)}
    >
      {!isFocusMode ? (
        <Sidebar
          onQuickCapture={() => setPanelOpen(true)}
          onTogglePanel={() => setPanelOpen((value) => !value)}
          panelOpen={panelOpen}
        />
      ) : null}

      <div className={cn(!isFocusMode && 'lg:pl-[268px]')}>
        {!isFocusMode ? <MobileHeader /> : null}

        {!sync.online ? (
          <div className="border-b border-[#EDDFC5] bg-[#FBF3E6] px-4 py-1.5 text-center text-[11.5px] text-[#8A5A12]">
            Offline — your work stays available on this device and syncs when you reconnect.
          </div>
        ) : null}

        <main
          id="main"
          className={cn(
            isFocusMode
              ? 'min-h-dvh'
              : 'mx-auto w-full max-w-[1120px] px-4 pb-28 pt-4 sm:px-6 lg:pb-14 lg:pt-8',
          )}
        >
          {children}
        </main>
      </div>

      {!isFocusMode ? <MobileNav onCapture={() => setCaptureOpen(true)} /> : null}

      {panelOpen && !isFocusMode ? (
        <>
          <div
            className="fixed inset-0 z-40 hidden bg-[#1B1B18]/20 lg:block"
            onClick={() => setPanelOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed right-0 top-0 z-50 hidden h-dvh w-[392px] flex-col border-l border-line bg-white lg:flex"
            aria-label="Quick capture panel"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13.5px] font-semibold">Quick capture</p>
                <p className="text-[11px] text-muted">Question Inbox</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-md p-1.5 text-[#6B6B66] hover:bg-[#EFEFEA]"
                aria-label="Close capture panel"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto p-4">
              <QuickCapture />
            </div>
          </aside>
        </>
      ) : null}

      <Sheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="Quick capture"
        description="Saved to the Inbox — file it whenever you like."
        size="md"
      >
        <QuickCapture onSaved={() => setCaptureOpen(false)} />
      </Sheet>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="max-w-[280px] rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] leading-snug text-[#33332F] shadow-pop">
            <span className="line-clamp-2-safe">{activeDrag.text || 'Photo question'}</span>
            <span className="mt-1 block text-[10.5px] text-accent">Drop on a chapter</span>
          </div>
        ) : null}
      </DragOverlay>

      <Toaster />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:shadow-pop"
      >
        Skip to content
      </a>
      <span className="sr-only" aria-live="polite">
        {sync.enabled && sync.pending ? `${sync.pending} changes waiting to sync` : ''}
      </span>
    </DndContext>
  )
}
