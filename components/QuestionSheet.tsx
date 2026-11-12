'use client'

import { Bookmark, CheckCircle2, Flag, MoveRight, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  useAttachmentUrl,
  useChapterOptions,
  useQuestionAttachments,
  useQuestionByIid,
  useQuestionTags,
} from '@/lib/hooks'
import { deleteQuestion, recordRevision, toggleBookmark, toggleDifficult } from '@/lib/store'
import { DIFFICULTY_LABEL, SOURCE_LABEL, type Attachment } from '@/lib/types'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import { QuestionForm } from './QuestionForm'
import { MoveChapterSheet } from './QuestionCard'
import { SolutionBlock } from './SolutionBlock'
import { Button, ConfirmDialog, ImageViewer, Sheet, toast } from './ui'

function QuestionPhoto({ attachment, onOpen }: { attachment: Attachment; onOpen: (url: string) => void }) {
  const url = useAttachmentUrl(attachment)
  if (!url) return <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
  return (
    <button type="button" onClick={() => onOpen(url)} className="block w-full overflow-hidden rounded-lg border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Question"
        loading="lazy"
        decoding="async"
        className="max-h-[420px] w-full cursor-zoom-in object-contain"
      />
    </button>
  )
}

export function QuestionSheet({
  questionId,
  open,
  onClose,
}: {
  questionId: string | null
  open: boolean
  onClose: () => void
}) {
  const question = useQuestionByIid(open ? questionId : null)
  const attachments = useQuestionAttachments(open ? questionId : null)
  const tags = useQuestionTags(open ? questionId : null)
  const chapterOptions = useChapterOptions()
  const [editing, setEditing] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const questionImage = (attachments ?? []).find((row) => row.kind === 'question_image') ?? null
  const chapter = (chapterOptions ?? []).find((row) => row.chapter.id === question?.primaryChapterId)
  const parent = chapter?.chapter.parentId
    ? (chapterOptions ?? []).find((row) => row.chapter.id === chapter.chapter.parentId)
    : null

  const close = () => {
    setEditing(false)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      size="lg"
      title={
        editing ? (
          'Edit question'
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 text-[14px]">
            <span>{chapter ? chapter.chapter.name : 'Inbox'}</span>
            <span className="text-[12px] font-normal text-muted">
              {chapter?.subject?.name ?? 'Unsorted'}
              {parent ? ` · ${parent.chapter.name}` : ''}
            </span>
          </span>
        )
      }
      description={!editing && question ? `${SOURCE_LABEL[question.sourceType]} · added ${formatDate(question.createdAt)}` : undefined}
      footer={
        editing || !question ? null : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={question.isBookmarked ? 'primary' : 'secondary'}
              onClick={async () => {
                const value = await toggleBookmark(question.id)
                toast(value ? 'Bookmarked' : 'Bookmark removed')
              }}
            >
              <Bookmark className={cn('h-3.5 w-3.5', question.isBookmarked && 'fill-current')} /> Bookmark
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const value = await toggleDifficult(question.id)
                toast(value ? 'Marked difficult' : 'Removed from difficult')
              }}
              className={question.isDifficult ? 'border-warn-line text-warn' : undefined}
            >
              <Flag className={cn('h-3.5 w-3.5', question.isDifficult && 'fill-current')} /> Difficult
            </Button>
            <Button variant="secondary" onClick={() => setMoveOpen(true)}>
              <MoveRight className="h-3.5 w-3.5" /> Move
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="ghost"
              className="ml-auto text-danger hover:bg-danger-soft"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await recordRevision({
                  questionId: question.id,
                  chapterId: question.primaryChapterId,
                  status: 'revised',
                })
                toast('Marked as revised')
                close()
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark revised
            </Button>
          </div>
        )
      }
    >
      {!question ? (
        <div className="py-10 text-center text-[13px] text-muted">Loading question…</div>
      ) : editing ? (
        <QuestionForm question={question} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip">{DIFFICULTY_LABEL[question.difficulty]}</span>
            <span className="chip">{SOURCE_LABEL[question.sourceType]}</span>
            {question.sourceName ? <span className="chip">{question.sourceName}</span> : null}
            <span className="chip">{formatDate(question.questionDate)}</span>
            {question.isDifficult ? <span className="chip text-warn">Difficult</span> : null}
            {question.isBookmarked ? <span className="chip text-accent">Bookmarked</span> : null}
          </div>

          {question.questionText?.trim() ? (
            <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-ink">{question.questionText}</p>
          ) : null}

          {questionImage ? <QuestionPhoto attachment={questionImage} onOpen={setViewer} /> : null}

          {question.personalRemark?.trim() ? (
            <div className="rounded-lg border-l-2 border-warn-line bg-warn-soft px-3 py-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warn">Remark</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-body">
                {question.personalRemark}
              </p>
            </div>
          ) : null}

          {tags && tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="chip">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <SolutionBlock question={question} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] text-faint">
            <span>Updated {relativeTime(question.updatedAt)}</span>
            <span>Question date {formatDate(question.questionDate)}</span>
            {question.primaryChapterId ? null : <span>Unassigned — drag it into a chapter</span>}
          </div>
        </div>
      )}

      {viewer ? <ImageViewer src={viewer} onClose={() => setViewer(null)} /> : null}
      {question ? (
        <MoveChapterSheet
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          questionId={question.id}
          currentChapterId={question.primaryChapterId}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this question?"
        description="The question, its photos and revision history will be permanently removed."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!question) return
          await deleteQuestion(question.id)
          setConfirmDelete(false)
          toast('Question deleted')
          close()
        }}
      />
    </Sheet>
  )
}
