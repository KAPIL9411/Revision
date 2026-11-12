'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  Cloud,
  Download,
  FolderOpen,
  HardDrive,
  LogOut,
  RefreshCw,
  Target,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, toast } from '@/components/ui'
import { ThemeSegmented } from '@/components/ThemeToggle'
import { db, getMeta, setMeta } from '@/lib/db'
import { exportBackup, importBackup } from '@/lib/backup'
import { connectDrive, disconnectDrive, driveConfigured, getDriveStatus, uploadPendingImages } from '@/lib/drive'
import { getSupabase, signOut, supabaseEnabled, allowedEmail } from '@/lib/supabase'
import { resolveConflict, syncNow } from '@/lib/sync'
import { wipeAllData } from '@/lib/store'
import { formatBytes } from '@/lib/images'
import { useSyncState } from '@/lib/hooks'
import { relativeTime } from '@/lib/utils'

const ENTITY_LABEL: Record<string, string> = {
  questions: 'Question',
  chapters: 'Chapter',
  subjects: 'Subject',
  topics: 'Topic',
  attachments: 'Photo',
  chapterNotes: 'Chapter note',
  formulas: 'Formula',
  revisionHistory: 'Revision',
  questionTags: 'Tag link',
  questionChapters: 'Chapter link',
  tags: 'Tag',
}

