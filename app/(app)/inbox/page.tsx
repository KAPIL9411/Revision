'use client'

import { useDroppable } from '@dnd-kit/core'
import { Inbox as InboxIcon, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { QuestionCard } from '@/components/QuestionCard'
import { QuestionForm } from '@/components/QuestionForm'
import { QuestionSheet } from '@/components/QuestionSheet'
import { Button, EmptyState, Sheet, Spinner } from '@/components/ui'
import { useChapterOptions, useInboxQuestions } from '@/lib/hooks'
import { cn } from '@/lib/utils'

function DropTarget({ chapterId, name, nested }: { chapterId: string; name: string; nested?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `chapter:${chapterId}`, data: { type: 'chapter', chapterId } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-transparent px-2 py-[5px] text-[12.5px] text-body transition-colors',
        nested && 'pl-6 text-[12px]',
        isOver ? 'border-accent/40 bg-accent-soft text-accent' : 'hover:bg-surface-2',
      )}
      data-chapter-id={chapterId}
    >
      {name}
    </div>
  )
}

export default function InboxPage() {
  const questions = useInboxQuestions()
  const options = useChapterOptions()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = (options ?? []).filter(
      (row) =>
        !term ||
        row.chapter.name.toLowerCase().includes(term) ||
        (row.subject?.name.toLowerCase().includes(term) ?? false),
    )
    const map = new Map<string, typeof filtered>()
    for (const row of filtered) {
      const key = row.subject?.name ?? 'Chapters'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries())
  }, [options, search])

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Question Inbox</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {questions ? `${questions.length} unsorted question${questions.length === 1 ? '' : 's'}` : 'Loading…'} ·
            drag them into a chapter, or use the move action on a phone.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCaptureOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New question
        </Button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-2">
          {!questions ? (
            <Spinner />
          ) : questions.length ? (
            questions.map((row) => (
              <QuestionCard
                key={row.question.id}
                question={row.question}
                solutionCount={row.solutionCount}
                onOpen={() => setOpenQuestionId(row.question.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title="Your inbox is clear"
              description="Everything is filed. Capture the next question whenever a mock throws something new at you."
              action={
                <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Capture a question
                </Button>
              }
            />
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-6 card p-3">
            <p className="section-title">File into chapter</p>
            <p className="mb-2 mt-1 text-[11px] text-muted">Drag a question onto a chapter.</p>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find chapter"
                className="input py-1.5 pl-8 text-[12px]"
              />
            </div>
            <div className="thin-scroll max-h-[calc(100dvh-220px)] space-y-3 overflow-y-auto pr-1">
              {grouped.map(([subject, rows]) => (
                <div key={subject}>
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                    {subject}
                  </p>
                  <div className="space-y-px">
                    {rows.map((row) => (
                      <DropTarget
                        key={row.chapter.id}
                        chapterId={row.chapter.id}
                        name={row.chapter.name}
                        nested={Boolean(row.chapter.parentId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {!grouped.length ? <p className="text-[12px] text-muted">No chapter matches.</p> : null}
            </div>
          </div>
        </aside>
      </div>

      <Sheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="New question"
        description="It lands in the Inbox unless you pick a chapter."
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
