'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, getMeta } from './db'
import { fetchDriveImage } from './drive'
import { getSignedUrl } from './supabase'
import { getSyncState, subscribeSync } from './sync'
import { getThemeSnapshot, subscribeTheme } from './theme'
import type { Attachment, Chapter, Formula, Question, RevisionEntry, Subject, Topic } from './types'
import { startOfTodayISO } from './utils'

export interface ChapterNode {
  chapter: Chapter
  children: Chapter[]
  count: number
}

export interface SubjectGroup {
  subject: Subject
  chapters: ChapterNode[]
  count: number
  revised: number
}

function childrenOf(chapters: Chapter[], parentId: string | null, subjectId?: string) {
  return chapters
    .filter((chapter) => (chapter.parentId ?? null) === parentId && (!subjectId || chapter.subjectId === subjectId))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

export function chapterAndDescendantIds(chapters: Chapter[], rootId: string) {
  const ids = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const chapter of chapters) {
      if (chapter.parentId && ids.has(chapter.parentId) && !ids.has(chapter.id)) {
        ids.add(chapter.id)
        added = true
      }
    }
  }
  return Array.from(ids)
}

export function useSubjectTree(): SubjectGroup[] | undefined {
  return useLiveQuery(async () => {
    const [subjects, chapters, questions, revisions] = await Promise.all([
      db.subjects.toArray(),
      db.chapters.toArray(),
      db.questions.toArray(),
      db.revisionHistory.toArray(),
    ])
    const revised = new Set(revisions.map((entry) => entry.questionId))
    return subjects
      .sort((a, b) => a.position - b.position)
      .map((subject) => {
        const subjectChapters = chapters.filter((chapter) => chapter.subjectId === subject.id)
        const roots = childrenOf(subjectChapters, null, subject.id)
        const nodes: ChapterNode[] = roots.map((chapter) => {
          const kids = childrenOf(subjectChapters, chapter.id)
          const ids = new Set([chapter.id, ...kids.map((kid) => kid.id)])
          const count = questions.filter((question) => question.primaryChapterId && ids.has(question.primaryChapterId)).length
          return { chapter, children: kids, count }
        })
        const subjectQuestions = questions.filter((question) => question.subjectId === subject.id)
        return {
          subject,
          chapters: nodes,
          count: subjectQuestions.length,
          revised: subjectQuestions.filter((question) => revised.has(question.id)).length,
        }
      })
  }, [])
}

export function useChapters(): Chapter[] | undefined {
  return useLiveQuery(() => db.chapters.toArray(), [])
}

export function useSubjects(): Subject[] | undefined {
  return useLiveQuery(() => db.subjects.toArray().then((rows) => rows.sort((a, b) => a.position - b.position)), [])
}

export function useChapterBundle(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return null
    const chapter = await db.chapters.get(chapterId)
    if (!chapter) return null
    const subject = await db.subjects.get(chapter.subjectId)
    const all = await db.chapters.where('subjectId').equals(chapter.subjectId).toArray()
    const parent = chapter.parentId ? all.find((row) => row.id === chapter.parentId) ?? null : null
    const children = all.filter((row) => row.parentId === chapter.id).sort((a, b) => a.position - b.position)
    return { chapter, subject: subject ?? null, parent, children, siblings: all, breadcrumb: parent ? [parent] : [] }
  }, [chapterId])
}

export interface ChapterStats {
  total: number
  unattempted: number
  difficult: number
  bookmarked: number
  withSolutions: number
  revised: number
  incorrect: number
  lastRevisedAt: string | null
}

