'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAttachmentUrl, useChapterOptions, useChapters, useQuestionAttachments, useQuestionTags, useSubjects, useTopics } from '@/lib/hooks'
import {
  addImageAttachment,
  createQuestion,
  deleteAttachment,
  moveQuestion,
  setQuestionChapters,
  setQuestionTags,
  updateQuestion,
} from '@/lib/store'
import { DIFFICULTIES, DIFFICULTY_LABEL, SOURCES, SOURCE_LABEL, type Question } from '@/lib/types'
import { cn, todayISO } from '@/lib/utils'
import { Button, toast } from './ui'

const schema = z.object({
  questionText: z.string().max(20000).optional(),
  subjectId: z.string().min(1, 'Choose a subject'),
  chapterId: z.string().optional(),
  topicId: z.string().optional(),
  sourceType: z.enum(['mock', 'pyq', 'book', 'practice', 'other']),
  sourceName: z.string().max(200).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  personalRemark: z.string().max(4000).optional(),
  questionDate: z.string().min(1, 'Pick a date'),
  tags: z.string().max(400).optional(),
})

type FormValues = z.infer<typeof schema>

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-[11px] text-[#9A9A94]">{hint}</p> : null}
      {error ? <p className="mt-1 text-[11.5px] text-[#B42318]">{error}</p> : null}
    </div>
  )
}

