'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Flag,
  Inbox,
  Play,
  Plus,
  Sigma,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { QuestionCard } from '@/components/QuestionCard'
import { QuestionForm } from '@/components/QuestionForm'
import { QuestionSheet } from '@/components/QuestionSheet'
import { Button, EmptyState, ProgressBar, Sheet, Spinner, StatTile } from '@/components/ui'
import { getMeta } from '@/lib/db'
import { useDashboard } from '@/lib/hooks'
import { relativeTime } from '@/lib/utils'

export default function DashboardPage() {
  const data = useDashboard()
  const goal = useLiveQuery(async () => Number((await getMeta('dailyGoal')) ?? 15), [])
  const [captureOpen, setCaptureOpen] = useState(false)
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null)

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (!data) return <Spinner label="Loading your dashboard…" />

  const target = goal ?? 15
  const isEmpty = data.totalQuestions === 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <CalendarDays className="h-3.5 w-3.5" /> {today}
          </p>
          <h1 className="h1 mt-1">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/subjects" className="btn-secondary">
            <BookOpen className="h-3.5 w-3.5" /> Library
          </Link>
          <Button variant="primary" onClick={() => setCaptureOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New question
          </Button>
        </div>
      </header>

      {isEmpty ? (
        <section className="card overflow-hidden">
          <div className="border-b border-line bg-[#FCFCFA] px-6 py-8">
            <p className="section-title">The core loop</p>
            <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.02em]">
              Capture → assign a chapter → attach the solution → revise.
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
              Your vault is empty. Start with a question from today&apos;s mock, drop it into its chapter from the
              Inbox, and photograph your handwritten solution. Everything is stored on this device first and syncs
              when Supabase is connected.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add your first question
              </Button>
              <Link href="/inbox" className="btn-secondary">
                Open the Inbox
              </Link>
              <Link href="/subjects" className="btn-ghost">
                Browse chapters
              </Link>
            </div>
          </div>
          <div className="grid gap-0 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ['1. Capture', 'Paste the question or snap it. Partial entries are fine.'],
              ['2. Place', 'Drag it into Percentage, or pick a chapter on your phone.'],
              ['3. Revise', 'Solutions stay hidden until you reveal them.'],
            ].map(([title, body]) => (
              <div key={title} className="px-5 py-4">
                <p className="text-[12.5px] font-medium">{title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="card flex flex-col justify-between gap-4 px-5 py-4">
          <div>
            <p className="section-title">Continue revision</p>
            {data.continueTarget ? (
              <>
                <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em]">
                  {data.continueTarget.chapter.name}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {data.continueTarget.subject?.name ?? 'Chapter'}
                  {data.continueTarget.chapter.parentId ? ' · sub-chapter' : ''}
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em]">Pick a chapter to begin</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Open any chapter and you will land back here next time.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.continueTarget ? (
              <>
                <Link href={`/chapters/${data.continueTarget.chapter.id}/revise`} className="btn-primary">
                  <Play className="h-3.5 w-3.5" /> Start revising
                </Link>
                <Link href={`/chapters/${data.continueTarget.chapter.id}`} className="btn-secondary">
                  Open chapter
                </Link>
              </>
            ) : (
              <Link href="/subjects" className="btn-primary">
                Browse chapters <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {data.inboxCount > 0 ? (
              <Link href="/inbox" className="btn-ghost">
                <Inbox className="h-3.5 w-3.5" /> {data.inboxCount} to file
              </Link>
            ) : null}
          </div>
        </div>

        <div className="card px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="section-title">Today</p>
              <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em]">
                {data.todayRevised}
                <span className="ml-1 text-[12px] font-normal text-muted">/ {target} revised</span>
              </p>
            </div>
            <Link
              href="/settings"
              className="text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              goal
            </Link>
          </div>
          <div className="mt-3">
            <ProgressBar value={data.todayRevised} total={target} />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            {data.todayRevised >= target
              ? 'Daily goal reached. Anything more is a bonus.'
              : `${Math.max(0, target - data.todayRevised)} questions left to hit today's target.`}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saved questions" value={data.totalQuestions} hint={`${data.revisedQuestions} revised at least once`} />
        <StatTile label="Pending revision" value={data.pending} hint="never revised yet" />
        <StatTile label="Difficult" value={data.difficult} hint="flagged while revising" />
        <StatTile label="Bookmarked" value={data.bookmarked} hint="saved for a second pass" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">Recently added</h2>
            <Link href="/search" className="text-[12px] text-muted hover:text-ink">
              Search all
            </Link>
          </div>
          {data.recentQuestions.length ? (
            <div className="space-y-2">
              {data.recentQuestions.slice(0, 4).map((question) => (
                <QuestionCard key={question.id} question={question} onOpen={() => setOpenQuestionId(question.id)} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No questions captured yet"
              description="Use Quick capture to add one in a few seconds."
              action={
                <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add question
                </Button>
              }
            />
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="h2 mb-2.5">Subject progress</h2>
            <div className="card divide-y divide-line">
              {data.subjectProgress.map((row) => (
                <Link
                  key={row.subject.id}
                  href={`/subjects/${row.subject.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-[#FCFCFA]"
                >
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.subject.color }} />
                      {row.subject.name}
                    </span>
                    <span className="tabular-nums text-[11.5px] text-muted">
                      {row.revised}/{row.total}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={row.revised} total={row.total} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="h2">Recently revised</h2>
              <Link href="/formulas" className="flex items-center gap-1 text-[12px] text-muted hover:text-ink">
                <Sigma className="h-3 w-3" /> Formulas
              </Link>
            </div>
            <div className="card divide-y divide-line">
              {data.recentChapters.length ? (
                data.recentChapters.map((row) => (
                  <Link
                    key={row.chapter.id}
                    href={`/chapters/${row.chapter.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 text-[12.5px] transition-colors hover:bg-[#FCFCFA]"
                  >
                    <span className="truncate">{row.chapter.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{relativeTime(row.revisedAt)}</span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-4 text-[12px] text-muted">
                  Nothing revised yet. Mark questions as revised and they appear here.
                </p>
              )}
            </div>
          </div>

          {data.difficult > 0 ? (
            <Link
              href="/search?difficult=1"
              className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-[#D8D8D2]"
            >
              <Flag className="h-4 w-4 text-[#8A5A12]" />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">Revise difficult questions</p>
                <p className="text-[11.5px] text-muted">{data.difficult} flagged across chapters</p>
              </div>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#B3B3AC]" />
            </Link>
          ) : null}
        </div>
      </section>

      <Sheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="New question"
        description="Only the question is required — fill the rest later."
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