export async function computeChapterStats(chapterIds: string[]): Promise<ChapterStats> {
  const idSet = new Set(chapterIds)
  const questions = await db.questions.toArray()
  const scoped = questions.filter(
    (question) => question.primaryChapterId && idSet.has(question.primaryChapterId),
  )
  const ids = scoped.map((question) => question.id)
  const [attachments, revisions] = await Promise.all([
    ids.length ? db.attachments.where('questionId').anyOf(ids).toArray() : Promise.resolve([] as Attachment[]),
    ids.length ? db.revisionHistory.where('questionId').anyOf(ids).toArray() : Promise.resolve([] as RevisionEntry[]),
  ])
  const withSolution = new Set(attachments.filter((row) => row.kind === 'solution').map((row) => row.questionId))
  const revised = new Set(revisions.map((row) => row.questionId))
  const incorrect = new Set(revisions.filter((row) => row.status === 'incorrect').map((row) => row.questionId))
  const chapterRevisions = revisions.filter((row) => !row.chapterId || idSet.has(row.chapterId))
  const lastRevisedAt = chapterRevisions.map((row) => row.revisedAt).sort().at(-1) ?? null

  return {
    total: scoped.length,
    unattempted: scoped.filter((question) => !revised.has(question.id)).length,
    difficult: scoped.filter((question) => question.isDifficult).length,
    bookmarked: scoped.filter((question) => question.isBookmarked).length,
    withSolutions: scoped.filter(
      (question) => withSolution.has(question.id) || Boolean(question.solutionText?.trim()),
    ).length,
    revised: scoped.filter((question) => revised.has(question.id)).length,
    incorrect: incorrect.size,
    lastRevisedAt,
  }
}

export function useChapterStats(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return null
    const chapter = await db.chapters.get(chapterId)
    if (!chapter) return null
    const siblings = await db.chapters.where('subjectId').equals(chapter.subjectId).toArray()
    const ids = chapterAndDescendantIds(siblings, chapterId)
    return computeChapterStats(ids)
  }, [chapterId])
}

export interface ChapterQuestion {
  question: Question
  revisedAt: string | null
  revisionStatus: string | null
  solutionCount: number
  hasText: boolean
}

export async function loadChapterQuestions(chapterId: string): Promise<ChapterQuestion[]> {
  const chapter = await db.chapters.get(chapterId)
  if (!chapter) return []
  const siblings = await db.chapters.where('subjectId').equals(chapter.subjectId).toArray()
  const ids = new Set(chapterAndDescendantIds(siblings, chapterId))

  const questions = await db.questions.toArray()
  const links = await db.questionChapters.toArray()
  const extraIds = new Set(
    links.filter((link) => ids.has(link.chapterId)).map((link) => link.questionId),
  )
  const scoped = questions.filter(
    (question) => (question.primaryChapterId && ids.has(question.primaryChapterId)) || extraIds.has(question.id),
  )

  const questionIds = scoped.map((question) => question.id)
  const [revisions, attachments] = await Promise.all([
    questionIds.length ? db.revisionHistory.where('questionId').anyOf(questionIds).toArray() : Promise.resolve([]),
    questionIds.length ? db.attachments.where('questionId').anyOf(questionIds).toArray() : Promise.resolve([]),
  ])

  const lastByQuestion = new Map<string, RevisionEntry>()
  for (const revision of revisions) {
    const current = lastByQuestion.get(revision.questionId)
    if (!current || revision.revisedAt > current.revisedAt) lastByQuestion.set(revision.questionId, revision)
  }
  const solutionCounts = new Map<string, number>()
  for (const attachment of attachments) {
    if (attachment.kind !== 'solution' || !attachment.questionId) continue
    solutionCounts.set(attachment.questionId, (solutionCounts.get(attachment.questionId) ?? 0) + 1)
  }

  return scoped
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((question) => {
      const last = lastByQuestion.get(question.id)
      return {
        question,
        revisedAt: last?.revisedAt ?? null,
        revisionStatus: last?.status ?? null,
        solutionCount: solutionCounts.get(question.id) ?? 0,
        hasText: Boolean(question.questionText.trim()),
      }
    })
}

export function useChapterQuestions(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return [] as ChapterQuestion[]
    return loadChapterQuestions(chapterId)
  }, [chapterId])
}