function Section({
  title,
  description,
  children,
  id,
}: {
  title: string
  description?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className="card px-4 py-4 sm:px-5">
      <div className="mb-3">
        <h2 className="h2">{title}</h2>
        {description ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const sync = useSyncState()
  const router = useRouter()
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), [])
  const [email, setEmail] = useState<string | null>(null)
  const [goal, setGoal] = useState(15)
  const [goalSaved, setGoalSaved] = useState(false)
  const [usage, setUsage] = useState({ bytes: 0, images: 0 })
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [driveBusy, setDriveBusy] = useState(false)
  const [drive, setDrive] = useState<Awaited<ReturnType<typeof getDriveStatus>> | null>(null)
  const attachments = useLiveQuery(() => db.attachments.toArray(), [])
  const pendingImages = (attachments ?? []).filter((row) => row.blob && !row.remoteFileId).length
  const driveImages = (attachments ?? []).filter((row) => row.remoteProvider === 'drive').length
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
  }, [])

  useEffect(() => {
    void (async () => {
      const stored = await getMeta('dailyGoal')
      if (stored) setGoal(Number(stored))
      let bytes = 0
      let images = 0
      await db.attachments.each((attachment) => {
        images += 1
        bytes += attachment.blob?.size ?? 0
      })
      setUsage({ bytes, images })
    })()
  }, [importSummary])

  useEffect(() => {
    void getDriveStatus().then(setDrive)
  }, [attachments?.length])

  const refreshDrive = async () => setDrive(await getDriveStatus())

  const connectDriveNow = async () => {
    setDriveBusy(true)
    try {
      await connectDrive()
      const result = await uploadPendingImages()
      await refreshDrive()
      toast(
        result.uploaded
          ? `Drive connected · ${result.uploaded} photo${result.uploaded === 1 ? '' : 's'} uploaded`
          : 'Google Drive connected',
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not connect Google Drive', 'error')
    } finally {
      setDriveBusy(false)
    }
  }

  const pushImages = async () => {
    setDriveBusy(true)
    try {
      const result = await uploadPendingImages()
      await refreshDrive()
      toast(
        result.failed
          ? `${result.uploaded} uploaded, ${result.failed} still pending`
          : `${result.uploaded} photo${result.uploaded === 1 ? '' : 's'} uploaded to Drive`,
        result.failed ? 'error' : 'default',
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Upload failed', 'error')
    } finally {
      setDriveBusy(false)
    }
  }

  const saveGoal = async () => {
    const value = Math.max(1, Math.min(200, Math.round(goal)))
    setGoal(value)
    await setMeta('dailyGoal', String(value))
    setGoalSaved(true)
    toast('Daily goal updated')
    setTimeout(() => setGoalSaved(false), 2000)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const result = await exportBackup()
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15_000)
      toast(`Backup exported · ${result.images} photo${result.images === 1 ? '' : 's'}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      const result = await importBackup(file)
      setImportSummary(
        `Restored ${result.imported} records and ${result.images} photos. ${result.skipped} newer local records were kept.`,
      )
      toast('Backup restored')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="h1">Settings</h1>
        <p className="mt-1 text-[12.5px] text-muted">Account, synchronisation and your data.</p>
      </header>

      <Section
        title="Account"
        description={
          supabaseEnabled
            ? 'Google sign-in through Supabase. Only the authorised account can open this vault.'
            : 'This installation is running in local-only mode — everything is stored in this browser.'
        }
      >
        {supabaseEnabled ? (
          email ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                  {email.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-[13px] font-medium">{email}</p>
                  <p className="text-[11px] text-muted">
                    {allowedEmail && email.toLowerCase() === allowedEmail
                      ? 'Authorised owner account'
                      : 'Signed in'}
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  await signOut()
                  router.replace('/login')
                }}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-muted">You are not signed in, so nothing is syncing.</p>
              <Link href="/login" className="btn-primary">
                Sign in
              </Link>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-body">
              To enable cross-device sync and Google sign-in, create a Supabase project, run the SQL in{' '}
              <code className="rounded bg-surface-2 px-1 py-0.5 text-[11.5px]">supabase/migrations/0001_init.sql</code>{' '}
              and set these environment variables on your deployment:
            </p>
            <ul className="space-y-1 text-[11.5px] text-body">
              <li>
                <code className="rounded bg-surface-2 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code>
              </li>
              <li>
                <code className="rounded bg-surface-2 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              </li>
              <li>
                <code className="rounded bg-surface-2 px-1 py-0.5">NEXT_PUBLIC_ALLOWED_EMAIL</code> — the only
                account allowed in
              </li>
            </ul>
            <p className="text-[11.5px] text-muted">
              Until then the vault stays fully functional offline on this device.
            </p>
          </div>
        )}
      </Section>

      <Section
        id="appearance"
        title="Appearance"
        description="Dark mode paints the vault near-black for late-night revision. The choice is remembered on this device."
      >
        <ThemeSegmented />
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          The moon button in the sidebar (and the header on your phone) switches instantly between light and dark.
          System follows your device setting.
        </p>
      </Section>

      <Section id="sync" title="Synchronisation" description="Every change is queued locally first, then pushed.">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['Mode', supabaseEnabled ? 'Supabase + local cache' : 'Local only'],
            ['Connection', sync.online ? 'Online' : 'Offline'],
            ['Pending changes', supabaseEnabled ? String(sync.pending) : 'Not syncing'],
            ['Last sync', sync.lastSyncedAt ? relativeTime(sync.lastSyncedAt) : 'Not yet'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="text-[11.5px] text-muted">{label}</span>
              <span className="text-[12px] font-medium">{value}</span>
            </div>
          ))}
        </div>

        {sync.error ? (
          <p className="mt-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
            {sync.error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            loading={syncing}
            disabled={!supabaseEnabled}
            onClick={async () => {
              setSyncing(true)
              await syncNow()
              setSyncing(false)
              toast(supabaseEnabled ? 'Sync finished' : 'Enable Supabase to sync')
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync now
          </Button>
          <span className="text-[11px] text-muted">
            <Cloud className="mr-1 inline h-3 w-3" />
            Changes never overwrite a newer copy silently — conflicts are listed below.
          </span>
        </div>

        {conflicts && conflicts.length ? (
          <div className="mt-4 space-y-2">
            <p className="section-title">Needs your decision</p>
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12.5px] font-medium">
                      {ENTITY_LABEL[conflict.entity] ?? conflict.entity} edited on two devices
                    </p>
                    <p className="text-[11px] text-warn">
                      This device {relativeTime(conflict.localUpdatedAt)} · server{' '}
                      {relativeTime(conflict.remoteUpdatedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="secondary"
                      className="h-7 text-[11.5px]"
                      onClick={async () => {
                        await resolveConflict(conflict.id, 'mine')
                        toast('Kept this device’s version')
                      }}
                    >
                      Keep this device
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 text-[11.5px]"
                      onClick={async () => {
                        await resolveConflict(conflict.id, 'theirs')
                        toast('Server version applied')
                      }}
                    >
                      Use server
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        id="drive"
        title="Photo storage"
        description="Photos upload to a folder called “SSC Revision Vault” in your Google Drive. This device keeps a copy so everything still opens offline."
      >
        {!driveConfigured ? (
          <div className="space-y-2 text-[11.5px] leading-relaxed text-body">
            <p>
              Google Drive is not configured yet. Create an OAuth <em>Web application</em> client in Google Cloud
              Console, enable the Google Drive API, then add:
            </p>
            <ul className="space-y-1">
              <li>
                <code className="rounded bg-surface-2 px-1 py-0.5">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> — the client ID
                (no secret is needed in the browser)
              </li>
            </ul>
            <p className="text-muted">
              Until then photos stay in this browser and, once Supabase is set up, in Supabase Storage.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                [
                  'Status',
                  drive?.authorised ? 'Connected' : drive?.linked ? 'Reconnect needed' : 'Not connected',
                ],
                ['Photos in Drive', String(driveImages)],
                ['Only on this device', String(pendingImages)],
                [
                  'Google account',
                  drive?.authorised || drive?.linked ? 'Drive access granted' : 'No access yet',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="text-[11.5px] text-muted">{label}</span>
                  <span className="text-[12px] font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={driveBusy} onClick={connectDriveNow}>
                <FolderOpen className="h-3.5 w-3.5" />
                {drive?.authorised ? 'Reconnect Drive' : 'Connect Google Drive'}
              </Button>
              {pendingImages > 0 && drive?.authorised ? (
                <Button variant="secondary" loading={driveBusy} onClick={pushImages}>
                  <Upload className="h-3.5 w-3.5" /> Upload {pendingImages} photo{pendingImages === 1 ? '' : 's'}
                </Button>
              ) : null}
              {drive?.folderUrl ? (
                <a
                  href={drive.folderUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11.5px] text-accent underline decoration-dotted"
                >
                  Open Drive folder
                </a>
              ) : null}
              {drive?.linked ? (
                <Button
                  variant="ghost"
                  className="text-[11.5px] text-muted"
                  onClick={async () => {
                    await disconnectDrive()
                    await refreshDrive()
                    toast('Google Drive disconnected · photos stay on this device')
                  }}
                >
                  Disconnect
                </Button>
              ) : null}
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              {drive?.linked && !drive?.authorised
                ? 'Drive needs permission again in this tab — press Reconnect to resume uploads.'
                : pendingImages > 0
                  ? `${pendingImages} photo${pendingImages === 1 ? '' : 's'} still ${pendingImages === 1 ? 'exists' : 'exist'} only on this device. ${pendingImages === 1 ? 'It uploads' : 'They upload'} automatically once Drive is connected.`
                  : 'Every photo is in Drive and cached here for offline viewing.'}
            </p>
          </div>
        )}
      </Section>

      <Section title="Revision goal" description="Used for the daily progress bar on the dashboard.">
        <div className="flex items-end gap-2">
          <div className="w-32">
            <label className="label" htmlFor="goal">
              Questions / day
            </label>
            <input
              id="goal"
              type="number"
              min={1}
              max={200}
              value={goal}
              onChange={(event) => setGoal(Number(event.target.value))}
              className="input"
            />
          </div>
          <Button variant="secondary" onClick={saveGoal}>
            <Target className="h-3.5 w-3.5" /> {goalSaved ? 'Saved' : 'Save goal'}
          </Button>
        </div>
      </Section>

      <Section
        id="data"
        title="Backup & restore"
        description="A complete JSON backup with every photo, packaged as a ZIP. Restores never overwrite newer local records."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={doExport} loading={exporting}>
            <Download className="h-3.5 w-3.5" /> Export ZIP
          </Button>
          <Button onClick={() => fileRef.current?.click()} loading={importing}>
            <Upload className="h-3.5 w-3.5" /> Restore from ZIP
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => void doImport(event.target.files?.[0])}
          />
          <span className="text-[11.5px] text-muted">
            <HardDrive className="mr-1 inline h-3 w-3" />
            {usage.images} photo{usage.images === 1 ? '' : 's'} · {formatBytes(usage.bytes)} stored on this device
          </span>
        </div>
        {importSummary ? (
          <p className="mt-3 rounded-md border border-success-line bg-success-soft px-3 py-2 text-[11.5px] text-success">
            {importSummary}
          </p>
        ) : null}
      </Section>

      <section className="card border-danger-line px-4 py-4 sm:px-5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" />
          <div className="flex-1">
            <h2 className="h2">Erase this device</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
              Removes chapters, questions, photos and revision history from this browser. Export a backup first —
              there is no undo. Server data is not deleted.
            </p>
            <Button variant="danger" className="mt-3" onClick={() => setWipeOpen(true)}>
              Erase local vault
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={wipeOpen}
        title="Erase everything on this device?"
        description="All local questions, photos, notes and history will be deleted from this browser. Export a backup first if you need it."
        confirmLabel="Erase local vault"
        onClose={() => setWipeOpen(false)}
        onConfirm={async () => {
          await wipeAllData()
          window.location.href = '/'
        }}
      />

      <p className="pb-2 text-center text-[11px] text-faint">
        SSC Revision Vault · capture → place → attach → revise
      </p>
    </div>
  )
}
