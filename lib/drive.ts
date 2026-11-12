import { db, getMeta, setMeta } from './db'
import { processBlob } from './images'
import { enqueue } from './store'
import type { Attachment } from './types'
import { nowISO } from './utils'

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
export const driveConfigured = Boolean(CLIENT_ID)

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'SSC Revision Vault'
const REFRESH_TOKEN_STORAGE_KEY = 'vault:drive-refresh-token'
const TOKEN_STORAGE_KEY = 'vault:drive-token'
const FOLDER_META_KEY = 'driveFolderId'
const LINKED_META_KEY = 'driveLinked'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

type TokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            access_type?: 'online' | 'offline'
            prompt?: string
            include_granted_scopes?: boolean
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type?: string; message?: string }) => void
          }) => { requestAccessToken: (options?: { prompt?: string }) => void }
          revoke: (token: string, callback?: () => void) => void
        }
      }
    }
  }
}

export class DriveError extends Error {
  code: 'not_configured' | 'not_connected' | 'cancelled' | 'failed'

  constructor(message: string, code: DriveError['code'] = 'failed') {
    super(message)
    this.name = 'DriveError'
    this.code = code
  }
}

interface StoredToken {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

interface RefreshTokenRecord {
  userId: string
  refreshToken: string
  expiresAt: number
}

function readToken(): StoredToken | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed.accessToken || (parsed.expiresAt ?? 0) - 60_000 <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function writeToken(accessToken: string, expiresIn: number, refreshToken?: string) {
  const token: StoredToken = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  }
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
  } catch {
    /* private mode: token stays in memory for this page only */
  }
  memoryToken = token
}

function readRefreshToken(): RefreshTokenRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RefreshTokenRecord
    if (!parsed.refreshToken || parsed.expiresAt - 60_000 <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function writeRefreshToken(refreshToken: string, expiresAt: number) {
  try {
    window.sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, JSON.stringify({ refreshToken, expiresAt }))
  } catch {
    /* private mode */
  }
}

let memoryToken: StoredToken | null = null

function currentToken(): StoredToken | null {
  const stored = readToken()
  if (stored) return stored
  if (memoryToken && (memoryToken.expiresAt ?? 0) - 60_000 > Date.now()) return memoryToken
  return null
}

function getRefreshToken(): string | null {
  const stored = readRefreshToken()
  if (stored) return stored.refreshToken
  return null
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisPromise) {
    gisPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-gis]')
      const script = existing ?? document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleGis = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new DriveError('Could not load Google sign-in. Check your connection.'))
      if (!existing) document.head.appendChild(script)
      else if (window.google?.accounts?.oauth2) resolve()
    })
  }
  return gisPromise
}

async function requestAccessToken(prompt: string): Promise<StoredToken> {
  if (!driveConfigured) {
    throw new DriveError(
      'Google Drive is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to the environment.',
      'not_configured',
    )
  }
  await loadGis()
  const google = window.google
  if (!google?.accounts?.oauth2) throw new DriveError('Google sign-in is unavailable in this browser.')

  return new Promise<StoredToken>((resolve, reject) => {
    let settled = false
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      access_type: 'offline',
      prompt,
      include_granted_scopes: true,
      callback: (response) => {
        if (settled) return
        settled = true
        if (response.error || !response.access_token) {
          const message = response.error_description || response.error || 'Google Drive access was not granted.'
          reject(
            new DriveError(
              response.error === 'access_denied' ? 'Google Drive access was cancelled.' : message,
              response.error === 'access_denied' ? 'cancelled' : 'failed',
            ),
          )
          return
        }
        if (response.refresh_token) {
        writeToken(response.access_token, response.expires_in ?? 3600, response.refresh_token)
        writeRefreshToken(response.refresh_token, Date.now() + (response.expires_in ?? 3600) * 1000)
      } else {
        writeToken(response.access_token, response.expires_in ?? 3600)
      }
      resolve({ accessToken: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 })
      },
    })
    try {
      client.requestAccessToken({ prompt })
    } catch (error) {
      settled = true
      reject(error instanceof Error ? error : new DriveError('Google Drive authorisation failed.'))
    }
    setTimeout(() => {
      if (settled) return
      settled = true
      reject(
        new DriveError('The Google authorisation window did not finish. Allow pop-ups for this site and try again.'),
      )
    }, 90_000)
  })
}

