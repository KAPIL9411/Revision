import { db, getUserId } from './db'
import { processImage } from './images'
import type {
  Attachment,
  AttachmentKind,
  Chapter,
  Difficulty,
  Entity,
  Formula,
  Question,
  RevisionStatus,
  SourceType,
} from './types'
import { nowISO, todayISO, uid } from './utils'

export class VaultError extends Error {}

function emitSync() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vault:sync', { detail: 'write' }))
}

export async function enqueue(entity: Entity, entityId: string, op: 'upsert' | 'delete') {
  const pending = await db.outbox.where('entity').equals(entity).toArray()
  const same = pending.filter((row) => row.entityId === entityId && row.seq != null)
  if (same.length) await db.outbox.bulkDelete(same.map((row) => row.seq as number))
  await db.outbox.add({ entity, entityId, op, createdAt: Date.now(), attempts: 0 })
  emitSync()
}

type RowLike = { id: string } & Record<string, any>

async function putRow(table: Entity, row: RowLike) {
  await (db as unknown as Record<string, { put: (r: unknown) => Promise<unknown> }>)[table].put(row)
  await enqueue(table, row.id, 'upsert')
}

async function removeRow(table: Entity, id: string) {
  await (db as unknown as Record<string, { delete: (k: string) => Promise<unknown> }>)[table].delete(id)
  await enqueue(table, id, 'delete')
}

/* ------------------------------------------------------------------ chapters */

export async function createSubject(name: string) {
  const userId = await getUserId()
  const ts = nowISO()
  const order = await db.subjects.count()
  const row = {
    id: uid(),
    userId,
    name: name.trim(),
    slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
    color: '#3157D5',
    position: order,
    createdAt: ts,
    updatedAt: ts,
  }
  await putRow('subjects', row)
  return row.id
}

export async function renameSubject(id: string, name: string) {
  const subject = await db.subjects.get(id)
  if (!subject) return
  await putRow('subjects', { ...subject, name: name.trim(), updatedAt: nowISO() })
}

export async function deleteSubject(id: string) {
  const chapters = await db.chapters.where('subjectId').equals(id).toArray()
  for (const chapter of chapters) await deleteChapter(chapter.id, { keepQuestions: true })
  await removeRow('subjects', id)
}

export async function createChapter(input: { subjectId: string; parentId?: string | null; name: string }) {
  const userId = await getUserId()
  const ts = nowISO()
  const siblings = await db.chapters
    .where('subjectId')
    .equals(input.subjectId)
    .filter((chapter) => (chapter.parentId ?? null) === (input.parentId ?? null))
    .count()
  const row: Chapter = {
    id: uid(),
    userId,
    subjectId: input.subjectId,
    parentId: input.parentId ?? null,
    name: input.name.trim(),
    position: siblings,
    createdAt: ts,
    updatedAt: ts,
  }
  await putRow('chapters', row)
  return row.id
}

export async function renameChapter(id: string, name: string) {
  const chapter = await db.chapters.get(id)
  if (!chapter) return
  await putRow('chapters', { ...chapter, name: name.trim(), updatedAt: nowISO() })
}

export async function reorderChapters(orderedIds: string[]) {
  const ts = nowISO()
  for (let index = 0; index < orderedIds.length; index += 1) {
    const chapter = await db.chapters.get(orderedIds[index])
    if (chapter && chapter.position !== index) await putRow('chapters', { ...chapter, position: index, updatedAt: ts })
  }
}

export async function deleteChapter(id: string, options: { keepQuestions?: boolean } = {}) {
  const children = await db.chapters.where('parentId').equals(id).toArray()
  for (const child of children) await deleteChapter(child.id, options)

  const questions = await db.questions.where('primaryChapterId').equals(id).toArray()
  for (const question of questions) {
    if (options.keepQuestions) {
      await putRow('questions', { ...question, primaryChapterId: null, updatedAt: nowISO() })
    } else {
      await deleteQuestion(question.id)
    }
  }

  const links = await db.questionChapters.where('chapterId').equals(id).toArray()
  for (const link of links) await removeRow('questionChapters', link.id)

  const note = await db.chapterNotes.where('chapterId').equals(id).first()
  if (note) {
    const noteImages = await db.attachments.where('noteId').equals(note.id).toArray()
    for (const image of noteImages) await removeRow('attachments', image.id)
    await removeRow('chapterNotes', note.id)
  }

  const formulas = await db.formulas.where('chapterId').equals(id).toArray()
  for (const formula of formulas) {
    await putRow('formulas', { ...formula, chapterId: null, updatedAt: nowISO() })
  }

  const topics = await db.topics.where('chapterId').equals(id).toArray()
  for (const topic of topics) await removeRow('topics', topic.id)

  await removeRow('chapters', id)
}

