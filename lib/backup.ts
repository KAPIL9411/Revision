import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { db, getUserId, setMeta } from './db'
import { enqueue } from './store'
import type { Entity } from './types'
import { nowISO, todayISO } from './utils'

const TABLES: Entity[] = [
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
]

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer as ArrayBuffer
}

function blobPart(bytes: Uint8Array) {
  return toArrayBuffer(bytes)
}

export async function exportBackup() {
  const data: Record<string, unknown> = { app: 'ssc-revision-vault', version: 1, exportedAt: nowISO() }
  const files: Record<string, Uint8Array> = {}
  let imageCount = 0

  for (const table of TABLES) {
    const rows = (await (db as any)[table].toArray()) as any[]
    data[table] = rows.map(({ blob, thumbBlob, ...rest }) => rest)
    for (const row of rows) {
      if (row.blob) {
        files[`images/${row.id}.jpg`] = new Uint8Array(await row.blob.arrayBuffer())
        imageCount += 1
      }
      if (row.thumbBlob) files[`thumbs/${row.id}.jpg`] = new Uint8Array(await row.thumbBlob.arrayBuffer())
    }
  }

  files['data.json'] = strToU8(JSON.stringify(data))
  const zipped = zipSync(files, { level: 1 })
  return {
    blob: new Blob([toArrayBuffer(zipped)], { type: 'application/zip' }),
    filename: `ssc-revision-vault-${todayISO()}.zip`,
    tables: TABLES.length,
    images: imageCount,
  }
}

export async function importBackup(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('That file is not a readable ZIP archive.')
  }
  const raw = entries['data.json']
  if (!raw) throw new Error('The archive does not contain data.json — export it from this app.')

  const data = JSON.parse(strFromU8(raw)) as Record<string, unknown>
  const userId = await getUserId()
  let imported = 0
  let skipped = 0
  let images = 0

  for (const table of TABLES) {
    const rows = data[table]
    if (!Array.isArray(rows)) continue
    const localRows = (await (db as any)[table].toArray()) as any[]
    const localById = new Map<string, any>(localRows.map((row) => [row.id, row]))

    for (const incoming of rows as any[]) {
      if (!incoming?.id) continue
      const local = localById.get(incoming.id)
      if (
        local?.updatedAt &&
        incoming.updatedAt &&
        new Date(local.updatedAt).getTime() > new Date(incoming.updatedAt).getTime()
      ) {
        skipped += 1
        continue
      }
      const next: any = { ...incoming, userId }
      if (table === 'attachments') {
        const image = entries[`images/${incoming.id}.jpg`]
        const thumb = entries[`thumbs/${incoming.id}.jpg`]
        if (image) {
          next.blob = new Blob([blobPart(image)], { type: 'image/jpeg' })
          images += 1
        }
        if (thumb) next.thumbBlob = new Blob([blobPart(thumb)], { type: 'image/jpeg' })
      }
      await (db as any)[table].put(next)
      await enqueue(table, next.id, 'upsert')
      imported += 1
    }
  }

  await setMeta('seeded', '1')
  return { imported, skipped, images }
}