/** Connect Google Drive — obtains offline access with refresh token that persists across tab reloads. */
export async function connectDrive() {
  const token = await requestAccessToken('consent')
  await setMeta(LINKED_META_KEY, '1')
  await ensureFolderId(token.accessToken, true)
}

export function hasDriveToken() {
  return Boolean(currentToken())
}

async function accessTokenOrThrow() {
  const stored = currentToken()
  if (stored && stored.accessToken) {
    // Try to silently refresh the access token if we have a refresh token
    if (stored.refreshToken) {
      try {
        const { access_token, expires_in } = await refreshAccessToken(stored.refreshToken)
        writeToken(access_token, expires_in, stored.refreshToken)
        writeRefreshToken(stored.refreshToken, Date.now() + expires_in * 1000)
        return access_token
      } catch {
        // If refresh fails, fall through to full re-auth below
      }
    }
    if (stored.accessToken) return stored.accessToken
  }
  // No valid token — start full OAuth flow
  const token = await requestAccessToken('consent')
  await setMeta(LINKED_META_KEY, '1')
  await ensureFolderId(token.accessToken, true)
  return token.accessToken
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const google = window.google
  if (!google?.accounts?.oauth2) throw new DriveError('Google sign-in is unavailable.')

  return new Promise<{ access_token: string; expires_in: number }>((resolve, reject) => {
    let settled = false
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      prompt: 'none',
      include_granted_scopes: true,
      callback: (response) => {
        if (settled) return
        settled = true
        if (response.error || !response.access_token) {
          reject(new DriveError('Failed to refresh access token.'))
          return
        }
        resolve({
          access_token: response.access_token,
          expires_in: response.expires_in ?? 3600,
        })
      },
    })
    try {
      client.requestAccessToken({ prompt: 'none', refresh_token: refreshToken } as any)
    } catch (error) {
      settled = true
      reject(error instanceof Error ? error : new DriveError('Token refresh failed.'))
    }
    setTimeout(() => {
      if (settled) return
      settled = true
      reject(new DriveError('Token refresh request timed out.'))
    }, 30_000)
  })
}

async function driveFetch(url: string, init: RequestInit = {}, retry = true) {
  const token = await accessTokenOrThrow()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(url, { ...init, headers })
  if (response.status === 401 && retry) {
    try {
      const fresh = await accessTokenOrThrow() as string
      const retryHeaders = new Headers(init.headers)
      retryHeaders.set('Authorization', `Bearer ${fresh}`)
      return fetch(url, { ...init, headers: retryHeaders })
    } catch {
      throw new DriveError('Google Drive session expired. Reconnect it in Settings.', 'not_connected')
    }
  }
  return response
}

async function ensureFolderId(token: string, force = false): Promise<string> {
  if (!force) {
    const cached = await getMeta(FOLDER_META_KEY)
    if (cached) return cached
  }
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const search = await fetch(
    `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (search.ok) {
    const data = (await search.json()) as { files?: { id: string }[] }
    const existing = data.files?.[0]?.id
    if (existing) {
      await setMeta(FOLDER_META_KEY, existing)
      return existing
    }
  }
  const create = await fetch(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { app: 'ssc-revision-vault' },
    }),
  })
  if (!create.ok) {
    const detail = await create.text().catch(() => '')
    throw new DriveError(`Could not create the Drive folder. ${detail.slice(0, 160)}`)
  }
  const created = (await create.json()) as { id: string }
  await setMeta(FOLDER_META_KEY, created.id)
  return created.id
}

async function uploadBlob(blob: Blob, name: string, folderId: string, token: string) {
  const boundary = `vault-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const metadata = {
    name,
    mimeType: blob.type || 'image/jpeg',
    parents: [folderId],
    appProperties: { app: 'ssc-revision-vault' },
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ])
  return fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
}

