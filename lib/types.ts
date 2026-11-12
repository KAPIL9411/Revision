export type Difficulty = 'easy' | 'medium' | 'hard'
export type SourceType = 'mock' | 'pyq' | 'book' | 'practice' | 'other'
export type RevisionStatus = 'revised' | 'shaky' | 'incorrect'
export type AttachmentKind = 'question_image' | 'solution' | 'note_photo'

export type Entity =
  | 'subjects'
  | 'chapters'
  | 'topics'
  | 'questions'
  | 'questionChapters'
  | 'attachments'
  | 'chapterNotes'
  | 'formulas'
  | 'revisionHistory'
  | 'tags'
  | 'questionTags'

export interface Subject {
  id: string
  userId: string
  name: string
  slug: string
  color: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface Chapter {
  id: string
  userId: string
  subjectId: string
  parentId: string | null
  name: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface Topic {
  id: string
  userId: string
  chapterId: string
  name: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  userId: string
  questionText: string
  questionImagePath: string | null
  subjectId: string
  primaryChapterId: string | null
  topicId: string | null
  sourceType: SourceType
  sourceName: string | null
  difficulty: Difficulty
  personalRemark: string | null
  solutionText: string | null
  isBookmarked: 0 | 1
  isDifficult: 0 | 1
  questionDate: string
  createdAt: string
  updatedAt: string
}

export interface QuestionChapter {
  id: string
  userId: string
  questionId: string
  chapterId: string
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: string
  userId: string
  questionId: string | null
  noteId: string | null
  kind: AttachmentKind
  storagePath: string | null
  displayOrder: number
  width: number | null
  height: number | null
  /** Local binary copy. Never synced as a row field. */
  blob?: Blob | null
  thumbBlob?: Blob | null
  createdAt: string
  updatedAt: string
}

export interface ChapterNote {
  id: string
  userId: string
  chapterId: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface Formula {
  id: string
  userId: string
  subjectId: string
  chapterId: string | null
  title: string
  expression: string
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface RevisionEntry {
  id: string
  userId: string
  questionId: string
  chapterId: string | null
  revisedAt: string
  status: RevisionStatus
  feedback: string | null
}

export interface Tag {
  id: string
  userId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface QuestionTag {
  id: string
  userId: string
  questionId: string
  tagId: string
  createdAt: string
  updatedAt: string
}

export interface OutboxEntry {
  seq?: number
  entity: Entity
  entityId: string
  op: 'upsert' | 'delete'
  createdAt: number
  attempts: number
  lastError?: string
}

export interface ConflictRecord {
  id: string
  entity: Entity
  entityId: string
  localUpdatedAt: string
  remoteUpdatedAt: string
  remote: Record<string, unknown>
  createdAt: string
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
export const SOURCES: SourceType[] = ['mock', 'pyq', 'book', 'practice', 'other']

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}
export const SOURCE_LABEL: Record<SourceType, string> = {
  mock: 'Mock',
  pyq: 'PYQ',
  book: 'Book',
  practice: 'Practice',
  other: 'Other',
}
export const REVISION_LABEL: Record<RevisionStatus, string> = {
  revised: 'Revised',
  shaky: 'Shaky',
  incorrect: 'Incorrect',
}

export type RevisionFilter =
  | 'all'
  | 'new'
  | 'difficult'
  | 'incorrect'
  | 'bookmarked'
  | 'no_solution'

export const REVISION_FILTERS: { value: RevisionFilter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'new', label: 'New' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'bookmarked', label: 'Bookmarked' },
  { value: 'no_solution', label: 'No solution' },
]
