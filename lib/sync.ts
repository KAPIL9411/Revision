import { claimLocalData, db, getMeta, getUserId, setMeta } from './db'
import { driveConfigured, uploadAttachmentToDrive } from './drive'
import { BUCKET, getSupabase, supabaseEnabled } from './supabase'
import type { Entity } from './types'
import { nowISO, uid } from './utils'

const REMOTE_TABLE: Record<Entity, string> = {
  subjects: 'subjects',
  chapters: 'chapters',
  topics: 'topics',
  questions: 'questions',
  questionChapters: 'question_chapters',
  attachments: 'question_attachments',
  chapterNotes: 'chapter_notes',
  formulas: 'formulas',
  revisionHistory: 'revision_history',
  tags: 'tags',
  questionTags: 'question_tags',
}

const ENTITIES = Object.keys(REMOTE_TABLE) as Entity[]

/**
 * Cursor column per table. Revision history is append-only and has no updated_at,
 * so its own event time is the sync stamp.
 */
const SYNC_STAMP: Partial<Record<Entity, string>> = { revisionHistory: 'revised_at' }

function stampColumn(entity: Entity) {
  return SYNC_STAMP[entity] ?? 'updated_at'
}

type RemoteRow = Record<string, any>

/* ------------------------------------------------------------------ mapping */

