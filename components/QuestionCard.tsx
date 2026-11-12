'use client'

import { useDraggable } from '@dnd-kit/core'
import {
  Bookmark,
  Camera,
  Flag,
  GripVertical,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
  MoveRight,
  Eye,
  Inbox,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAttachmentUrl, useChapterOptions, useQuestionAttachments } from '@/lib/hooks'
import { deleteQuestion, moveQuestion, toggleBookmark, toggleDifficult } from '@/lib/store'
import { DIFFICULTY_LABEL, SOURCE_LABEL, type Question } from '@/lib/types'
import { cn, formatShortDate, relativeTime } from '@/lib/utils'
import {
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  EmptyState,
  IconButton,
  Sheet,
  toast,
} from './ui'

function useQuestionImage(questionId: string | undefined) {
  const attachments = useQuestionAttachments(questionId)
  return (attachments ?? []).find((row) => row.kind === 'question_image') ?? null
}

export function MoveChapterSheet({
  open,
  onClose,
  questionId,
  currentChapterId,
}: {
  open: boolean
  onClose: () => void
  questionId: string
  currentChapterId: string | null
}) {
  const options = useChapterOptions()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = (options ?? []).filter(
      (row) =>
        !term ||
        row.chapter.name.toLowerCase().includes(term) ||
        (row.subject?.name.toLowerCase().includes(term) ?? false),
    )
    const map = new Map<string, { subject: string; rows: typeof rows }>()
    for (const row of rows) {
      const key = row.subject?.name ?? 'Other'
      if (!map.has(key)) map.set(key, { subject: key, rows: [] })
      map.get(key)!.rows.push(row)
    }
    return Array.from(map.values())
  }, [options, search])

  const move = async (chapterId: string | null, label: string) => {
    await moveQuestion(questionId, chapterId)
    toast(`Moved to ${label}`)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Move question" description="Pick the chapter this belongs to.">
      <input
        autoFocus
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search chapters…"
        className="input mb-3"
      />
      <button
        onClick={() => void move(null, 'Inbox')}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-[#F7F7F3]"
      >
        <Inbox className="h-4 w-4 text-[#8A8A85]" />
        Inbox (unsorted)
        {currentChapterId === null ? <span className="ml-auto text-[11px] text-accent">current</span> : null}
      </button>
      <div className="thin-scroll max-h-[50dvh] space-y-3 overflow-y-auto">
        {grouped.map((group) => (
          <div key={group.subject}>
            <p className="section-title mb-1 px-1">{group.subject}</p>
            <div className="space-y-0.5">
              {group.rows.map((row) => (
                <button
                  key={row.chapter.id}
                  onClick={() => void move(row.chapter.id, row.chapter.name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[#F3F3EF]',
                    row.chapter.id === currentChapterId && 'bg-accent-soft text-accent',
                  )}
                >
                  {row.chapter.parentId ? <span className="pl-3 text-[#B3B3AC]">›</span> : null}
                  {row.chapter.name}
                  {row.chapter.id === currentChapterId ? <span className="ml-auto text-[11px]">current</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!grouped.length ? <EmptyState title="No chapter matches" description="Try a different search term." /> : null}
      </div>
    </Sheet>
  )
}

export function QuestionCard({
  question,
  chapterName,
  solutionCount = 0,
  revisionStatus,
  revisedAt,
  onOpen,
  onEdit,
  compact,
}: {
  question: Question
  chapterName?: string
  solutionCount?: number
  revisionStatus?: string | null
  revisedAt?: string | null
  onOpen?: () => void
  onEdit?: () => void
  compact?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: question.id,
    data: { type: 'question', id: question.id, text: question.questionText },
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const preview = question.questionText.replace(/\s+/g, ' ').trim()
  // Photo-only cards show the screenshot itself; nothing else identifies them.
  const questionImage = useQuestionImage(preview ? undefined : question.id)
  const questionImageUrl = useAttachmentUrl(questionImage)
  const statusChip =
    revisionStatus === 'revised'
      ? { label: 'Revised', tone: 'text-[#216A4A] bg-[#EAF4EE] border-[#CFE6D9]' }
      : revisionStatus === 'incorrect'
        ? { label: 'Incorrect', tone: 'text-[#B42318] bg-[#FBEEEE] border-[#EFD3D3]' }
        : revisionStatus === 'shaky'
          ? { label: 'Shaky', tone: 'text-[#8A5A12] bg-[#FBF3E6] border-[#EDDFC5]' }
          : { label: 'New', tone: 'text-[#5B5B55] bg-[#F3F3EF] border-[#E4E4DE]' }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'card group relative px-3.5 py-3 transition-colors',
        isDragging && 'opacity-40',
        compact && 'px-3 py-2.5',
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag question to a chapter"
          className="mt-0.5 hidden cursor-grab rounded p-1 text-[#C4C4BC] hover:bg-[#F3F3EF] hover:text-[#8A8A85] active:cursor-grabbing lg:block"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium',
                statusChip.tone,
              )}
            >
              {statusChip.label}
            </span>
            <span className="chip">{DIFFICULTY_LABEL[question.difficulty]}</span>
            <span className="chip">{SOURCE_LABEL[question.sourceType]}</span>
            {chapterName ? <span className="chip max-w-[160px] truncate">{chapterName}</span> : null}
            {question.isDifficult ? (
              <span className="inline-flex items-center gap-1 rounded border border-[#EDDFC5] bg-[#FBF3E6] px-1.5 py-0.5 text-[10.5px] text-[#8A5A12]">
                <Flag className="h-2.5 w-2.5" /> Difficult
              </span>
            ) : null}
            {question.isBookmarked ? (
              <span className="inline-flex items-center gap-1 rounded border border-[#D9E0F7] bg-[#EEF1FC] px-1.5 py-0.5 text-[10.5px] text-accent">
                <Bookmark className="h-2.5 w-2.5 fill-current" /> Saved
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpen}
            className="block w-full text-left"
            aria-label="Open question"
          >
            {preview ? (
              <p className={cn('line-clamp-2-safe text-[13.5px] leading-relaxed text-[#2A2A27]', compact && 'text-[13px]')}>
                {preview}
              </p>
            ) : questionImageUrl ? (
              <div className="overflow-hidden rounded-md border border-line bg-[#F3F3EF]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={questionImageUrl}
                  alt="Question screenshot"
                  loading="lazy"
                  className="max-h-44 w-full object-cover object-top"
                />
              </div>
            ) : (
              <p className="text-[13px] italic text-[#9A9A94]">Photo-only question</p>
            )}
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#9A9A94]">
            {question.questionImagePath || question.questionText ? null : null}
            <span>{formatShortDate(question.createdAt)}</span>
            {solutionCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[#6B6B66]">
                <ImageIcon className="h-3 w-3" /> {solutionCount} solution photo{solutionCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#B08B5A]">
                <Camera className="h-3 w-3" /> No solution
              </span>
            )}
            {revisedAt ? <span>· revised {relativeTime(revisedAt)}</span> : null}
            {question.sourceName ? <span className="truncate">· {question.sourceName}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label={question.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            onClick={() => void toggleBookmark(question.id)}
            className={question.isBookmarked ? 'text-accent' : undefined}
          >
            <Bookmark className={cn('h-4 w-4', question.isBookmarked && 'fill-current')} />
          </IconButton>
          <IconButton
            label={question.isDifficult ? 'Unmark difficult' : 'Mark difficult'}
            onClick={() => void toggleDifficult(question.id)}
            className={question.isDifficult ? 'text-[#8A5A12]' : undefined}
          >
            <Flag className={cn('h-4 w-4', question.isDifficult && 'fill-current')} />
          </IconButton>
          <Dropdown
            trigger={
              <IconButton label="Question actions">
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            }
          >
            {(close) => (
              <>
                <DropdownItem icon={<Eye className="h-3.5 w-3.5" />} onSelect={() => { close(); onOpen?.() }}>
                  Open & reveal
                </DropdownItem>
                {onEdit ? (
                  <DropdownItem icon={<Pencil className="h-3.5 w-3.5" />} onSelect={() => { close(); onEdit() }}>
                    Edit question
                  </DropdownItem>
                ) : null}
                <DropdownItem
                  icon={<MoveRight className="h-3.5 w-3.5" />}
                  onSelect={() => { close(); setMoveOpen(true) }}
                >
                  Move to chapter
                </DropdownItem>
                <DropdownItem
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onSelect={() => { close(); setConfirmOpen(true) }}
                >
                  Delete
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      <MoveChapterSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        questionId={question.id}
        currentChapterId={question.primaryChapterId}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this question?"
        description="The question, its photos and its revision history will be permanently removed."
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await deleteQuestion(question.id)
          setConfirmOpen(false)
          toast('Question deleted')
        }}
      />
    </div>
  )
}
