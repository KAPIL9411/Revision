'use client'

import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  Flag,
  Pencil,
  RotateCcw,
  X,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuestionSheet } from '@/components/QuestionSheet'
import { SolutionBlock } from '@/components/SolutionBlock'
import { Button, EmptyState, ProgressBar, Spinner, toast } from '@/components/ui'
import { db, setMeta } from '@/lib/db'
import { useAttachmentUrl, useChapterBundle, useChapterQuestions } from '@/lib/hooks'
import { recordRevision, toggleBookmark, toggleDifficult } from '@/lib/store'
import {
  DIFFICULTY_LABEL,
  REVISION_FILTERS,
  SOURCE_LABEL,
  type RevisionFilter,
  type RevisionStatus,
} from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'

function QuestionImage({ attachment }: { attachment: Parameters<typeof useAttachmentUrl>[0] }) {
  const url = useAttachmentUrl(attachment)
  if (!url) return <div className="h-40 w-full animate-pulse rounded-lg bg-surface-2" />
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Question"
        loading="lazy"
        decoding="async"
        className="max-h-[46dvh] w-full object-contain"
      />
    </div>
  )
}

export default function RevisionPage() {
  const params = useParams<{ chapterId: string }>()
  const chapterId = params.chapterId
  const bundle = useChapterBundle(chapterId)
  const rows = useChapterQuestions(chapterId)
  const [filter, setFilter] = useState<RevisionFilter>('all')
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [marked, setMarked] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const builtRef = useRef(false)

  const build = useCallback(
    (list: NonNullable<typeof rows>, currentFilter: RevisionFilter) => {
      return list
        .filter((row) => {
          switch (currentFilter) {
            case 'new':
              return !row.revisedAt
            case 'difficult':
              return Boolean(row.question.isDifficult)
            case 'incorrect':
              return row.revisionStatus === 'incorrect'
            case 'bookmarked':
              return Boolean(row.question.isBookmarked)
            case 'no_solution':
              return row.solutionCount === 0 && !row.question.solutionText?.trim()
            default:
              return true
          }
        })
        .map((row) => row.question.id)
    },
    [],
  )

  useEffect(() => {
    if (!rows || builtRef.current) return
    builtRef.current = true
    setQueue(build(rows, filter))
    setIndex(0)
  }, [rows, filter, build])

  useEffect(() => {
    builtRef.current = false
    setIndex(0)
    setMarked(0)
    if (rows) {
      builtRef.current = true
      setQueue(build(rows, filter))
    }
    // Rebuild deliberately only when the filter changes; live updates must not reshuffle a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, chapterId])

  useEffect(() => {
    if (chapterId) void setMeta('lastChapterId', chapterId)
  }, [chapterId])

  const row = useMemo(() => {
    if (!rows) return null
    const id = queue[index]
    return rows.find((candidate) => candidate.question.id === id) ?? null
  }, [rows, queue, index])

  const questionImage = useLiveQuery(async () => {
    if (!row?.question.id) return null
    const rows = await db.attachments.where('questionId').equals(row.question.id).toArray()
    return rows.find((attachment) => attachment.kind === 'question_image') ?? null
  }, [row?.question.id])

  const finished = queue.length > 0 && index >= queue.length

  const next = useCallback(() => {
    setIndex((value) => Math.min(value + 1, queue.length))
  }, [queue.length])

  const previous = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1))
  }, [])

  const mark = useCallback(
    async (status: RevisionStatus) => {
      if (!row) return
      await recordRevision({
        questionId: row.question.id,
        chapterId: row.question.primaryChapterId ?? chapterId,
        status,
      })
      if (status === 'revised') setMarked((value) => value + 1)
      if (status === 'incorrect') {
        await toggleDifficult(row.question.id)
      }
      next()
    },
    [row, chapterId, next],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        next()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previous()
      }
      if (event.key.toLowerCase() === 'm' && row) {
        event.preventDefault()
        void mark('revised')
      }
      if (event.key.toLowerCase() === 'b' && row) {
        event.preventDefault()
        void toggleBookmark(row.question.id)
      }
      if (event.key.toLowerCase() === 'd' && row) {
        event.preventDefault()
        void toggleDifficult(row.question.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, previous, mark, row])

  if (bundle === undefined || rows === undefined) return <Spinner label="Preparing revision…" />

  if (bundle === null) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <EmptyState
          title="Chapter not found"
          action={
            <Link href="/subjects" className="btn-secondary">
              Back to library
            </Link>
          }
        />
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <EmptyState
          title="No questions to revise yet"
          description="Add a question to this chapter, then come back for a focused pass."
          action={
            <Link href={`/chapters/${chapterId}`} className="btn-primary">
              Add a question
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2 px-3 py-2.5 sm:px-5">
          <Link
            href={`/chapters/${chapterId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-body hover:bg-surface-3"
          >
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Chapter</span>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold">{bundle.chapter.name}</p>
            <p className="text-[10.5px] text-muted">
              {finished ? 'Session complete' : `${Math.min(index + 1, queue.length)} of ${queue.length}`} ·{' '}
              {bundle.subject?.name ?? 'Revision'}
            </p>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as RevisionFilter)}
            aria-label="Revision filter"
            className="h-8 max-w-[132px] rounded-md border border-line bg-surface px-2 text-[11.5px] text-body"
          >
            {REVISION_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Link
            href={`/chapters/${chapterId}`}
            aria-label="Exit revision"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-3 sm:inline-flex"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>
        <div className="mx-auto w-full max-w-[820px] px-3 pb-2 sm:px-5">
          <ProgressBar value={Math.min(index, queue.length)} total={queue.length} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-3 pb-32 pt-4 sm:px-5 sm:pb-28">
        {finished ? (
          <div className="card mx-auto mt-6 w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-success-soft text-success">
              <Check className="h-5 w-5" />
            </div>
            <h1 className="text-[17px] font-semibold">Session complete</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              You went through {queue.length} question{queue.length === 1 ? '' : 's'} in {bundle.chapter.name}.
              {marked > 0 ? ` ${marked} marked revised.` : ''}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setQueue(build(rows, filter))
                  setIndex(0)
                  setMarked(0)
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Revise again
              </Button>
              <Link href={`/chapters/${chapterId}`} className="btn-secondary">
                Back to chapter
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="chip">Q{index + 1}</span>
              <span className="chip">{DIFFICULTY_LABEL[row?.question.difficulty ?? 'medium']}</span>
              <span className="chip">{SOURCE_LABEL[row?.question.sourceType ?? 'mock']}</span>
              {row?.question.sourceName ? <span className="chip max-w-[180px] truncate">{row.question.sourceName}</span> : null}
              <span className="chip">{formatDate(row?.question.questionDate)}</span>
              {row?.question.isBookmarked ? <span className="chip text-accent">Bookmarked</span> : null}
              {row?.question.isDifficult ? <span className="chip text-warn">Difficult</span> : null}
            </div>

            {row ? (
              <div className="card flex-1 px-4 py-4 sm:px-5">
                {row.question.questionText.trim() ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.75] text-ink sm:text-[15.5px]">
                    {row.question.questionText}
                  </p>
                ) : (
                  <p className="text-[13px] italic text-muted">Photo-only question</p>
                )}

                {questionImage ? (
                  <div className="mt-3">
                    <QuestionImage attachment={questionImage} />
                  </div>
                ) : null}

                {row.question.personalRemark?.trim() ? (
                  <p className="mt-3 rounded-md border-l-2 border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-body">
                    {row.question.personalRemark}
                  </p>
                ) : null}

                <div className="mt-4">
                  <SolutionBlock
                    key={row.question.id}
                    question={row.question}
                    onChanged={() => {
                      /* live query refreshes attachments */
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!finished ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[820px] items-center gap-2 px-3 py-2.5 sm:px-5">
            <Button variant="secondary" onClick={previous} disabled={index === 0} aria-label="Previous question">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex flex-1 items-center justify-center gap-1.5">
              <button
                onClick={() => row && void toggleBookmark(row.question.id)}
                aria-label="Bookmark question"
                aria-pressed={Boolean(row?.question.isBookmarked)}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-md border transition-colors',
                  row?.question.isBookmarked
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line text-muted hover:bg-surface-2',
                )}
              >
                <Bookmark className={cn('h-4 w-4', row?.question.isBookmarked && 'fill-current')} />
              </button>
              <button
                onClick={() => row && void toggleDifficult(row.question.id)}
                aria-label="Mark difficult"
                aria-pressed={Boolean(row?.question.isDifficult)}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-md border transition-colors',
                  row?.question.isDifficult
                    ? 'border-warn-line bg-warn-soft text-warn'
                    : 'border-line text-muted hover:bg-surface-2',
                )}
              >
                <Flag className={cn('h-4 w-4', row?.question.isDifficult && 'fill-current')} />
              </button>
              <button
                onClick={() => setEditOpen(true)}
                aria-label="Edit question"
                className="grid h-9 w-9 place-items-center rounded-md border border-line text-muted hover:bg-surface-2"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  onClick={() => void mark('incorrect')}
                  className="rounded-md border border-danger-line px-2 py-1.5 text-[11.5px] text-danger hover:bg-danger-soft"
                >
                  Incorrect
                </button>
                <button
                  onClick={() => void mark('shaky')}
                  className="rounded-md border border-warn-line px-2 py-1.5 text-[11.5px] text-warn hover:bg-warn-soft"
                >
                  Shaky
                </button>
              </div>
              <Button variant="primary" onClick={() => void mark('revised')} className="ml-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark revised</span>
                <span className="sm:hidden">Revised</span>
              </Button>
            </div>

            <Button variant="secondary" onClick={next} aria-label="Next question">
              <span className="hidden sm:inline">Next</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <QuestionSheet
        open={editOpen}
        questionId={row?.question.id ?? null}
        onClose={() => setEditOpen(false)}
      />
    </div>
  )
}
