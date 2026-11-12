'use client'

import { Clock, Flag, Inbox, MoreHorizontal, Plus, Search, Sigma } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useDashboard } from '@/lib/hooks'

import { QuestionForm } from '@/components/QuestionForm'
import { QuestionSheet } from '@/components/QuestionSheet'
import { SyncBadge } from '@/components/shell/Sidebar'
import { ThemeQuickToggle } from '@/components/ThemeToggle'
import { Button, EmptyState, ProgressBar, Sheet, Spinner } from '@/components/ui'
import { getMeta } from '@/lib/db'
import { useAttachmentUrl } from '@/lib/hooks'
import { getSupabase } from '@/lib/supabase'
import type { Question } from '@/lib/types'
import { cn } from '@/lib/utils'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function useViewerName() {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const user = data.session?.user
      const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string }
      const label = meta.full_name ?? meta.name ?? null
      setName(label ? label.trim().split(' ')[0] : null)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return name
}

export default function DashboardPage() {
  const data = useDashboard()
  const goal = useLiveQuery(async () => Number((await getMeta('dailyGoal')) ?? 15), [])
  const name = useViewerName()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null)

  if (!data) return <Spinner label="Loading your dashboard…" />

  const target = goal ?? 15
  const isEmpty = data.totalQuestions === 0
  const remaining = Math.max(0, target - data.todayRevised)

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{greeting()},</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight text-bg">
            {name ?? 'Lets revise'}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SyncBadge compact />
          <ThemeQuickToggle />
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-surface-2"
          >
            <img src="/brand/ssc-emblem.webp" alt="" className="h-7 w-auto" />
          </Link>
        </div>
      </header>

      <Link
        href="/search"
        className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-3 text-[13px] text-muted transition-colors hover:border-line-strong"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search questions, chapters, formulas</span>
      </Link>

      <section className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-[#101014] p-5 text-on-accent shadow">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(120% 110% at 12% 0%, rgb(var(--accent) / 0.55), transparent 62%), radial-gradient(90% 90% at 100% 100%, rgb(var(--accent) / 0.28), transparent 58%)',
            }}
            aria-hidden
          />
          <div className="relative flex h-full min-h-[200px] flex-col justify-between gap-6 md:min-h-[260px]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-accent/60">
                {isEmpty ? 'Start here' : 'Continue revision'}
              </p>
              <h2 className="mt-2 text-[23px] font-semibold leading-tight tracking-[-0.02em]">
                {isEmpty
                  ? 'Capture your first question'
                  : data.continueTarget
                    ? data.continueTarget.chapter.name
                    : 'Pick a chapter to begin'}
              </h2>
              <p className="mt-1.5 max-w-[36ch] text-[12.5px] leading-relaxed text-on-accent/70">
                {isEmpty
                  ? 'Paste a screenshot, file it into a chapter, and your revision history starts here.'
                  : data.continueTarget
                    ? `${data.continueTarget.subject?.name ?? 'Chapter'} · ${data.pending} question${data.pending === 1 ? '' : 's'} waiting for a first revision`
                    : 'Every chapter you open becomes your continue target.'}
              </p>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-on-accent/10">
                  <img src="/brand/ssc-emblem.webp" alt="" className="h-7 w-auto" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">
                    {isEmpty ? 'SSC Revision Vault' : (data.continueTarget?.subject?.name ?? data.continueTarget?.chapter.name ?? 'Library')}
                  </p>
                  <p className="truncate text-[11px] text-on-accent/60">
                    {isEmpty ? '99 chapters ready' : `${data.totalQuestions} saved · ${data.revisedQuestions} revised`}
                  </p>
                </div>
              </div>
              {isEmpty ? (
                <button
                  onClick={() => setCaptureOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-on-accent px-4 text-[12px] font-semibold text-[#101014]"
                >
                  <Plus className="h-3.5 w-3.5" /> Capture
                </button>
              ) : data.continueTarget ? (
                <Link
                  href={`/chapters/${data.continueTarget.chapter.id}/revise`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-on-accent px-4 text-[12px] font-semibold text-[#101014]"
                >
                  <Play className="h-3 w-3 fill-current" /> Start
                </Link>
              ) : (
                <Link
                  href="/subjects"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-on-accent px-4 text-[12px] font-semibold text-[#101014]"
                >
                  Library <MoreHorizontal className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>

        <section className="card flex-col justify-between rounded-2xl px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="section-title">Today</p>
              <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em]">
                {data.todayRevised}
                <span className="ml-1.5 text-[12px] font-normal text-muted">/ 15 revised</span>
              </p>
            </div>
            <Link
              href="/settings"
              className="rounded-full border border-line px-2.5 py-1 text-[10.5px] text-muted transition-colors hover:text-ink"
            >
              goal
            </Link>
          </div>
          <div className="mt-4">
            <ProgressBar value={data.todayRevised} total={target} />
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
              {remaining === 0
                ? 'Goal reached. Anything more is a bonus.'
                : `${remaining} question${remaining === 1 ? '' : 's'} left to hit today's target.`}
            </p>
          </div>
          <div className="mt-4 flex gap-1.5">
            {[{
              href: '/search?difficult=1',
              label: `${data.difficult} difficult`,
              icon: Flag,
            }, {
              href: '/search?bookmarked=1',
              label: `${data.bookmarked} saved`,
              icon: Inbox,
            }, {
              href: '/inbox',
              label: `${data.inboxCount} to file`,
              icon: MoreHorizontal,
            }].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-1 text-[10.5px] text-muted transition-colors hover:text-ink"
              >
                <Icon className="h-2.5 w-2.5" /> {label}
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Recently added</h2>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-ink"
          >
            See all <MoreHorizontal className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.recentQuestions.length ? (
          <div className="flex gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar sm:overflow-x-hidden sm:px-0">
            {data.recentQuestions.map((question) => (
              <div
                key={question.id}
                className="rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-medium truncate text-ink line-clamp-2">
                      {question.questionText?.substring(0, 80)}{question.questionText?.length > 80 ? '…' : ''}
                    </p>
                    <p className="text-[10px] text-on-accent/60">{'just now'}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[11px] text-muted">{question.primaryChapter?.name || 'Inbox'}</span>
                    <span className="text-[10px] text-muted">1 of 1</span>
                  </div>
                </div>
              </div>
            ))}
            {data.recentQuestions.length === 0 && (
              <EmptyState
                title="Nothing captured yet"
                description="Paste a screenshot and it lands here, on this device first."
                action={
                  <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Capture a question
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <EmptyState
            title="Nothing captured yet"
            description="Paste a screenshot and it lands here, on this device first."
            action={
              <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Capture a question
              </Button>
            }
          />
        )}
      </section>

      <section className="grid gap-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Subject progress</h2>
            <Link href="/subjects" className="text-[12px] text-muted hover:text-accent">
              Library
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {data.subjectProgress.map((row) => (
              <div
                key={row.subject.id}
                className="rounded-xl border border-line bg-surface p-3 hover:border-accent transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.subject.color }} />
                  <span className="font-medium truncate text-ink">{row.subject.name}</span>
                  <span className="ml-auto text-[10px] text-on-accent/60">{row.revised}/{row.total}</span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={row.revised} total={row.total} className="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Recently revised</h2>
            <Link href="/formulas" className="text-[12px] text-on-accent/60 hover:text-accent">Formulas</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {data.recentChapters.length ? (
              data.recentChapters.map((row) => (
                <div
                  key={row.chapter.id}
                  className="rounded-xl border border-line bg-surface p-3 hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {row.chapter.parentId ? (
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.chapter.color }} />
                    ) : null}
                    <span className="font-medium truncate text-ink">{row.chapter.name}</span>
                    <span className="text-[10px] text-on-accent/60">{'just now'}</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={row.revised} total={row.total} className="h-1.5" />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-line bg-surface p-3 text-center">
                <p className="text-[12px] text-muted">Nothing revised yet</p>
                <Button variant="primary" onClick={() => setCaptureOpen(true)} className="mt-2 w-full">
                  <Plus className="h-3.5 w-3.5" /> Start revising
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <Sheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="New question"
        description="Paste a screenshot — text is optional."
        size="md"
      >
        <QuestionForm compact onSaved={() => setCaptureOpen(false)} />
      </Sheet>

      <QuestionSheet
        open={Boolean(openQuestionId)}
        questionId={openQuestionId}
        onClose={() => setOpenQuestionId(null)}
      />
    </div>
  )
}