/* --------------------------------------------------------------------- topics */

export async function createTopic(chapterId: string, name: string) {
  const userId = await getUserId()
  const ts = nowISO()
  const position = await db.topics.where('chapterId').equals(chapterId).count()
  const row = { id: uid(), userId, chapterId, name: name.trim(), position, createdAt: ts, updatedAt: ts }
  await putRow('topics', row)
  return row.id
}

export async function renameTopic(id: string, name: string) {
  const topic = await db.topics.get(id)
  if (!topic) return
  await putRow('topics', { ...topic, name: name.trim(), updatedAt: nowISO() })
}

export async function deleteTopic(id: string) {
  await removeRow('topics', id)
}

/* -------------------------------------------------------------------- questions */

export interface QuestionDraft {
  questionText?: string
  questionImage?: File | null
  subjectId: string
  chapterId?: string | null
  topicId?: string | null
  sourceType?: SourceType
  sourceName?: string | null
  difficulty?: Difficulty
  personalRemark?: string | null
  solutionText?: string | null
  tags?: string[]
  questionDate?: string
  extraChapterIds?: string[]
}

export async function createQuestion(draft: QuestionDraft) {
  const text = (draft.questionText ?? '').trim()
  if (!text && !draft.questionImage) {
    throw new VaultError('Add question text or a photo before saving.')
  }
  const userId = await getUserId()
  const ts = nowISO()
  const id = uid()
  const row: Question = {
    id,
    userId,
    questionText: text,
    questionImagePath: null,
    subjectId: draft.subjectId,
    primaryChapterId: draft.chapterId ?? null,
    topicId: draft.topicId ?? null,
    sourceType: draft.sourceType ?? 'mock',
    sourceName: draft.sourceName?.trim() || null,
    difficulty: draft.difficulty ?? 'medium',
    personalRemark: draft.personalRemark?.trim() || null,
    solutionText: draft.solutionText?.trim() || null,
    isBookmarked: 0,
    isDifficult: draft.difficulty === 'hard' ? 1 : 0,
    questionDate: draft.questionDate || todayISO(),
    createdAt: ts,
    updatedAt: ts,
  }
  await putRow('questions', row)

  if (draft.questionImage) {
    const attachmentId = await addImageAttachment({ questionId: id, kind: 'question_image', file: draft.questionImage })
    await db.attachments.update(attachmentId, { displayOrder: 0 })
  }
  if (draft.tags?.length) await setQuestionTags(id, draft.tags)
  if (draft.extraChapterIds?.length) await setQuestionChapters(id, draft.extraChapterIds.filter((chapterId) => chapterId !== row.primaryChapterId))
  return id
}

export async function updateQuestion(id: string, patch: Partial<Question>) {
  const question = await db.questions.get(id)
  if (!question) throw new VaultError('That question no longer exists.')
  const next: Question = { ...question, ...patch, updatedAt: nowISO() }
  await putRow('questions', next)
  return next
}

export async function saveSolutionText(id: string, text: string) {
  await updateQuestion(id, { solutionText: text.trim() || null })
}

export async function moveQuestion(id: string, chapterId: string | null) {
  const question = await db.questions.get(id)
  if (!question) return
  let subjectId = question.subjectId
  if (chapterId) {
    const chapter = await db.chapters.get(chapterId)
    if (chapter) subjectId = chapter.subjectId
  }
  await putRow('questions', {
    ...question,
    primaryChapterId: chapterId,
    subjectId,
    updatedAt: nowISO(),
  })
  const links = await db.questionChapters.where('questionId').equals(id).toArray()
  for (const link of links) {
    if (link.chapterId !== chapterId) await removeRow('questionChapters', link.id)
  }
}

