'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '@/components/QuestionCard'
import { QuestionSheet } from '@/components/QuestionSheet'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { db } from '@/lib/db'
import { DIFFICULTIES, DIFFICULTY_LABEL, SOURCES, SOURCE_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

type RevisionFilter = 'any' | 'new' | 'revised' | 'incorrect' | 'shaky'

function SearchInner() {
  const params = useSearchParams()
  const [term, setTerm] = useState('')
  const deferredTerm = useDeferredValue(term)
  const [subjectId, setSubjectId] = useState('')
  const [chapterId, setChapterId] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [source, setSource] = useState('')
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  const [difficultOnly, setDifficultOnly] = useState(params.get('difficult') === '1')
  const [revision, setRevision] = useState<RevisionFilter>('any')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('difficult') === '1') setDifficultOnly(true)
    const chapter = params.get('chapter')
    if (chapter) setChapterId(chapter)
  }, [params])

  const data = useLiveQuery(async () => {
    const [questions, subjects, chapters, revisions, tags, questionTags, attachments] = await Promise.all([
      db.questions.toArray(),
      db.subjects.toArray(),
      db.chapters.toArray(),
      db.revisionHistory.toArray(),
      db.tags.toArray(),
      db.questionTags.toArray(),
      db.attachments.toArray(),
    ])

    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))
    const tagById = new Map(tags.map((tag) => [tag.id, tag.name]))
    const tagsByQuestion = new Map<string, string[]>()
    for (const link of questionTags) {
      const name = tagById.get(link.tagId)
      if (!name) continue
      const list = tagsByQuestion.get(link.questionId) ?? []
      list.push(name)
      tagsByQuestion.set(link.questionId, list)
    }
    const solutions = new Map<string, number>()
    for (const attachment of attachments) {
      if (attachment.kind !== 'solution' || !attachment.questionId) continue
      solutions.set(attachment.questionId, (solutions.get(attachment.questionId) ?? 0) + 1)
    }
    const latest = new Map<string, { revisedAt: string; status: string }>()
    for (const revision of revisions) {
      const current = latest.get(revision.questionId)
      if (!current || revision.revisedAt > current.revisedAt) {
        latest.set(revision.questionId, { revisedAt: revision.revisedAt, status: revision.status })
      }
    }

    return questions.map((question) => {
      const chapter = question.primaryChapterId ? chapterById.get(question.primaryChapterId) : null
      const subject = subjectById.get(question.subjectId) ?? null
      return {
        question,
        chapter,
        subject,
        tags: tagsByQuestion.get(question.id) ?? [],
        solutionCount: solutions.get(question.id) ?? 0,
        revision: latest.get(question.id) ?? null,
        haystack: [
          question.questionText,
          question.personalRemark ?? '',
          question.sourceName ?? '',
          chapter?.name ?? '',
          subject?.name ?? '',
          (tagsByQuestion.get(question.id) ?? []).join(' '),
        ]
          .join(' ')
          .toLowerCase(),
      }
    })
  }, [])

  const results = useMemo(() => {
    if (!data) return []
    const needle = deferredTerm.trim().toLowerCase()
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null

    return data.filter((row) => {
      if (needle && !row.haystack.includes(needle)) return false
      if (subjectId && row.question.subjectId !== subjectId) return false
      if (chapterId && row.question.primaryChapterId !== chapterId) return false
      if (difficulty && row.question.difficulty !== difficulty) return false
      if (source && row.question.sourceType !== source) return false
      if (bookmarkedOnly && !row.question.isBookmarked) return false
      if (difficultOnly && !row.question.isDifficult) return false
      if (revision === 'new' && row.revision) return false
      if (revision === 'revised' && row.revision?.status !== 'revised') return false
      if (revision === 'incorrect' && row.revision?.status !== 'incorrect') return false
      if (revision === 'shaky' && row.revision?.status !== 'shaky') return false
      const created = new Date(row.question.createdAt).getTime()
      if (fromTime && created < fromTime) return false
      if (toTime && created > toTime) return false
      return true
    })
  }, [data, deferredTerm, subjectId, chapterId, difficulty, source, bookmarkedOnly, difficultOnly, revision, from, to])

  const subjects = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of data ?? []) if (row.subject) map.set(row.subject.id, row.subject.name)
    return Array.from(map.entries())
  }, [data])

  const chapters = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of data ?? []) {
      if (row.chapter && (!subjectId || row.chapter.subjectId === subjectId)) map.set(row.chapter.id, row.chapter.name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [data, subjectId])

  const activeFilters =
    Number(Boolean(subjectId)) +
    Number(Boolean(chapterId)) +
    Number(Boolean(difficulty)) +
    Number(Boolean(source)) +
    Number(bookmarkedOnly) +
    Number(difficultOnly) +
    Number(revision !== 'any') +
    Number(Boolean(from || to))

  const clear = () => {
    setSubjectId('')
    setChapterId('')
    setDifficulty('')
    setSource('')
    setBookmarkedOnly(false)
    setDifficultOnly(false)
    setRevision('any')
    setFrom('')
    setTo('')
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h1">Search</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Question text, remarks, tags, chapters and subjects — searched on this device.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search questions, remarks, tags…"
            className="input h-10 pl-9 pr-9 text-[14px]"
            autoFocus
          />
          {term ? (
            <button
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <Button
          variant={filtersOpen || activeFilters ? 'primary' : 'secondary'}
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
      </div>

      {filtersOpen ? (
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="f-subject">
              Subject
            </label>
            <select
              id="f-subject"
              className="select"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value)
                setChapterId('')
              }}
            >
              <option value="">All subjects</option>
              {subjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-chapter">
              Chapter
            </label>
            <select id="f-chapter" className="select" value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">All chapters</option>
              {chapters.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-difficulty">
              Difficulty
            </label>
            <select id="f-difficulty" className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="">Any</option>
              {DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {DIFFICULTY_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-source">
              Source
            </label>
            <select id="f-source" className="select" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">Any</option>
              {SOURCES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-revision">
              Revision
            </label>
            <select
              id="f-revision"
              className="select"
              value={revision}
              onChange={(event) => setRevision(event.target.value as RevisionFilter)}
            >
              <option value="any">Any</option>
              <option value="new">Not revised yet</option>
              <option value="revised">Revised</option>
              <option value="incorrect">Incorrect</option>
              <option value="shaky">Shaky</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-from">
              Added from
            </label>
            <input id="f-from" type="date" className="input" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-to">
              Added until
            </label>
            <input id="f-to" type="date" className="input" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={bookmarkedOnly}
                onChange={(event) => setBookmarkedOnly(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-[#3157D5]"
              />
              Bookmarked
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={difficultOnly}
                onChange={(event) => setDifficultOnly(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-[#3157D5]"
              />
              Difficult
            </label>
          </div>
          {activeFilters ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <Button variant="ghost" onClick={clear}>
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          <p className={cn('text-[11.5px] text-muted')}>
            {results.length} result{results.length === 1 ? '' : 's'}
            {deferredTerm.trim() ? ` for “${deferredTerm.trim()}”` : ''}
          </p>
          {results.length ? (
            results.map((row) => (
              <QuestionCard
                key={row.question.id}
                question={row.question}
                chapterName={row.chapter?.name}
                solutionCount={row.solutionCount}
                revisionStatus={row.revision?.status ?? null}
                revisedAt={row.revision?.revisedAt ?? null}
                onOpen={() => setOpenQuestionId(row.question.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={<SearchIcon className="h-5 w-5" />}
              title="Nothing found"
              description="Try a shorter search term or clear a filter."
              action={
                activeFilters ? (
                  <Button onClick={clear}>Clear filters</Button>
                ) : (
                  <Button onClick={() => setTerm('')}>Reset search</Button>
                )
              }
            />
          )}
        </div>
      )}

      <QuestionSheet
        open={Boolean(openQuestionId)}
        questionId={openQuestionId}
        onClose={() => setOpenQuestionId(null)}
      />
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner label="Loading search…" />}>
      <SearchInner />
    </Suspense>
  )
}