export function useInboxQuestions() {
  return useLiveQuery(async () => {
    const questions = await db.questions.filter((question) => !question.primaryChapterId).toArray()
    const questionIds = questions.map((question) => question.id)
    const attachments = questionIds.length ? await db.attachments.where('questionId').anyOf(questionIds).toArray() : []
    const solutionCounts = new Map<string, number>()
    for (const attachment of attachments) {
      if (attachment.kind !== 'solution' || !attachment.questionId) continue
      solutionCounts.set(attachment.questionId, (solutionCounts.get(attachment.questionId) ?? 0) + 1)
    }
    return questions
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((question) => ({ question, solutionCount: solutionCounts.get(question.id) ?? 0 }))
  }, [])
}

export function useQuestionAttachments(questionId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!questionId) return [] as Attachment[]
    const rows = await db.attachments.where('questionId').equals(questionId).toArray()
    return rows.sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt))
  }, [questionId])
}

export function useQuestionByIid(questionId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!questionId) return null
    return (await db.questions.get(questionId)) ?? null
  }, [questionId])
}

export function useQuestionTags(questionId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!questionId) return [] as string[]
    const links = await db.questionTags.where('questionId').equals(questionId).toArray()
    if (!links.length) return [] as string[]
    const tags = await db.tags.where('id').anyOf(links.map((link) => link.tagId)).toArray()
    return tags.map((tag) => tag.name).sort()
  }, [questionId])
}

export function useChapterNote(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return null
    return (await db.chapterNotes.where('chapterId').equals(chapterId).first()) ?? null
  }, [chapterId])
}

export function useChapterFormulas(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return [] as Formula[]
    const rows = await db.formulas.where('chapterId').equals(chapterId).toArray()
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [chapterId])
}

export function useAllFormulas() {
  return useLiveQuery(async () => {
    const [formulas, subjects, chapters] = await Promise.all([
      db.formulas.toArray(),
      db.subjects.toArray(),
      db.chapters.toArray(),
    ])
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))
    return formulas
      .map((formula) => ({
        formula,
        subject: subjectById.get(formula.subjectId) ?? null,
        chapter: formula.chapterId ? chapterById.get(formula.chapterId) ?? null : null,
      }))
      .sort((a, b) => b.formula.createdAt.localeCompare(a.formula.createdAt))
  }, [])
}

export interface DashboardData {
  totalQuestions: number
  totalChapters: number
  pending: number
  difficult: number
  bookmarked: number
  todayRevised: number
  revisedQuestions: number
  recentQuestions: Question[]
  recentChapters: { chapter: Chapter; subject: Subject | null; revisedAt: string }[]
  subjectProgress: { subject: Subject; total: number; revised: number }[]
  continueTarget: { chapter: Chapter; subject: Subject | null } | null
  inboxCount: number
}