export function QuestionForm({
  question,
  defaultSubjectId,
  defaultChapterId,
  compact,
  initialImage,
  onSaved,
  onCancel,
}: {
  question?: Question | null
  defaultSubjectId?: string
  defaultChapterId?: string | null
  compact?: boolean
  /** A screenshot pasted elsewhere in the app, attached as soon as the form mounts. */
  initialImage?: File | null
  onSaved?: (id: string) => void
  onCancel?: () => void
}) {
  const subjects = useSubjects()
  const chapterOptions = useChapterOptions()
  const chapters = useChapters()
  const existingTags = useQuestionTags(question?.id)
  const attachments = useQuestionAttachments(question?.id)
  const existingImage = useMemo(
    () => attachments?.find((row) => row.kind === 'question_image') ?? null,
    [attachments],
  )
  const existingImageUrl = useAttachmentUrl(existingImage)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [extraChapterIds, setExtraChapterIds] = useState<string[]>([])
  const [tagSeed, setTagSeed] = useState<string>('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const initialSubject =
    question?.subjectId ??
    defaultSubjectId ??
    subjects?.[0]?.id ??
    ''

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      questionText: question?.questionText ?? '',
      subjectId: initialSubject,
      chapterId: question?.primaryChapterId ?? defaultChapterId ?? '',
      topicId: question?.topicId ?? '',
      sourceType: question?.sourceType ?? 'mock',
      sourceName: question?.sourceName ?? '',
      difficulty: question?.difficulty ?? 'medium',
      personalRemark: question?.personalRemark ?? '',
      questionDate: question?.questionDate ?? todayISO(),
      tags: '',
    },
  })

  const { register, handleSubmit, watch, setValue, setError, formState } = form
  const subjectId = watch('subjectId')
  const chapterId = watch('chapterId')
  const topics = useTopics(chapterId || undefined)

  useEffect(() => {
    if (existingTags && !tagSeed) setTagSeed(existingTags.join(', '))
  }, [existingTags, tagSeed])

  // Subject data loads asynchronously; make sure the select always resolves to a real subject.
  useEffect(() => {
    if (!subjectId && subjects?.length) {
      setValue('subjectId', question?.subjectId ?? defaultSubjectId ?? subjects[0].id)
    }
  }, [subjectId, subjects, question?.subjectId, defaultSubjectId, setValue])

  useEffect(() => {
    if (initialImage) setFile(initialImage)
  }, [initialImage])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const subjectChapters = useMemo(
    () => (chapterOptions ?? []).filter((row) => row.chapter.subjectId === subjectId),
    [chapterOptions, subjectId],
  )

  const extraCandidates = useMemo(
    () =>
      subjectChapters.filter(
        (row) => row.chapter.id !== chapterId && !extraChapterIds.includes(row.chapter.id),
      ),
    [subjectChapters, chapterId, extraChapterIds],
  )

  const chapterLabel = (id: string) => {
    const row = (chapters ?? []).find((chapter) => chapter.id === id)
    if (!row) return ''
    const parent = row.parentId ? (chapters ?? []).find((chapter) => chapter.id === row.parentId) : null
    return parent ? `${parent.name} › ${row.name}` : row.name
  }

  const onSubmit = handleSubmit(async (values) => {
    const text = (values.questionText ?? '').trim()
    if (!text && !file && !existingImage) {
      setError('questionText', { message: 'Add question text or attach a photo.' })
      return
    }
    setBusy(true)
    const tags = (values.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    try {
      if (question) {
        const nextChapter = values.chapterId || null
        await updateQuestion(question.id, {
          questionText: text,
          sourceType: values.sourceType,
          sourceName: values.sourceName?.trim() || null,
          difficulty: values.difficulty,
          personalRemark: values.personalRemark?.trim() || null,
          questionDate: values.questionDate,
          topicId: values.topicId || null,
        })
        if (nextChapter !== (question.primaryChapterId ?? null)) {
          await moveQuestion(question.id, nextChapter)
        }
        await setQuestionTags(question.id, tags)
        await setQuestionChapters(question.id, extraChapterIds)
        if (file) {
          if (existingImage) await deleteAttachment(existingImage.id)
          await addImageAttachment({ questionId: question.id, kind: 'question_image', file })
        }
        toast('Question updated')
        onSaved?.(question.id)
      } else {
        const id = await createQuestion({
          questionText: text,
          questionImage: file,
          subjectId: values.subjectId,
          chapterId: values.chapterId || null,
          topicId: values.topicId || null,
          sourceType: values.sourceType,
          sourceName: values.sourceName ?? null,
          difficulty: values.difficulty,
          personalRemark: values.personalRemark ?? null,
          questionDate: values.questionDate,
          tags,
          extraChapterIds,
        })
        toast(values.chapterId ? `Saved to ${chapterLabel(values.chapterId)}` : 'Saved to Inbox')
        setFile(null)
        setTagSeed('')
        form.reset({
          ...form.getValues(),
          questionText: '',
          tags: '',
          personalRemark: '',
          sourceName: '',
          difficulty: 'medium',
        })
        onSaved?.(id)
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the question', 'error')
    } finally {
      setBusy(false)
    }
  })

  const photoLabel = existingImage || file ? 'Replace photo' : 'Add photo'

  /** Screenshots pasted from the clipboard attach straight to the question. */
  const handlePaste = (event: React.ClipboardEvent<HTMLFormElement>) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const pasted = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    if (!pasted) return
    event.stopPropagation()
    const hasText = items.some((item) => item.kind === 'string' && item.type === 'text/plain')
    if (!hasText) event.preventDefault()
    setFile(pasted)
    toast('Screenshot attached')
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" onPaste={handlePaste}>
      <div>
        <Field
          label="Question"
          htmlFor="questionText"
          error={formState.errors.questionText?.message}
        >
          <textarea
            id="questionText"
            rows={compact ? 3 : 4}
            placeholder="Paste a screenshot, or type the question. Text is optional."
            className="input resize-y leading-relaxed"
            {...register('questionText')}
          />
        </Field>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" className="border border-line" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-3.5 w-3.5" /> {photoLabel}
          </Button>
          <Button type="button" variant="ghost" className="border border-line" onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" /> Gallery
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {preview || (existingImage && existingImageUrl) ? (
            <div className="flex items-center gap-2">
              <div className="relative h-12 w-12 overflow-hidden rounded-md border border-line bg-[#F3F3EF]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview ?? existingImageUrl ?? ''} alt="Question attachment preview" className="h-full w-full object-cover" />
              </div>
              {file ? (
                <button
                  type="button"
                  className="text-[11.5px] text-muted underline decoration-dotted"
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Subject" htmlFor="subjectId">
          <select
            id="subjectId"
            className="select"
            {...register('subjectId', {
              onChange: () => {
                setValue('chapterId', '')
                setValue('topicId', '')
              },
            })}
          >
            {(subjects ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Chapter" htmlFor="chapterId" hint={chapterId ? undefined : 'Leave as Inbox to sort later'}>
          <select id="chapterId" className="select" {...register('chapterId')}>
            <option value="">Inbox (unsorted)</option>
            {subjectChapters.map((row) => (
              <option key={row.chapter.id} value={row.chapter.id}>
                {row.chapter.parentId ? '— ' : ''}
                {row.chapter.name}
              </option>
            ))}
          </select>
        </Field>

        {topics && topics.length > 0 ? (
          <Field label="Topic" htmlFor="topicId">
            <select id="topicId" className="select" {...register('topicId')}>
              <option value="">None</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Source" htmlFor="sourceType">
          <select id="sourceType" className="select" {...register('sourceType')}>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Exam / mock name" htmlFor="sourceName">
          <input
            id="sourceName"
            className="input"
            placeholder="e.g. SSC CGL Tier 1 Mocks"
            {...register('sourceName')}
          />
        </Field>

        <Field label="Date" htmlFor="questionDate" error={formState.errors.questionDate?.message}>
          <input id="questionDate" type="date" className="input" {...register('questionDate')} />
        </Field>
      </div>

      <div>
        <span className="label">Difficulty</span>
        <div className="flex gap-1.5">
          {DIFFICULTIES.map((difficulty) => {
            const current = watch('difficulty')
            return (
              <button
                key={difficulty}
                type="button"
                onClick={() => setValue('difficulty', difficulty)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[12px] transition-colors',
                  current === difficulty
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-[#E1E1DC] bg-white text-[#6B6B66] hover:border-[#CFCFC8]',
                )}
              >
                {DIFFICULTY_LABEL[difficulty]}
              </button>
            )
          })}
        </div>
      </div>

      <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. silly mistake, formula based">
        <input
          id="tags"
          className="input"
          placeholder="silly mistake, tricky"
          value={tagSeed}
          onChange={(event) => {
            setTagSeed(event.target.value)
            setValue('tags', event.target.value)
          }}
        />
      </Field>

      <Field label="Personal remark" htmlFor="personalRemark">
        <textarea
          id="personalRemark"
          rows={2}
          className="input resize-y"
          placeholder="Why did you get this wrong?"
          {...register('personalRemark')}
        />
      </Field>

      {question ? (
        <Field label="Also appears in" hint="Optional extra chapter association">
          <div className="flex flex-wrap items-center gap-1.5">
            {extraChapterIds.map((id) => (
              <span key={id} className="chip">
                {chapterLabel(id)}
                <button
                  type="button"
                  onClick={() => setExtraChapterIds((rows) => rows.filter((row) => row !== id))}
                  aria-label={`Remove ${chapterLabel(id)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {extraCandidates.length ? (
              <select
                className="select max-w-[220px] py-1 text-[12px]"
                value=""
                onChange={(event) => {
                  if (event.target.value) setExtraChapterIds((rows) => [...rows, event.target.value])
                }}
              >
                <option value="">Add chapter…</option>
                {extraCandidates.map((row) => (
                  <option key={row.chapter.id} value={row.chapter.id}>
                    {row.chapter.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </Field>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {onCancel ? (
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? 'Saving…' : question ? 'Save changes' : chapterId ? 'Save to chapter' : 'Save to Inbox'}
        </Button>
      </div>
    </form>
  )
}

export function QuickPhotoStatus({ busy }: { busy: boolean }) {
  if (!busy) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
      <Loader2 className="h-3 w-3 animate-spin" /> Optimising photo…
    </span>
  )
}