export async function toggleBookmark(id: string) {
  const question = await db.questions.get(id)
  if (!question) return 0
  const value = question.isBookmarked ? 0 : 1
  await updateQuestion(id, { isBookmarked: value as 0 | 1 })
  return value
}

export async function toggleDifficult(id: string) {
  const question = await db.questions.get(id)
  if (!question) return 0
  const value = question.isDifficult ? 0 : 1
  await updateQuestion(id, { isDifficult: value as 0 | 1 })
  return value
}

export async function deleteQuestion(id: string) {
  const attachments = await db.attachments.where('questionId').equals(id).toArray()
  for (const attachment of attachments) await removeRow('attachments', attachment.id)
  const links = await db.questionChapters.where('questionId').equals(id).toArray()
  for (const link of links) await removeRow('questionChapters', link.id)
  const tagLinks = await db.questionTags.where('questionId').equals(id).toArray()
  for (const tagLink of tagLinks) await removeRow('questionTags', tagLink.id)
  const revisions = await db.revisionHistory.where('questionId').equals(id).toArray()
  for (const revision of revisions) await removeRow('revisionHistory', revision.id)
  await removeRow('questions', id)
}

export async function setQuestionChapters(questionId: string, chapterIds: string[]) {
  const existing = await db.questionChapters.where('questionId').equals(questionId).toArray()
  const wanted = new Set(chapterIds)
  for (const link of existing) {
    if (!wanted.has(link.chapterId)) await removeRow('questionChapters', link.id)
  }
  const current = new Set(existing.map((link) => link.chapterId))
  const userId = await getUserId()
  for (const chapterId of chapterIds) {
    if (current.has(chapterId)) continue
    const ts = nowISO()
    await putRow('questionChapters', {
      id: uid(),
      userId,
      questionId,
      chapterId,
      createdAt: ts,
      updatedAt: ts,
    })
  }
}

/* ------------------------------------------------------------------------ tags */