function toRemote(entity: Entity, row: any): RemoteRow {
  const base = { id: row.id, user_id: row.userId }
  switch (entity) {
    case 'subjects':
      return { ...base, name: row.name, slug: row.slug, color: row.color, position: row.position, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'chapters':
      return { ...base, subject_id: row.subjectId, parent_id: row.parentId, name: row.name, position: row.position, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'topics':
      return { ...base, chapter_id: row.chapterId, name: row.name, position: row.position, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'questions':
      return {
        ...base,
        question_text: row.questionText,
        question_image_path: row.questionImagePath,
        subject_id: row.subjectId,
        primary_chapter_id: row.primaryChapterId,
        topic_id: row.topicId,
        source_type: row.sourceType,
        source_name: row.sourceName,
        difficulty: row.difficulty,
        personal_remark: row.personalRemark,
        solution_text: row.solutionText,
        is_bookmarked: Boolean(row.isBookmarked),
        is_difficult: Boolean(row.isDifficult),
        question_date: row.questionDate,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }
    case 'questionChapters':
      return { ...base, question_id: row.questionId, chapter_id: row.chapterId, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'attachments':
      return {
        ...base,
        question_id: row.questionId,
        note_id: row.noteId,
        kind: row.kind,
        storage_path: row.storagePath,
        remote_provider: row.remoteProvider ?? null,
        remote_file_id: row.remoteFileId ?? null,
        display_order: row.displayOrder,
        width: row.width,
        height: row.height,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }
    case 'chapterNotes':
      return { ...base, chapter_id: row.chapterId, content: row.content, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'formulas':
      return { ...base, subject_id: row.subjectId, chapter_id: row.chapterId, title: row.title, expression: row.expression, note: row.note, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'revisionHistory':
      return { ...base, question_id: row.questionId, chapter_id: row.chapterId, revised_at: row.revisedAt, status: row.status, feedback: row.feedback }
    case 'tags':
      return { ...base, name: row.name, created_at: row.createdAt, updated_at: row.updatedAt }
    case 'questionTags':
      return { ...base, question_id: row.questionId, tag_id: row.tagId, created_at: row.createdAt, updated_at: row.updatedAt }
  }
}

function fromRemote(entity: Entity, row: RemoteRow, existing?: any): any {
  const base = { id: row.id, userId: row.user_id }
  switch (entity) {
    case 'subjects':
      return { ...base, name: row.name, slug: row.slug, color: row.color, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'chapters':
      return { ...base, subjectId: row.subject_id, parentId: row.parent_id, name: row.name, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'topics':
      return { ...base, chapterId: row.chapter_id, name: row.name, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'questions':
      return {
        ...base,
        questionText: row.question_text ?? '',
        questionImagePath: row.question_image_path,
        subjectId: row.subject_id,
        primaryChapterId: row.primary_chapter_id,
        topicId: row.topic_id,
        sourceType: row.source_type,
        sourceName: row.source_name,
        difficulty: row.difficulty,
        personalRemark: row.personal_remark,
        solutionText: row.solution_text,
        isBookmarked: row.is_bookmarked ? 1 : 0,
        isDifficult: row.is_difficult ? 1 : 0,
        questionDate: row.question_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    case 'questionChapters':
      return { ...base, questionId: row.question_id, chapterId: row.chapter_id, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'attachments':
      return {
        ...base,
        questionId: row.question_id,
        noteId: row.note_id,
        kind: row.kind,
        storagePath: row.storage_path,
        remoteProvider: row.remote_provider ?? (row.storage_path ? 'supabase' : null),
        remoteFileId: row.remote_file_id ?? null,
        displayOrder: row.display_order,
        width: row.width,
        height: row.height,
        blob: existing?.blob ?? null,
        thumbBlob: existing?.thumbBlob ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    case 'chapterNotes':
      return { ...base, chapterId: row.chapter_id, content: row.content ?? '', createdAt: row.created_at, updatedAt: row.updated_at }
    case 'formulas':
      return { ...base, subjectId: row.subject_id, chapterId: row.chapter_id, title: row.title, expression: row.expression, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'revisionHistory':
      return {
        ...base,
        questionId: row.question_id,
        chapterId: row.chapter_id,
        revisedAt: row.revised_at,
        status: row.status,
        feedback: row.feedback,
        updatedAt: row.updated_at ?? row.revised_at,
        createdAt: row.updated_at ?? row.revised_at,
      }
    case 'tags':
      return { ...base, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
    case 'questionTags':
      return { ...base, questionId: row.question_id, tagId: row.tag_id, createdAt: row.created_at, updatedAt: row.updated_at }
  }
}

/* -------------------------------------------------------------------- state */

export interface SyncState {
  enabled: boolean
  online: boolean
  signedIn: boolean
  pending: number
  syncing: boolean
  lastSyncedAt: string | null
  error: string | null
}

let state: SyncState = {
  enabled: supabaseEnabled,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  signedIn: false,
  pending: 0,
  syncing: false,
  lastSyncedAt: null,
  error: null,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch }
  const changed = (Object.keys(next) as (keyof SyncState)[]).some((key) => next[key] !== state[key])
  state = next
  if (changed) listeners.forEach((listener) => listener())
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncState() {
  return state
}

export async function refreshPending() {
  const pending = await db.outbox.count()
  setState({ pending })
  return pending
}

/* --------------------------------------------------------------------- push */

async function uploadAttachmentBlob(userId: string, attachment: any) {
  if (attachment.storagePath) return attachment.storagePath as string
  if (!attachment.blob) return null
  const supabase = getSupabase()
  if (!supabase) return null
  const folder = attachment.questionId ?? attachment.noteId ?? 'notes'
  const path = `${userId}/${folder}/${attachment.id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, attachment.blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  await db.attachments.update(attachment.id, { storagePath: path })
  return path
}

async function pushOnce(userId: string) {
  const supabase = getSupabase()
  if (!supabase) return 0
  const entries = await db.outbox.orderBy('seq').limit(200).toArray()
  let pushed = 0

  for (const entry of entries) {
    const table = REMOTE_TABLE[entry.entity]
    try {
      if (entry.op === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', entry.entityId)
        if (error) throw new Error(error.message)
      } else {
        const local = await (db as any)[entry.entity].get(entry.entityId)
        if (!local) {
          if (entry.seq != null) await db.outbox.delete(entry.seq)
          continue
        }
        if (entry.entity === 'attachments') {
          // Drive is the primary photo store; Supabase Storage is the fallback.
          if (!local.remoteFileId && local.blob && driveConfigured) {
            try {
              local.remoteFileId = await uploadAttachmentToDrive(local)
              local.remoteProvider = 'drive'
            } catch {
              /* Drive unavailable or signed out — fall through to Storage. */
            }
          }
          if (local.remoteProvider !== 'drive') {
            local.storagePath = await uploadAttachmentBlob(userId, local)
            if (local.storagePath) local.remoteProvider = 'supabase'
          }
          if (local.questionId && local.kind === 'question_image' && local.storagePath) {
            const question = await db.questions.get(local.questionId)
            if (question && question.questionImagePath !== local.storagePath) {
              await db.questions.update(question.id, { questionImagePath: local.storagePath })
              local.questionImagePath = local.storagePath
              // keep the pending payload in step with the uploaded path
            }
          }
        }
        const payload = toRemote(entry.entity, local)
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
        if (error) throw new Error(error.message)
      }
      if (entry.seq != null) await db.outbox.delete(entry.seq)
      pushed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      if (entry.seq != null) {
        await db.outbox.update(entry.seq, { attempts: entry.attempts + 1, lastError: message })
      }
      throw new Error(message)
    }
  }
  return pushed
}

/* --------------------------------------------------------------------- pull */

async function pullEntity(entity: Entity) {
  const supabase = getSupabase()
  if (!supabase) return
  const cursorKey = `pull:${entity}`
  const stamp = stampColumn(entity)
  const cursor = (await getMeta(cursorKey)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from(REMOTE_TABLE[entity])
    .select('*')
    .gt(stamp, cursor)
    .order(stamp, { ascending: true })
    .limit(1000)
  if (error) throw new Error(`${entity}: ${error.message}`)
  if (!data?.length) return

  const pending = await db.outbox.toArray()
  const pendingKeys = new Set(pending.map((entry) => `${entry.entity}:${entry.entityId}`))
  const table = (db as any)[entity]
  let newest = cursor

  for (const remote of data as RemoteRow[]) {
    const existing = await table.get(remote.id)
    const localUpdatedAt: string | undefined = existing?.updatedAt
    const remoteUpdatedAt: string = remote[stamp] ?? remote.updated_at

    if (existing && pendingKeys.has(`${entity}:${remote.id}`)) {
      if (new Date(remoteUpdatedAt).getTime() > new Date(localUpdatedAt ?? 0).getTime()) {
        // Both sides changed. Keep the local copy and ask the user, never overwrite silently.
        await db.conflicts.put({
          id: uid(),
          entity,
          entityId: remote.id,
          localUpdatedAt: localUpdatedAt ?? '',
          remoteUpdatedAt,
          remote,
          createdAt: nowISO(),
        })
        continue
      }
    }

    await table.put(fromRemote(entity, remote, existing))
    if (remoteUpdatedAt > newest) newest = remoteUpdatedAt
  }

  await setMeta(cursorKey, newest)
}

/* ----------------------------------------------------------------- sync now */

let inFlight: Promise<void> | null = null

export async function syncNow() {
  if (!supabaseEnabled) {
    setState({ enabled: false })
    return
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    const session = data.session
    await refreshPending()
    if (!session) {
      setState({ signedIn: false, syncing: false })
      return
    }
    setState({ syncing: true, signedIn: true, error: null })
    try {
      await claimLocalData(session.user.id)
      for (let round = 0; round < 5; round += 1) {
        const pushed = await pushOnce(session.user.id)
        if (pushed === 0) break
      }
      for (const entity of ENTITIES) await pullEntity(entity)
      await setMeta('lastSyncedAt', nowISO())
      await refreshPending()
      setState({ syncing: false, lastSyncedAt: nowISO(), error: null })
    } catch (error) {
      setState({ syncing: false, error: error instanceof Error ? error.message : 'Sync failed' })
      await refreshPending()
    }
  })()

  try {
    await inFlight
  } finally {
    inFlight = null
  }
}

export async function resolveConflict(id: string, choice: 'mine' | 'theirs') {
  const conflict = await db.conflicts.get(id)
  if (!conflict) return
  if (choice === 'theirs') {
    const pending = await db.outbox.toArray()
    const same = pending.filter((entry) => entry.entity === conflict.entity && entry.entityId === conflict.entityId)
    if (same.length) await db.outbox.bulkDelete(same.map((entry) => entry.seq as number))
    const existing = await (db as any)[conflict.entity].get(conflict.entityId)
    await (db as any)[conflict.entity].put(fromRemote(conflict.entity, conflict.remote, existing))
    const cursorKey = `pull:${conflict.entity}`
    const cursor = await getMeta(cursorKey)
    if (!cursor || conflict.remoteUpdatedAt > cursor) await setMeta(cursorKey, conflict.remoteUpdatedAt)
  } else {
    const { enqueue } = await import('./store')
    await enqueue(conflict.entity, conflict.entityId, 'upsert')
  }
  await db.conflicts.delete(id)
}

export async function discardLocalKeptConflict(id: string) {
  await db.conflicts.delete(id)
}

export function startSync() {
  if (typeof window === 'undefined') return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const schedule = (delay = 900) => {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      void syncNow()
    }, delay)
  }

  const onWrite = () => schedule()
  const onOnline = () => {
    setState({ online: true })
    schedule(300)
  }
  const onOffline = () => setState({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(400)
  }

  window.addEventListener('vault:sync', onWrite)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)

  const supabase = getSupabase()
  const authSub = supabase?.auth.onAuthStateChange(() => schedule(300))

  void refreshPending()
  void syncNow()

  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(interval)
    window.removeEventListener('vault:sync', onWrite)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    authSub?.data.subscription.unsubscribe()
  }
}

export async function currentUserId() {
  return getUserId()
}