/** Upload one attachment's cached photo to Drive and record the file id locally. */
export async function uploadAttachmentToDrive(attachment: Attachment): Promise<string> {
  if (!attachment.blob) throw new DriveError('This photo is not cached on this device.', 'failed')
  const token = await accessTokenOrThrow()
  const folderId = await ensureFolderId(token)
  const name = `${attachment.kind}-${attachment.id.slice(0, 8)}-${nowISO().slice(0, 10)}.jpg`

  let response = await uploadBlob(attachment.blob, name, folderId, token)
  if (response.status === 404) {
    // Folder was deleted in Drive — recreate and retry once.
    const fresh = await ensureFolderId(token, true)
    response = await uploadBlob(attachment.blob, name, fresh, token)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new DriveError(`Drive upload failed (${response.status}). ${detail.slice(0, 160)}`)
  }
  const data = (await response.json()) as { id: string }
  await db.attachments.update(attachment.id, {
    remoteProvider: 'drive',
    remoteFileId: data.id,
    storagePath: null,
    updatedAt: nowISO(),
  })
  return data.id
}

let pendingRun: Promise<{ uploaded: number; failed: number; reason?: string }> | null = null

/** Push every locally cached photo that has no remote copy yet. Safe to call often. */
export async function uploadPendingImages() {
  if (!driveConfigured) return { uploaded: 0, failed: 0, reason: 'not_configured' as const }
  if ((await getMeta(LINKED_META_KEY)) !== '1' || !hasDriveToken()) {
    return { uploaded: 0, failed: 0, reason: 'not_connected' as const }
  }
  if (pendingRun) return pendingRun

  pendingRun = (async () => {
    let uploaded = 0
    let failed = 0
    const rows = await db.attachments.toArray()
    const pending = rows.filter((row) => row.blob && !row.remoteFileId)
    for (const row of pending) {
      try {
        await uploadAttachmentToDrive(row)
        await enqueue('attachments', row.id, 'upsert')
        uploaded += 1
      } catch (error) {
        failed += 1
        if (error instanceof DriveError && error.code === 'not_connected') break
      }
    }
    return { uploaded, failed }
  })()

  try {
    return await pendingRun
  } finally {
    pendingRun = null
  }
}

/** Download a Drive photo and cache it locally so it also works offline afterwards. */
export async function fetchDriveImage(attachment: Attachment): Promise<Blob | null> {
  if (!attachment.remoteFileId) return null
  const response = await driveFetch(`${API}/files/${attachment.remoteFileId}?alt=media`)
  if (!response.ok) {
    if (response.status === 404) return null
    throw new DriveError(`Drive download failed (${response.status}).`)
  }
  const blob = await response.blob()
  try {
    const processed = await processBlob(blob)
    await db.attachments.update(attachment.id, {
      blob: processed.blob,
      thumbBlob: processed.thumb,
      width: attachment.width ?? processed.width,
      height: attachment.height ?? processed.height,
    })
    return processed.blob
  } catch {
    return blob
  }
}

export async function getDriveStatus() {
  const linked = (await getMeta(LINKED_META_KEY)) === '1'
  const folderId = await getMeta(FOLDER_META_KEY)
  const rows = await db.attachments.toArray()
  const pending = rows.filter((row) => row.blob && !row.remoteFileId).length
  const stored = rows.filter((row) => row.remoteProvider === 'drive').length
  return {
    configured: driveConfigured,
    linked,
    authorised: hasDriveToken(),
    folderId,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
    pending,
    stored,
  }
}

export async function disconnectDrive() {
  const token = currentToken()
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token.accessToken)
    } catch {
      /* best effort */
    }
  }
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  memoryToken = null
  await setMeta(LINKED_META_KEY, '0')
}
