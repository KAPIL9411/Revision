'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal, Plus, Trash2, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  EmptyState,
  NamePrompt,
  ProgressBar,
  Spinner,
  toast,
} from '@/components/ui'
import { db } from '@/lib/db'
import {
  createChapter,
  deleteChapter,
  deleteSubject,
  renameChapter,
  renameSubject,
  reorderChapters,
} from '@/lib/store'
import { cn } from '@/lib/utils'

type ChapterNodeRow = {
  chapter: { id: string; name: string }
  children: { chapter: { id: string; name: string }; total: number; revised: number }[]
  total: number
  revised: number
}

export default function SubjectPage() {
  const params = useParams<{ subjectId: string }>()
  const subjectId = params.subjectId
  const router = useRouter()

  const data = useLiveQuery(async () => {
    const [subject, chapters, questions, revisions] = await Promise.all([
      db.subjects.get(subjectId),
      db.chapters.where('subjectId').equals(subjectId).toArray(),
      db.questions.toArray(),
      db.revisionHistory.toArray(),
    ])
    if (!subject) return null
    const revised = new Set(revisions.map((row) => row.questionId))
    const siblings = (parentId: string | null) =>
      chapters
        .filter((chapter) => (chapter.parentId ?? null) === parentId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

    const nodes: ChapterNodeRow[] = siblings(null).map((root) => {
      const kids = siblings(root.id).map((kid) => {
        const own = questions.filter((question) => question.primaryChapterId === kid.id)
        return { chapter: kid, total: own.length, revised: own.filter((q) => revised.has(q.id)).length }
      })
      const ids = new Set([root.id, ...kids.map((kid) => kid.chapter.id)])
      const scoped = questions.filter((question) => question.primaryChapterId && ids.has(question.primaryChapterId))
      return {
        chapter: root,
        children: kids,
        total: scoped.length,
        revised: scoped.filter((question) => revised.has(question.id)).length,
      }
    })

    const subjectQuestions = questions.filter((question) => question.subjectId === subjectId)
    return {
      subject,
      nodes,
      total: subjectQuestions.length,
      revisedTotal: subjectQuestions.filter((question) => revised.has(question.id)).length,
      chapterCount: chapters.length,
    }
  }, [subjectId])

  const [addParent, setAddParent] = useState<{ parentId: string | null } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; subject?: boolean } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; children: number } | null>(null)
  const [deleteSubjectOpen, setDeleteSubjectOpen] = useState(false)

  if (data === undefined) return <Spinner label="Loading subject…" />
  if (data === null) {
    return (
      <EmptyState
        title="Subject not found"
        description="This subject may have been deleted."
        action={
          <Link href="/subjects" className="btn-secondary">
            Back to library
          </Link>
        }
      />
    )
  }

  const move = async (ids: string[], index: number, direction: -1 | 1) => {
    const next = [...ids]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await reorderChapters(next)
  }

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <Link href="/subjects" className="hover:text-ink">
          Library
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ink">{data.subject.name}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: data.subject.color }} />
            {data.subject.name}
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {data.chapterCount} chapters · {data.total} questions · {data.revisedTotal} revised
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setAddParent({ parentId: null })}>
            <Plus className="h-3.5 w-3.5" /> Add chapter
          </Button>
          <Dropdown
            trigger={
              <Button variant="secondary" aria-label="Subject actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          >
            {(close) => (
              <>
                <DropdownItem
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onSelect={() => {
                    close()
                    setRenameTarget({ id: data.subject.id, name: data.subject.name, subject: true })
                  }}
                >
                  Rename subject
                </DropdownItem>
                <DropdownItem
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onSelect={() => {
                    close()
                    setDeleteSubjectOpen(true)
                  }}
                >
                  Delete subject
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      <div className="card px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="section-title">Subject progress</span>
          <span className="tabular-nums text-muted">
            {data.revisedTotal}/{data.total}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={data.revisedTotal} total={data.total} />
        </div>
      </div>

      <section className="space-y-2">
        {data.nodes.length ? (
          <div className="card divide-y divide-line">
            {data.nodes.map((node, index) => {
              const ids = data.nodes.map((row) => row.chapter.id)
              return (
                <div key={node.chapter.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/chapters/${node.chapter.id}`}
                      className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-accent"
                    >
                      {node.chapter.name}
                    </Link>
                    <span className="text-[11px] tabular-nums text-muted">
                      {node.revised}/{node.total}
                    </span>
                    <div className="hidden items-center gap-0.5 sm:flex">
                      <button
                        onClick={() => void move(ids, index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${node.chapter.name} up`}
                        className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void move(ids, index, 1)}
                        disabled={index === ids.length - 1}
                        aria-label={`Move ${node.chapter.name} down`}
                        className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Dropdown
                      trigger={
                        <button
                          aria-label={`Actions for ${node.chapter.name}`}
                          className="rounded p-1 text-faint hover:bg-surface-2 hover:text-ink"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      }
                    >
                      {(close) => (
                        <>
                          <DropdownItem
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            onSelect={() => {
                              close()
                              setRenameTarget({ id: node.chapter.id, name: node.chapter.name })
                            }}
                          >
                            Rename
                          </DropdownItem>
                          <DropdownItem
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onSelect={() => {
                              close()
                              setAddParent({ parentId: node.chapter.id })
                            }}
                          >
                            Add sub-chapter
                          </DropdownItem>
                          <DropdownItem
                            danger
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onSelect={() => {
                              close()
                              setDeleteTarget({
                                id: node.chapter.id,
                                name: node.chapter.name,
                                children: node.children.length,
                              })
                            }}
                          >
                            Delete
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  </div>

                  {node.children.length ? (
                    <div className="mt-1.5 space-y-px border-l border-line pl-3">
                      {node.children.map((child, childIndex) => (
                        <div key={child.chapter.id} className="flex items-center gap-2">
                          <Link
                            href={`/chapters/${child.chapter.id}`}
                            className={cn('min-w-0 flex-1 truncate py-1 text-[12.5px] text-body hover:text-accent')}
                          >
                            {child.chapter.name}
                          </Link>
                          <span className="text-[10.5px] tabular-nums text-faint">
                            {child.revised}/{child.total}
                          </span>
                          <div className="hidden items-center gap-0.5 sm:flex">
                            <button
                              onClick={() =>
                                void move(
                                  node.children.map((row) => row.chapter.id),
                                  childIndex,
                                  -1,
                                )
                              }
                              disabled={childIndex === 0}
                              aria-label={`Move ${child.chapter.name} up`}
                              className="rounded p-1 text-faint hover:text-ink disabled:opacity-30"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() =>
                                void move(
                                  node.children.map((row) => row.chapter.id),
                                  childIndex,
                                  1,
                                )
                              }
                              disabled={childIndex === node.children.length - 1}
                              aria-label={`Move ${child.chapter.name} down`}
                              className="rounded p-1 text-faint hover:text-ink disabled:opacity-30"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                          <Dropdown
                            trigger={
                              <button
                                aria-label={`Actions for ${child.chapter.name}`}
                                className="rounded p-1 text-faint hover:text-ink"
                              >
                                <MoreHorizontal className="h-3 w-3" />
                              </button>
                            }
                          >
                            {(close) => (
                              <>
                                <DropdownItem
                                  icon={<Pencil className="h-3.5 w-3.5" />}
                                  onSelect={() => {
                                    close()
                                    setRenameTarget({ id: child.chapter.id, name: child.chapter.name })
                                  }}
                                >
                                  Rename
                                </DropdownItem>
                                <DropdownItem
                                  danger
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                  onSelect={() => {
                                    close()
                                    setDeleteTarget({ id: child.chapter.id, name: child.chapter.name, children: 0 })
                                  }}
                                >
                                  Delete
                                </DropdownItem>
                              </>
                            )}
                          </Dropdown>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="No chapters yet"
            description="Add your first chapter to start filing questions."
            action={
              <Button variant="primary" onClick={() => setAddParent({ parentId: null })}>
                <Plus className="h-3.5 w-3.5" /> Add chapter
              </Button>
            }
          />
        )}
      </section>

      <NamePrompt
        open={Boolean(addParent)}
        title={addParent?.parentId ? 'Add sub-chapter' : 'Add chapter'}
        placeholder="Chapter name"
        onClose={() => setAddParent(null)}
        onSubmit={async (value) => {
          await createChapter({ subjectId, parentId: addParent?.parentId ?? null, name: value })
          toast('Chapter added')
        }}
      />

      <NamePrompt
        open={Boolean(renameTarget)}
        title={renameTarget?.subject ? 'Rename subject' : 'Rename chapter'}
        initial={renameTarget?.name}
        onClose={() => setRenameTarget(null)}
        onSubmit={async (value) => {
          if (!renameTarget) return
          if (renameTarget.subject) await renameSubject(renameTarget.id, value)
          else await renameChapter(renameTarget.id, value)
          toast('Renamed')
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'chapter'}?`}
        description={
          deleteTarget?.children
            ? 'Its sub-chapters will be deleted too. Questions keep their photos and move to the Inbox instead of being deleted.'
            : 'Questions in this chapter move to the Inbox with their photos and solutions intact. Notes for this chapter are removed.'
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteChapter(deleteTarget.id, { keepQuestions: true })
          setDeleteTarget(null)
          toast('Chapter deleted — questions moved to Inbox')
        }}
      />

      <ConfirmDialog
        open={deleteSubjectOpen}
        title={`Delete ${data.subject.name}?`}
        description="This removes every chapter in this subject. Questions are kept and moved to the Inbox."
        confirmLabel="Delete subject"
        onClose={() => setDeleteSubjectOpen(false)}
        onConfirm={async () => {
          await deleteSubject(data.subject.id)
          toast('Subject deleted')
          router.push('/subjects')
        }}
      />
    </div>
  )
}
