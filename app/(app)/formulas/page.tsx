'use client'

import { Pencil, Plus, Search as SearchIcon, Sigma, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  EmptyState,
  Sheet,
  Spinner,
  toast,
} from '@/components/ui'
import { useAllFormulas, useChapters, useSubjects } from '@/lib/hooks'
import { deleteFormula, saveFormula } from '@/lib/store'
import type { Formula } from '@/lib/types'
import { cn } from '@/lib/utils'

function FormulaDialog({
  open,
  onClose,
  formula,
  defaultSubjectId,
  defaultChapterId,
}: {
  open: boolean
  onClose: () => void
  formula: Formula | null
  defaultSubjectId?: string
  defaultChapterId?: string | null
}) {
  const subjects = useSubjects()
  const chapters = useChapters()
  const [subjectId, setSubjectId] = useState('')
  const [chapterId, setChapterId] = useState('')
  const [title, setTitle] = useState('')
  const [expression, setExpression] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubjectId(formula?.subjectId ?? defaultSubjectId ?? '')
    setChapterId(formula?.chapterId ?? defaultChapterId ?? '')
    setTitle(formula?.title ?? '')
    setExpression(formula?.expression ?? '')
    setNote(formula?.note ?? '')
  }, [open, formula, defaultSubjectId, defaultChapterId])

  useEffect(() => {
    if (!subjectId && subjects?.length) setSubjectId(subjects[0].id)
  }, [subjectId, subjects])

  const chapterOptions = (chapters ?? [])
    .filter((chapter) => chapter.subjectId === subjectId)
    .sort((a, b) => a.position - b.position)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={formula ? 'Edit formula' : 'Add formula'}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim() || !expression.trim() || !subjectId}
            onClick={async () => {
              setBusy(true)
              try {
                await saveFormula({
                  id: formula?.id,
                  subjectId,
                  chapterId: chapterId || null,
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
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="fb-subject">
              Subject
            </label>
            <select
              id="fb-subject"
              className="select"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value)
                setChapterId('')
              }}
            >
              {(subjects ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fb-chapter">
              Chapter
            </label>
            <select id="fb-chapter" className="select" value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">General</option>
              {chapterOptions.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="fb-title">
            Name
          </label>
          <input
            id="fb-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Area of an equilateral triangle"
          />
        </div>
        <div>
          <label className="label" htmlFor="fb-expression">
            Formula
          </label>
          <textarea
            id="fb-expression"
            className="input formula min-h-[70px] resize-y"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="(√3 / 4) a²"
          />
        </div>
        <div>
          <label className="label" htmlFor="fb-note">
            Note
          </label>
          <textarea
            id="fb-note"
            className="input resize-y"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
    </Sheet>
  )
}

export default function FormulasPage() {
  const rows = useAllFormulas()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Formula | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Formula | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows ?? []).filter(
      (row) =>
        !term ||
        row.formula.title.toLowerCase().includes(term) ||
        row.formula.expression.toLowerCase().includes(term) ||
        (row.formula.note ?? '').toLowerCase().includes(term) ||
        (row.chapter?.name.toLowerCase().includes(term) ?? false) ||
        (row.subject?.name.toLowerCase().includes(term) ?? false),
    )
  }, [rows, search])

  const groups = useMemo(() => {
    const map = new Map<string, { subjectName: string; entries: typeof filtered }>()
    for (const row of filtered) {
      const key = row.subject?.id ?? 'other'
      if (!map.has(key)) map.set(key, { subjectName: row.subject?.name ?? 'Other', entries: [] })
      map.get(key)!.entries.push(row)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].subjectName.localeCompare(b[1].subjectName))
  }, [filtered])

  if (!rows) return <Spinner label="Loading formula book…" />

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Formula Book</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {rows.length} formula{rows.length === 1 ? '' : 's'} saved from your chapters.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add formula
        </Button>
      </header>

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A3A39D]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search formulas"
          className="input pl-9"
        />
      </div>

      {filtered.length ? (
        <div className="space-y-6">
          {groups.map(([key, group]) => (
            <section key={key}>
              <h2 className="section-title mb-2">{group.subjectName}</h2>
              <div className="space-y-2">
                {group.entries.map(({ formula, chapter }) => (
                  <div key={formula.id} className="card px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[13px] font-medium">{formula.title}</p>
                          <span className="chip">{chapter ? chapter.name : 'General'}</span>
                        </div>
                        <p className="formula mt-1.5 whitespace-pre-wrap">{formula.expression}</p>
                        {formula.note ? <p className="mt-1 text-[11.5px] text-muted">{formula.note}</p> : null}
                      </div>
                      <Dropdown
                        trigger={
                          <button
                            aria-label={`Actions for ${formula.title}`}
                            className="rounded p-1 text-[#A3A39D] hover:bg-[#F3F3EF] hover:text-ink"
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
                                setEditing(formula)
                                setDialogOpen(true)
                              }}
                            >
                              Edit
                            </DropdownItem>
                            <DropdownItem
                              danger
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              onSelect={() => {
                                close()
                                setPendingDelete(formula)
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
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sigma className="h-5 w-5" />}
          title={rows.length ? 'No formula matches that search' : 'Your formula book is empty'}
          description={
            rows.length
              ? 'Try a different keyword.'
              : 'Add formulas from any chapter, or straight from here. They stay available while revising.'
          }
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add formula
            </Button>
          }
        />
      )}

      <FormulaDialog open={dialogOpen} onClose={() => setDialogOpen(false)} formula={editing} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this formula?"
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          await deleteFormula(pendingDelete.id)
          setPendingDelete(null)
          toast('Formula deleted')
        }}
      />

      <p className={cn('text-[11px] text-[#B3B3AC]')}>
        Tip: add a formula while revising a chapter and it appears here automatically.
      </p>
    </div>
  )
}
