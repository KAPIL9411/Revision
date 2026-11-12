'use client'

import { useLiveQuery as useLiveQueryRaw } from 'dexie-react-hooks'
import { useLiveQuery } from '@/lib/hooks'
import {
  ChevronRight,
  Flag,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Sigma,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { NoteEditor } from '@/components/NoteEditor'
import { QuestionCard } from '@/components/QuestionCard'
import { QuestionForm } from '@/components/QuestionForm'
import { QuestionSheet } from '@/components/QuestionSheet'
import {
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  EmptyState,
  NamePrompt,
  Sheet,
  Spinner,
  StatTile,
  toast,
} from '@/components/ui'
import { db, setMeta } from '@/lib/db'
import {
  useChapterBundle,
  useChapterFormulas,
  useChapterNote,
  useChapterQuestions,
  useChapterStats,
  useTopics,
} from '@/lib/hooks'
import { createTopic, deleteFormula, deleteTopic, renameTopic, saveFormula } from '@/lib/store'
import { REVISION_FILTERS, type Formula, type RevisionFilter } from '@/lib/types'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { Attachment } from '@/lib/types'

function FormulaDialog({
  open,
  onClose,
  subjectId,
  chapterId,
  formula,
}: {
  open: boolean
  onClose: () => void
  subjectId: string
  chapterId: string
  formula: Formula | null
}) {
  const [title, setTitle] = useState('')
  const [expression, setExpression] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(formula?.title ?? '')
    setExpression(formula?.expression ?? '')
    setNote(formula?.note ?? '')
  }, [open, formula])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={formula ? 'Edit formula' : 'Add to Formula Book'}
      description="Formulas added here are available across the vault."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim() || !expression.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await saveFormula({
                  id: formula?.id,
                  subjectId,
                  chapterId,
                  title,
                  expression,
                  note,
                })
                toast('Formula saved')
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            Save formula
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="formula-title">
            Name
          </label>
          <input
            id="formula-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Successive percentage change"
          />
        </div>
        <div>
          <label className="label" htmlFor="formula-expression">
            Formula
          </label>
          <textarea
            id="formula-expression"
            className="input formula min-h-[70px] resize-y"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="Net change = a + b + ab/100"
          />
        </div>
        <div>
          <label className="label" htmlFor="formula-note">
            When to use it
          </label>
          <textarea
            id="formula-note"
            className="input resize-y"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional shortcut note"
          />
        </div>
      </div>
    </Sheet>
  )
}

