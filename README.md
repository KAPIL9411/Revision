# SSC Revision Vault

A private, chapter-wise revision system for SSC CGL. Capture a question in seconds, file it into the right
chapter, photograph the handwritten solution, then revise the chapter without seeing answers until you ask
for them.

Built as a local-first product: the interface reads and writes IndexedDB, so every interaction is instant and
works offline. Supabase mirrors the same rows and photos when it is configured, which is what makes the vault
available on a laptop and a phone.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS, Inter, custom design tokens |
| Local store | Dexie (IndexedDB) — source of truth for the UI |
| Sync | Supabase Postgres, outbox push, cursor pull |
| Photos | Google Drive (`drive.file` scope) + IndexedDB cache; Supabase Storage fallback |
| Forms & validation | React Hook Form + Zod |
| Drag and drop | dnd-kit (pointer + keyboard sensors) |
| Backup | `fflate` ZIP containing JSON + every image |
| PWA | Web manifest + service worker (production only) |

No analytics, no third-party UI kit, no CSS-in-JS runtime.

---

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

The app works immediately with **no configuration**: it seeds the full SSC syllabus (4 subjects, 99
chapters/sub-chapters) into IndexedDB and runs in local-only mode. `npm run build && npm start` produces the
production build; type checking is available with `npm run typecheck`.

---

## Connect Supabase (optional, needed for multi-device)

1. Create a Supabase project.
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor. It creates
   every table, foreign key, index, the `attachments` Storage bucket, the profile trigger, and Row Level
   Security policies that scope every row to `auth.uid()`.
3. Enable Google under **Authentication → Providers**. Add your deployed origin and
   `http://localhost:3000/auth/callback` to the allowed redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   NEXT_PUBLIC_ALLOWED_EMAIL=you@gmail.com   # optional single-account lock
   ```

5. Restart the dev server. `/login` now offers Google sign-in, and the first sign-in claims any questions you
   created offline and starts syncing.

Only the **anon** key is used in the browser. Row Level Security, not the client, is what isolates accounts;
never put a service-role key into `NEXT_PUBLIC_*`.

Deploy the frontend to Vercel and add the same environment variables in the project settings.

---

## Photos in Google Drive (recommended)

Questions are usually screenshots, so the photo is the record. With a Google OAuth client configured, every
question image, handwritten solution and note photo is uploaded to a folder named **SSC Revision Vault** in
your own Drive, and the row keeps the Drive file id. The device also keeps a local copy, so images open
instantly and still work offline.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google
   Drive API**.
2. Configure the OAuth consent screen (External is fine for personal use; add your own address as a test user
   while the app is unpublished). The `drive.file` scope is non-sensitive, so no verification review is
   needed.
3. Create credentials → **OAuth client ID** → *Web application*. Add authorised JavaScript origins:
   `http://localhost:3000` and your deployed origin.
