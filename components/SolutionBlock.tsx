'use client'

import { Camera, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAttachmentThumbUrl, useAttachmentUrl, useQuestionAttachments } from '@/lib/hooks'
import { addImageAttachment, deleteAttachment, saveSolutionText } from '@/lib/store'
import type { Attachment, Question } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { Button, ConfirmDialog, ImageViewer, toast } from './ui'

function SolutionImage({
  attachment,
  onOpen,
  onDelete,
}: {
  attachment: Attachment
  onOpen: (url: string) => void
  onDelete: (attachment: Attachment) => void
}) {
  const thumbUrl = useAttachmentThumbUrl(attachment)
  const fullUrl = useAttachmentUrl(attachment)
  const url = thumbUrl ?? fullUrl
  return (
    <figure className="group relative overflow-hidden rounded-lg border border-line bg-surface">
      {url ? (
        <button type="button" onClick={() => onOpen(fullUrl ?? url)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Handwritten solution"
            loading="lazy"
            decoding="async"
            className="max-h-[280px] w-full cursor-zoom-in object-contain"
          />
        </button>
      ) : (
        <div className="flex h-32 items-center justify-center text-[11.5px] text-muted">Loading photo…</div>
      )}
      <button
        type="button"
        onClick={() => onDelete(attachment)}
        aria-label="Delete solution photo"
        className="absolute right-1.5 top-1.5 rounded-md border border-line bg-surface/95 p-1.5 text-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </figure>
  )
}

export function SolutionBlock({
  question,
  onChanged,
  compact,
}: {
  question: Question
  onChanged?: () => void
  compact?: boolean
}) {
  const attachments = useQuestionAttachments(question.id)
  const solutions = useMemo(() => (attachments ?? []).filter((row) => row.kind === 'solution'), [attachments])
  const hasSolution = solutions.length > 0 || Boolean(question.solutionText?.trim())

  const [revealed, setRevealed] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question.solutionText ?? '')
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File | null | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      await addImageAttachment({ questionId: question.id, kind: 'solution', file })
      setRevealed(true)
      onChanged?.()
      if (file.size > 2_000_000) toast('Photo optimised and attached')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not attach the photo', 'error')
    } finally {
      setBusy(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  const saveText = async () => {
    setBusy(true)
    try {
      await saveSolutionText(question.id, draft)
      setEditing(false)
      onChanged?.()
      toast('Explanation saved')
    } catch {
      toast('Could not save the explanation', 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeAttachment = async () => {
    if (!pendingDelete) return
    await deleteAttachment(pendingDelete.id)
    setPendingDelete(null)
    onChanged?.()
    toast('Solution photo deleted')
  }

  const photoInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
    </>
  )

  if (!revealed) {
    return (
      <div className={cn('rounded-lg border border-line bg-surface-2 px-3.5 py-3', compact && 'px-3 py-2.5')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12.5px] font-medium text-body">Solution</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {hasSolution ? 'Hidden until you reveal it.' : 'No solution attached yet.'}
            </p>
          </div>
          {hasSolution ? (
            <Button variant="secondary" onClick={() => setRevealed(true)}>
              <Eye className="h-3.5 w-3.5" /> Reveal Solution
            </Button>
          ) : (
            <div className="flex gap-1.5">
              <Button variant="secondary" onClick={() => cameraRef.current?.click()} loading={busy}>
                <Camera className="h-3.5 w-3.5" /> Add photo
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Plus className="h-3.5 w-3.5" /> Write
              </Button>
            </div>
          )}
        </div>
        {photoInputs}
        {pendingDelete ? null : null}
        {!hasSolution && editing ? (
          <div className="mt-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              autoFocus
              placeholder="Write your solution or the approach you want to remember."
              className="input resize-y"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveText} loading={busy}>
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <p className="text-[12.5px] font-medium text-body">
          Solution {solutions.length ? `· ${solutions.length} photo${solutions.length === 1 ? '' : 's'}` : ''}
        </p>
        <Button variant="ghost" onClick={() => setRevealed(false)}>
          <EyeOff className="h-3.5 w-3.5" /> Hide Solution
        </Button>
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {solutions.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {solutions.map((attachment) => (
              <SolutionImage
                key={attachment.id}
                attachment={attachment}
                onOpen={setViewer}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        ) : null}

        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              autoFocus
              placeholder="Written explanation, shortcut or the exact mistake to avoid."
              className="input resize-y"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveText} loading={busy}>
                Save explanation
              </Button>
            </div>
          </div>
        ) : question.solutionText?.trim() ? (
          <div className="rounded-md bg-surface-2 px-3 py-2.5">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-body">{question.solutionText}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10.5px] text-faint">Updated {formatDate(question.updatedAt)}</span>
              <button
                className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink"
                onClick={() => {
                  setDraft(question.solutionText ?? '')
                  setEditing(true)
                }}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>
          </div>
        ) : null}

        {!solutions.length && !question.solutionText?.trim() ? (
          <p className="text-[12.5px] text-muted">Nothing attached yet. Capture the handwritten solution below.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" onClick={() => cameraRef.current?.click()} loading={busy}>
            <Camera className="h-3.5 w-3.5" /> Camera
          </Button>
          <Button variant="ghost" onClick={() => galleryRef.current?.click()} loading={busy}>
            <ImagePlus className="h-3.5 w-3.5" /> Gallery
          </Button>
          {!editing ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(question.solutionText ?? '')
                setEditing(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> {question.solutionText ? 'Edit explanation' : 'Write explanation'}
            </Button>
          ) : null}
        </div>
        {photoInputs}
      </div>

      {viewer ? <ImageViewer src={viewer} onClose={() => setViewer(null)} /> : null}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete solution photo?"
        description="This removes the photo from this question. It cannot be undone."
        onConfirm={removeAttachment}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