export async function setQuestionTags(questionId: string, names: string[]) {
  const userId = await getUserId()
  const cleaned = Array.from(new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean)))
  const existingLinks = await db.questionTags.where('questionId').equals(questionId).toArray()
  const allTags = await db.tags.toArray()
  const byName = new Map(allTags.map((tag) => [tag.name.toLowerCase(), tag]))
  const keepTagIds = new Set<string>()

  for (const name of cleaned) {
    let tag = byName.get(name)
    if (!tag) {
      const ts = nowISO()
      tag = { id: uid(), userId, name, createdAt: ts, updatedAt: ts }
      await putRow('tags', tag)
      byName.set(name, tag)
    }
    keepTagIds.add(tag.id)
    if (!existingLinks.some((link) => link.tagId === tag!.id)) {
      const ts = nowISO()
      await putRow('questionTags', {
        id: uid(),
        userId,
        questionId,
        tagId: tag.id,
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }

  for (const link of existingLinks) {
    if (!keepTagIds.has(link.tagId)) await removeRow('questionTags', link.id)
  }
}

/* ----------------------------------------------------------------- attachments */

export async function addImageAttachment(input: {
  questionId?: string | null
  noteId?: string | null
  kind: AttachmentKind
  file: File
}) {
  const userId = await getUserId()
  const processed = await processImage(input.file)
  const ts = nowISO()
  const siblings = await db.attachments
    .where('questionId')
    .equals(input.questionId ?? '__none__')
    .filter((row) => row.kind === input.kind)
    .count()
  const row: Attachment = {
    id: uid(),
    userId,
    questionId: input.questionId ?? null,
    noteId: input.noteId ?? null,
    kind: input.kind,
    storagePath: null,
    displayOrder: siblings,
    width: processed.width,
    height: processed.height,
    blob: processed.blob,
    thumbBlob: processed.thumb,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.attachments.add(row)
  await enqueue('attachments', row.id, 'upsert')
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vault:images', { detail: row.id }))
  return row.id
}

export async function deleteAttachment(id: string) {
  const attachment = await db.attachments.get(id)
  await removeRow('attachments', id)
  if (attachment?.questionId) {
    const question = await db.questions.get(attachment.questionId)
    if (question && question.questionImagePath === attachment.storagePath) {
      await updateQuestion(question.id, { questionImagePath: null })
    }
  }
}

export async function reorderAttachments(ids: string[]) {
  for (let index = 0; index < ids.length; index += 1) {
    const attachment = await db.attachments.get(ids[index])
    if (attachment && attachment.displayOrder !== index) {
      await db.attachments.update(ids[index], { displayOrder: index })
      await enqueue('attachments', ids[index], 'upsert')
    }
  }
}

/* --------------------------------------------------------------- chapter notes */

export async function saveChapterNote(chapterId: string, content: string) {
  const userId = await getUserId()
  const existing = await db.chapterNotes.where('chapterId').equals(chapterId).first()
  const ts = nowISO()
  if (existing) {
    if (existing.content === content) return existing.id
    await putRow('chapterNotes', { ...existing, content, updatedAt: ts })
    return existing.id
  }
  const row = {
    id: uid(),
    userId,
    chapterId,
    content,
    createdAt: ts,
    updatedAt: ts,
  }
  await putRow('chapterNotes', row)
  return row.id
}

/* -------------------------------------------------------------------- formulas */

export async function saveFormula(input: {
  id?: string
  subjectId: string
  chapterId?: string | null
  title: string
  expression: string
  note?: string | null
}) {
  const userId = await getUserId()
  const ts = nowISO()
  const existing = input.id ? await db.formulas.get(input.id) : undefined
  const row: Formula = existing
    ? {
        ...existing,
        title: input.title.trim(),
        expression: input.expression.trim(),
        note: input.note?.trim() || null,
        chapterId: input.chapterId ?? existing.chapterId,
        updatedAt: ts,
      }
    : {
        id: uid(),
        userId,
        subjectId: input.subjectId,
        chapterId: input.chapterId ?? null,
        title: input.title.trim(),
        expression: input.expression.trim(),
        note: input.note?.trim() || null,
        createdAt: ts,
        updatedAt: ts,
      }
  await putRow('formulas', row)
  return row.id
}

export async function deleteFormula(id: string) {
  await removeRow('formulas', id)
}

/* -------------------------------------------------------------------- revision */

export async function recordRevision(input: {
  questionId: string
  chapterId: string | null
  status: RevisionStatus
  feedback?: string | null
}) {
  const userId = await getUserId()
  const row = {
    id: uid(),
    userId,
    questionId: input.questionId,
    chapterId: input.chapterId,
    revisedAt: nowISO(),
    status: input.status,
    feedback: input.feedback?.trim() || null,
  }
  await db.revisionHistory.add(row)
  await enqueue('revisionHistory', row.id, 'upsert')
  return row.id
}

export async function clearRevisionHistory(questionId: string) {
  const rows = await db.revisionHistory.where('questionId').equals(questionId).toArray()
  for (const row of rows) await removeRow('revisionHistory', row.id)
}

/* ------------------------------------------------------------------- maintenance */

export async function wipeAllData() {
  await db.transaction(
    'rw',
    [
      db.subjects,
      db.chapters,
      db.topics,
      db.questions,
      db.questionChapters,
      db.attachments,
      db.chapterNotes,
      db.formulas,
      db.revisionHistory,
      db.tags,
      db.questionTags,
      db.profiles,
      db.outbox,
      db.conflicts,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.subjects.clear(),
        db.chapters.clear(),
        db.topics.clear(),
        db.questions.clear(),
        db.questionChapters.clear(),
        db.attachments.clear(),
        db.chapterNotes.clear(),
        db.formulas.clear(),
        db.revisionHistory.clear(),
        db.tags.clear(),
        db.questionTags.clear(),
        db.profiles.clear(),
        db.outbox.clear(),
        db.conflicts.clear(),
        db.meta.clear(),
      ])
    },
  )
}

export async function storageUsage() {
  let bytes = 0
  let images = 0
  await db.attachments.each((attachment) => {
    images += 1
    bytes += attachment.blob?.size ?? 0
  })
  return { bytes, images }
}