4. Put the client ID in `.env.local` (or your host's environment):

   ```bash
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   ```

5. Restart, open **Settings → Photo storage**, press **Connect Google Drive**, and approve access.

How it behaves:

- New captures upload within seconds of saving; the app retries any backlog on reconnect, on every sync, and
  every 90 seconds while open.
- Deleting the vault folder in Drive is recoverable: the app recreates it and re-uploads on the next pass.
- If Drive is signed out, photos stay on-device (and go to Supabase Storage once sync is configured) — nothing
  is lost, and Settings shows how many photos are still only on this device.
- The scope is `drive.file`: the app can only see files it created. It cannot read the rest of your Drive.
- Access tokens live in `sessionStorage` for the tab and are revoked on **Disconnect**; no client secret or
  refresh token exists in the browser.

---

## Architecture

```
app/                      routes (App Router)
  (app)/                  authenticated shell: dashboard, inbox, chapters, revision, search, formulas, settings
  login/, auth/callback/  Google sign-in
components/               design system, question form/card/sheet, solution block, note editor, shell
lib/
  db.ts                   Dexie schema + meta/user helpers
  store.ts                every write: Dexie transaction + sync outbox entry
  hooks.ts                live queries (tree, chapter stats, dashboard, attachments)
  sync.ts                 push outbox → Supabase, pull cursors → Dexie, conflict records
  drive.ts                Google Drive folder, uploads, downloads and local caching
  backup.ts               ZIP export / conflict-safe restore
  images.ts               resize + re-encode photos, thumbnails, EXIF-safe orientation
  seed.ts                 SSC subject/chapter hierarchy with stable ids
supabase/migrations/      schema, RLS, storage policies
public/sw.js              app-shell caching + offline navigation fallback
```

### Why local-first

The core loop must never wait for the network. Every mutation is written to IndexedDB and queued in an
`outbox` inside the same logical step, so capture feels instant and works on a train. Live queries
(`dexie-react-hooks`) re-render the UI; the sync engine is a background concern with a visible status badge.

### Sync and conflicts

- **Push**: outbox entries are deduplicated per row, read the current local row, upload any pending photo to
  Drive first (falling back to Storage at
  `attachments/<user>/<question-or-note>/<attachment>.jpg`), then `upsert` into Postgres.
- **Pull**: each table has an `updated_at` cursor. Rows newer than the cursor are applied locally.
- **Conflicts**: if a row has a pending local change *and* the server copy is newer, the local copy is kept and
  a record appears in **Settings → Synchronisation**. Nothing is silently overwritten; you choose
  “Keep this device” or “Use server”.
- Attachments store the binary in IndexedDB for offline viewing and upload it once. A device without the
  binary fetches it by Drive file id (or through a short-lived Storage URL) and caches it locally, so a photo
  only crosses the network once per device.

### Backup

**Settings → Backup & restore** exports `ssc-revision-vault-<date>.zip`:

```
data.json                     all rows, exactly as stored
images/<attachment-id>.jpg    full-resolution photos
thumbs/<attachment-id>.jpg    list thumbnails
```

Restoring merges rather than replaces: a local row is only kept if it is strictly newer than the incoming one,
and the result is reported (“Restored N records and M photos, K newer local records kept”).

---

## Product surfaces

- **Dashboard** — continue-revision target, daily goal progress, saved/pending/difficult/bookmarked counts,
  subject-wise progress, recently added questions, recently revised chapters. No charts, no streak gimmicks.
- **Question Inbox** — unsorted questions, draggable into any chapter from the sidebar or the in-page chapter
  list. On touch devices the same job is one tap away via **Move to chapter**.
- **Chapter page** — overview stats, filters (all/new/difficult/incorrect/bookmarked/no solution), question
  list, autosaving notes with formula markup and handwritten note photos, formulas, topics.
- **Revision mode** — full-screen, one question at a time, solutions hidden behind **Reveal Solution**,
  previous/next, bookmark, difficult, revised/shaky/incorrect, keyboard shortcuts, session summary.
- **Formula Book** — every formula from every chapter, searchable, editable.
- **Search** — instant local search plus subject, chapter, difficulty, source, bookmark, revision and date
  filters.
- **Settings** — account, sync status and conflict resolution, daily goal, ZIP backup/restore, erase.

### Keyboard shortcuts (revision mode)

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next question |
| `M` | Mark revised and advance |
| `B` | Toggle bookmark |
| `D` | Toggle difficult |

### Images

Photos are downscaled to a 1800 px long edge and re-encoded at JPEG q0.86 (small JPEGs under 750 KB are kept
byte-for-byte). Orientation is preserved by decoding through `createImageBitmap({ imageOrientation:
'from-image' })` with an `<img>` fallback. A 360 px thumbnail is generated for lists; solutions are never shown
as thumbnails before reveal.

---

## Data model

`profiles`, `subjects`, `chapters` (self-referencing for sub-chapters), `topics`, `questions`,
`question_chapters`, `question_attachments`, `chapter_notes`, `formulas`, `revision_history`, `tags`,
`question_tags` — all with `user_id`, foreign keys, indexes on the lookup columns, and RLS policies for
select/insert/update/delete.

Ids are client-generated strings so rows can be created offline without collisions; the seeded syllabus uses
stable ids (`ch_math_percentage`), which is why re-seeding and restoring cannot duplicate chapters.

`solution_text` and `question_attachments.kind` extend the specified schema: a solution can be photos, written
text, or both, and one attachment table serves question images, solutions and handwritten note photos.

---

## Acceptance test status

Verified in a real browser against the development build:

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Create a question inside Percentage | Pass |
| 2 | Create in the global Inbox and drag it into Percentage | Pass (pointer drag, inbox count 1 → 0) |
| 3 | Move a question to another chapter | Pass (Move to chapter) |
| 4 | Attach a handwritten solution photo | Pass (camera + gallery inputs, compression pipeline) |
| 5 | Solution hidden until **Reveal Solution** | Pass (no solution `<img>` in the DOM before reveal, even after reload) |
| 6 | Revise all Percentage questions sequentially | Pass (counter `1 of 2`, session complete) |
| 7 | Filter only difficult questions | Pass |
| 8 | Add formulas and notes to a chapter | Pass (note autosave survives reload, formula appears in Formula Book) |
| 9 | Close and return without losing data | Pass (reload persistence) |
| 10 | Same questions on laptop and phone | Requires Supabase project + Google OAuth (see setup); mobile layout verified |
| 11 | Cached material offline, sync later | Local store works offline; service worker is production-only, cross-device push verified by design but needs a Supabase project |
| 12 | Export complete bank and restore it | Pass (ZIP with images exported, vault wiped, restore brought questions, photo and formula back) |

---

## Brand assets

The Staff Selection Commission emblem lives in `public/brand/` (`ssc-emblem.webp` for the interface, `icon-192/512` and a maskable variant for installable-app icons, plus `app/icon.png` and `app/apple-icon.png`). It was prepared from a source image at the owner's request; replace those files if you redistribute the project.

## Known limits

- Cross-device sync and sign-in are dormant until the Supabase environment variables exist; the app tells you
  so in Settings instead of pretending to sync.
- Text search runs in memory over the local cache — deliberate for a personal question bank, and it means
  search works offline. If the bank ever grows past tens of thousands of rows, move it to Postgres full-text
  search.
- The service worker caches the app shell and visited pages; it is intentionally not registered in development.
- Photos live in IndexedDB: clearing site data removes them, so export a ZIP before wiping a browser.