export default function ChapterPage() {
  const params = useParams<{ chapterId: string }>()
  const chapterId = params.chapterId

  const bundle = useChapterBundle(chapterId)
  const stats = useChapterStats(chapterId)
  const rows = useChapterQuestions(chapterId)
  const note = useChapterNote(chapterId)
  const formulas = useChapterFormulas(chapterId)
  const topics = useTopics(chapterId)

  const notePhotos = (useLiveQuery as unknown as {
    <T>(selector: (() => T | Promise<T>) | readonly unknown[], deps?: readonly unknown[]): T | undefined
  })(
    async () => {
      if (!note?.id) return [] as Attachment[]
      return (await db.attachments.where('noteId').equals(note.id).toArray()).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      )
    },
    [note?.id] as [undefined],
  ) ?? []

  const [tab, setTab] = useState<'questions' | 'notes' | 'formulas'>('questions')
  const [filter, setFilter] = useState<RevisionFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null)
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null)
  const [topicOpen, setTopicOpen] = useState(false)
  const [topicEdit, setTopicEdit] = useState<{ id: string; name: string } | null>(null)
  const [topicDraft, setTopicDraft] = useState('')
  const [topicDelete, setTopicDelete] = useState<{ id: string; name: string } | null>(null)
  const [pendingFormulaDelete, setPendingFormulaDelete] = useState<Formula | null>(null)

  useEffect(() => {
    if (chapterId) void setMeta('lastChapterId', chapterId)
  }, [chapterId])

  const filtered = useMemo(() => {
    if (!rows) return []
    switch (filter) {
      case 'new':
        return rows.filter((row) => !row.revisedAt)
      case 'difficult':
        return rows.filter((row) => row.question.isDifficult)
      case 'incorrect':
        return rows.filter((row) => row.revisionStatus === 'incorrect')
      case 'bookmarked':
        return rows.filter((row) => row.question.isBookmarked)
      case 'no_solution':
        return rows.filter((row) => row.solutionCount === 0 && !row.question.solutionText?.trim())
      default:
        return rows
    }
  }, [rows, filter])

  if (bundle === undefined) return <Spinner label="Opening chapter…" />
  if (bundle === null || !bundle.chapter) {
    return (
      <EmptyState
        title="Chapter not found"
        description="It may have been deleted or renamed."
        action={
          <Link href="/subjects" className="btn-secondary">
            Back to library
          </Link>
        }
      />
    )
  }

  const { chapter, subject, parent } = bundle
  const reviseHref = `/chapters/${chapter.id}/revise`

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        <Link href="/subjects" className="hover:text-ink">
          Library
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? (
          <>
            <Link href={`/subjects/${subject.id}`} className="hover:text-ink">
              {subject.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
          </>
        ) : null}
        {parent ? (
          <>
            <Link href={`/chapters/${parent.id}`} className="hover:text-ink">
              {parent.name}
            </Link>
            <ChevronRight className="h-3 w-3" />
          </>
        ) : null}
        <span className="text-ink">{chapter.name}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{chapter.name}</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {stats
              ? `${stats.total} questions · ${stats.revised} revised · last revised ${
                  stats.lastRevisedAt ? relativeTime(stats.lastRevisedAt) : 'never'
                }`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add question
          </Button>
          <Link
            href={reviseHref}
            className={cn('btn-primary', !stats?.total && 'pointer-events-none opacity-50')}
            aria-disabled={!stats?.total}
          >
            <Play className="h-3.5 w-3.5" /> Start revision
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Saved" value={stats?.total ?? 0} />
        <StatTile label="New" value={stats?.unattempted ?? 0} hint="not revised yet" />
        <StatTile label="Difficult" value={stats?.difficult ?? 0} />
        <StatTile label="Bookmarked" value={stats?.bookmarked ?? 0} />
        <StatTile label="With solutions" value={stats?.withSolutions ?? 0} />
        <StatTile label="Last revised" value={<span className="text-[15px] font-semibold">{stats?.lastRevisedAt ? relativeTime(stats.lastRevisedAt) : 'Never'}</span>} />
      </section>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-px">
        {[
          { key: 'questions' as const, label: 'Questions', count: rows?.length ?? 0 },
          { key: 'notes' as const, label: 'Notes', count: null },
          { key: 'formulas' as const, label: 'Formulas', count: formulas?.length ?? 0 },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              '-mb-px border-b-2 px-2.5 pb-2 text-[13px] transition-colors',
              tab === item.key
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count ? <span className="ml-1.5 text-[11px] text-faint">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'questions' ? (
        <div className="space-y-3">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {REVISION_FILTERS.map((option) => {
              const count =
                rows === undefined
                  ? null
                  : option.value === 'all'
                    ? rows.length
                    : option.value === 'new'
                      ? rows.filter((row) => !row.revisedAt).length
                      : option.value === 'difficult'
                        ? rows.filter((row) => row.question.isDifficult).length
                        : option.value === 'incorrect'
                          ? rows.filter((row) => row.revisionStatus === 'incorrect').length
                          : option.value === 'bookmarked'
                            ? rows.filter((row) => row.question.isBookmarked).length
                            : rows.filter((row) => row.solutionCount === 0 && !row.question.solutionText?.trim()).length
              return (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    filter === option.value
                      ? 'border-accent bg-accent-soft font-medium text-accent'
                      : 'border-line bg-surface text-muted hover:border-line-strong',
                  )}
                >
                  {option.label}
                  {count !== null ? <span className="ml-1 text-[10.5px] opacity-70">{count}</span> : null}
                </button>
              )
            })}
          </div>

          {!rows ? (
            <Spinner />
          ) : filtered.length ? (
            <div className="space-y-2">
              {filtered.map((row) => (
                <QuestionCard
                  key={row.question.id}
                  question={row.question}
                  solutionCount={row.solutionCount}
                  revisionStatus={row.revisionStatus}
                  revisedAt={row.revisedAt}
                  onOpen={() => setOpenQuestionId(row.question.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<NotebookPen className="h-5 w-5" />}
              title={filter === 'all' ? 'No questions in this chapter yet' : 'Nothing matches this filter'}
              description={
                filter === 'all'
                  ? 'Add a question here, or capture it in the Inbox and drag it in.'
                  : 'Try another filter to see the rest of the chapter.'
              }
              action={
                filter === 'all' ? (
                  <Button variant="primary" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add question
                  </Button>
                ) : (
                  <Button onClick={() => setFilter('all')}>Show all</Button>
                )
              }
            />
          )}
        </div>
      ) : null}

      {tab === 'notes' ? (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="h2">Chapter notes</h2>
                <p className="text-[11.5px] text-muted">Formulas, tricks, mistakes and handwritten pages.</p>
              </div>
              <span className="hidden text-[11px] text-muted sm:block">Autosaves</span>
            </div>
            {notePhotos && notePhotos.length ? null : null}
            <NoteEditor chapterId={chapter.id} notePhotos={notePhotos ?? []} />
          </div>
        </div>
      ) : null}

      {tab === 'formulas' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="h2">Formulas & shortcuts</h2>
              <p className="text-[11.5px] text-muted">Saved to the Formula Book for this chapter.</p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setEditingFormula(null)
                setFormulaOpen(true)
              }}
            >
              <Sigma className="h-3.5 w-3.5" /> Add formula
            </Button>
          </div>

          {formulas && formulas.length ? (
            <div className="space-y-2">
              {formulas.map((formula) => (
                <div key={formula.id} className="card px-3.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{formula.title}</p>
                      <p className="formula mt-1 whitespace-pre-wrap">{formula.expression}</p>
                      {formula.note ? <p className="mt-1 text-[11.5px] text-muted">{formula.note}</p> : null}
                    </div>
                    <Dropdown
                      trigger={
                        <button
                          aria-label={`Actions for ${formula.title}`}
                          className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      }
                    >
                      {(close) => (
                        <>
                          <DropdownItem
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            onSelect={() => {
                              close()
                              setEditingFormula(formula)
                              setFormulaOpen(true)
                            }}
                          >
                            Edit
                          </DropdownItem>
                          <DropdownItem
                            danger
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onSelect={() => {
                              close()
                              setPendingFormulaDelete(formula)
                            }}
                          >
                            Delete
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Sigma className="h-5 w-5" />}
              title="No formulas saved for this chapter"
              description="Add a shortcut once and it is available in the Formula Book forever."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditingFormula(null)
                    setFormulaOpen(true)
                  }}
                >
                  Add formula
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      <section className="card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="section-title mr-1">Topics</span>
            {(topics ?? []).map((topic) => (
              <span key={topic.id} className="chip">
                <button className="hover:text-ink" onClick={() => setTopicEdit({ id: topic.id, name: topic.name })}>
                  {topic.name}
                </button>
                <button
                  onClick={() => setTopicDelete({ id: topic.id, name: topic.name })}
                  aria-label={`Delete topic ${topic.name}`}
                  className="text-faint hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {!topics?.length ? <span className="text-[11.5px] text-muted">None yet</span> : null}
          </div>
          <Button variant="ghost" className="border border-line" onClick={() => setTopicOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Topic
          </Button>
        </div>
      </section>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Add question to ${chapter.name}`}
        description="Question text or a photo is enough."
        size="md"
      >
        <QuestionForm
          compact
          defaultSubjectId={chapter.subjectId}
          defaultChapterId={chapter.id}
          onSaved={() => setAddOpen(false)}
        />
      </Sheet>

      <QuestionSheet
        open={Boolean(openQuestionId)}
        questionId={openQuestionId}
        onClose={() => setOpenQuestionId(null)}
      />

      <FormulaDialog
        open={formulaOpen}
        onClose={() => setFormulaOpen(false)}
        subjectId={chapter.subjectId}
        chapterId={chapter.id}
        formula={editingFormula}
      />

      <Sheet
        open={topicOpen}
        onClose={() => setTopicOpen(false)}
        title="Add topic"
        description="Optional sub-labels inside this chapter, e.g. successive change or reverse percentage."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setTopicOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!topicDraft.trim()}
              onClick={async () => {
                await createTopic(chapter.id, topicDraft)
                setTopicDraft('')
                setTopicOpen(false)
                toast('Topic added')
              }}
            >
              Add topic
            </Button>
          </div>
        }
      >
        <input
          autoFocus
          value={topicDraft}
          onChange={(event) => setTopicDraft(event.target.value)}
          placeholder="Topic name"
          className="input"
        />
      </Sheet>

      <NamePrompt
        open={Boolean(topicEdit)}
        title="Rename topic"
        initial={topicEdit?.name}
        placeholder="Topic name"
        onClose={() => setTopicEdit(null)}
        onSubmit={async (value) => {
          if (!topicEdit) return
          await renameTopic(topicEdit.id, value)
          toast('Topic renamed')
        }}
      />

      <ConfirmDialog
        open={Boolean(topicDelete)}
        title={`Delete topic ${topicDelete?.name ?? ''}?`}
        description="Questions keep their text — just the topic label is removed."
        onClose={() => setTopicDelete(null)}
        onConfirm={async () => {
          if (!topicDelete) return
          await deleteTopic(topicDelete.id)
          setTopicDelete(null)
          toast('Topic deleted')
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingFormulaDelete)}
        title="Delete this formula?"
        description="It is removed from the Formula Book."
        onClose={() => setPendingFormulaDelete(null)}
        onConfirm={async () => {
          if (!pendingFormulaDelete) return
          await deleteFormula(pendingFormulaDelete.id)
          setPendingFormulaDelete(null)
          toast('Formula deleted')
        }}
      />

      <p className="pb-2 text-[11px] text-faint">
        Chapter last revised {stats?.lastRevisedAt ? formatDate(stats.lastRevisedAt) : 'never'} ·{' '}
        {stats?.incorrect ?? 0} marked incorrect
      </p>
    </div>
  )
}
