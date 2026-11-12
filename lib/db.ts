import Dexie, { type Table } from 'dexie'
import type {
  Attachment,
  Chapter,
  ChapterNote,
  ConflictRecord,
  Formula,
  OutboxEntry,
  Question,
  QuestionChapter,
  QuestionTag,
  RevisionEntry,
  Subject,
  Tag,
  Topic,
} from './types'

export interface Profile {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface MetaRow {
  key: string
  value: string
}

class VaultDatabase extends Dexie {
  subjects!: Table<Subject, string>
  chapters!: Table<Chapter, string>
  topics!: Table<Topic, string>
  questions!: Table<Question, string>
  questionChapters!: Table<QuestionChapter, string>
  attachments!: Table<Attachment, string>
  chapterNotes!: Table<ChapterNote, string>
  formulas!: Table<Formula, string>
  revisionHistory!: Table<RevisionEntry, string>
  tags!: Table<Tag, string>
  questionTags!: Table<QuestionTag, string>
  profiles!: Table<Profile, string>
  outbox!: Table<OutboxEntry, number>
  conflicts!: Table<ConflictRecord, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('ssc-revision-vault')
    this.version(1).stores({
      subjects: 'id, name, position, updatedAt',
      chapters: 'id, subjectId, parentId, name, position, updatedAt',
      topics: 'id, chapterId, name, position, updatedAt',
      questions:
        'id, subjectId, primaryChapterId, topicId, difficulty, sourceType, isBookmarked, isDifficult, createdAt, updatedAt, questionDate',
      questionChapters: 'id, questionId, chapterId, updatedAt',
      attachments: 'id, questionId, noteId, kind, displayOrder, updatedAt',
      chapterNotes: 'id, chapterId, updatedAt',
      formulas: 'id, subjectId, chapterId, updatedAt',
      revisionHistory: 'id, questionId, chapterId, revisedAt, status',
      tags: 'id, name, updatedAt',
      questionTags: 'id, questionId, tagId, updatedAt',
      profiles: 'id',
      outbox: '++seq, entity, entityId, createdAt',
      conflicts: 'id, entity, createdAt',
      meta: 'key',
    })
  }
}

export const db = new VaultDatabase()
export const LOCAL_USER_ID = 'local-user'

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key)
  return row?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value })
}

export async function getUserId(): Promise<string> {
  return (await getMeta('userId')) ?? LOCAL_USER_ID
}

export async function setUserId(id: string) {
  await setMeta('userId', id)
}

/** Re-tag locally created rows to the signed-in account on first connect. */
export async function claimLocalData(userId: string) {
  const claimed = await getMeta('claimedBy')
  if (claimed === userId) return
  const tables = [
    'subjects',
    'chapters',
    'topics',
    'questions',
    'questionChapters',
    'attachments',
    'chapterNotes',
    'formulas',
    'revisionHistory',
    'tags',
    'questionTags',
  ] as const
  for (const name of tables) {
    const table = db.table(name)
    const rows = (await table.toArray()) as Array<{ id: string; userId: string }>
    const mine = rows.filter((r) => r.userId !== userId)
    if (mine.length) {
      await table.bulkPut(mine.map((r) => ({ ...r, userId })))
      await db.outbox.bulkAdd(
        mine.map((r) => ({
          entity: name,
          entityId: r.id,
          op: 'upsert' as const,
          createdAt: Date.now(),
          attempts: 0,
        })),
      )
    }
  }
  await setMeta('claimedBy', userId)
  await setUserId(userId)
}