export function useDashboard() {
  return useLiveQuery<DashboardData | null>(async () => {
    const [questions, revisions, chapters, subjects, attachments] = await Promise.all([
      db.questions.toArray(),
      db.revisionHistory.toArray(),
      db.chapters.toArray(),
      db.subjects.toArray(),
      db.attachments.toArray(),
    ])
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
    const revisedQuestionIds = new Set(revisions.map((row) => row.questionId))
    const todayStart = startOfTodayISO()
    const todayQuestionIds = new Set(
      revisions.filter((row) => row.revisedAt >= todayStart).map((row) => row.questionId),
    )

    const latestByChapter = new Map<string, string>()
    for (const revision of revisions) {
      if (!revision.chapterId) continue
      const current = latestByChapter.get(revision.chapterId)
      if (!current || revision.revisedAt > current) latestByChapter.set(revision.chapterId, revision.revisedAt)
    }

    const recentChapters = Array.from(latestByChapter.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 5)
      .map(([chapterId, revisedAt]) => {
        const chapter = chapters.find((row) => row.id === chapterId)
        return chapter
          ? { chapter, subject: subjectById.get(chapter.subjectId) ?? null, revisedAt }
          : null
      })
      .filter(Boolean) as DashboardData['recentChapters']

    const lastChapterId = await getMeta('lastChapterId')
    const lastChapter = lastChapterId ? chapters.find((row) => row.id === lastChapterId) ?? null : null

    const solutionCount = new Set(attachments.filter((row) => row.kind === 'solution').map((row) => row.questionId))
    void solutionCount

    return {
      totalQuestions: questions.length,
      totalChapters: chapters.length,
      pending: questions.filter((question) => !revisedQuestionIds.has(question.id)).length,
      difficult: questions.filter((question) => question.isDifficult).length,
      bookmarked: questions.filter((question) => question.isBookmarked).length,
      todayRevised: todayQuestionIds.size,
      revisedQuestions: revisedQuestionIds.size,
      recentQuestions: [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      recentChapters,
      subjectProgress: subjects
        .sort((a, b) => a.position - b.position)
        .map((subject) => {
          const scoped = questions.filter((question) => question.subjectId === subject.id)
          return {
            subject,
            total: scoped.length,
            revised: scoped.filter((question) => revisedQuestionIds.has(question.id)).length,
          }
        }),
      continueTarget: lastChapter
        ? { chapter: lastChapter, subject: subjectById.get(lastChapter.subjectId) ?? null }
        : null,
      inboxCount: questions.filter((question) => !question.primaryChapterId).length,
    }
  }, [])
}

export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState)
}

export function useThemeChoice() {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'system' as const)
}

export function useAttachmentUrl(attachment: Attachment | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const blob = attachment?.blob ?? null
  const storagePath = attachment?.storagePath ?? null
  const driveFileId = attachment?.remoteProvider === 'drive' ? attachment.remoteFileId ?? null : null

  useEffect(() => {
    if (!attachment) {
      setUrl(null)
      return
    }
    if (blob) {
      const localUrl = URL.createObjectURL(blob)
      setUrl(localUrl)
      return () => URL.revokeObjectURL(localUrl)
    }
    if (driveFileId) {
      let cancelled = false
      let created: string | null = null
      setUrl(null)
      void fetchDriveImage({ ...attachment, remoteFileId: driveFileId })
        .then((downloaded) => {
          if (cancelled || !downloaded) return
          created = URL.createObjectURL(downloaded)
          setUrl(created)
        })
        .catch(() => {
          if (!cancelled) setUrl(null)
        })
      return () => {
        cancelled = true
        if (created) URL.revokeObjectURL(created)
      }
    }
    if (storagePath) {
      let cancelled = false
      void getSignedUrl(storagePath).then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      return () => {
        cancelled = true
      }
    }
    setUrl(null)
  }, [attachment, blob, storagePath, driveFileId])

  return url
}

export function useAttachmentThumbUrl(attachment: Attachment | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const blob = attachment?.thumbBlob ?? null

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const localUrl = URL.createObjectURL(blob)
    setUrl(localUrl)
    return () => URL.revokeObjectURL(localUrl)
  }, [blob])

  return url
}

export function useTopics(chapterId: string | undefined) {
  return useLiveQuery(async () => {
    if (!chapterId) return [] as Topic[]
    return db.topics.where('chapterId').equals(chapterId).toArray()
  }, [chapterId])
}

export function useAllTags() {
  return useLiveQuery(async () => (await db.tags.toArray()).map((tag) => tag.name).sort(), [])
}

export function useChapterOptions() {
  return useLiveQuery(async () => {
    const [subjects, chapters] = await Promise.all([db.subjects.toArray(), db.chapters.toArray()])
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
    return chapters
      .map((chapter) => ({
        chapter,
        subject: subjectById.get(chapter.subjectId) ?? null,
      }))
      .sort((a, b) => {
        const subjectOrder = (a.subject?.position ?? 0) - (b.subject?.position ?? 0)
        if (subjectOrder !== 0) return subjectOrder
        return a.chapter.position - b.chapter.position
      })
  }, [])
}
