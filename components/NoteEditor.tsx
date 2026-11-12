'use client'

import {
  Bold,
  Camera,
  Check,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Sigma,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAttachmentThumbUrl, useAttachmentUrl, useChapterNote } from '@/lib/hooks'
import { addImageAttachment, deleteAttachment, saveChapterNote } from '@/lib/store'
import type { Attachment } from '@/lib/types'
import { Button, ConfirmDialog, ImageViewer, Segmented, toast } from './ui'

/* --------------------------------------------------------------- rendering */

function inline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$[^$]+\$)/g)
  return tokens.map((token, index) => {
    if (/^\*\*[^*]+\*\*$/.test(token)) return <strong key={index}>{token.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(token)) return <em key={index}>{token.slice(1, -1)}</em>
    if (/^`[^`]+`$/.test(token)) return <code key={index}>{token.slice(1, -1)}</code>
    if (/^\$[^$]+\$$/.test(token)) return <span key={index} className="formula">{token.slice(1, -1)}</span>
    return <span key={index}>{token}</span>
  })
}

export function NoteContent({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n')
    const nodes: ReactNode[] = []
    let list: string[] = []
    let ordered = false

    const flush = () => {
      if (!list.length) return
      const items = list.map((item, index) => <li key={index}>{inline(item)}</li>)
      nodes.push(ordered ? <ol key={`l-${nodes.length}`}>{items}</ol> : <ul key={`l-${nodes.length}`}>{items}</ul>)
      list = []
    }

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) {
        flush()
        return
      }
      if (trimmed.startsWith('### ')) {
        flush()
        nodes.push(<h3 key={index}>{inline(trimmed.slice(4))}</h3>)
        return
      }
      if (trimmed.startsWith('## ')) {
        flush()
        nodes.push(<h2 key={index}>{inline(trimmed.slice(3))}</h2>)
        return
      }
      if (/^[-*] /.test(trimmed)) {
        if (ordered) flush()
        ordered = false
        list.push(trimmed.slice(2))
        return
      }
      if (/^\d+\. /.test(trimmed)) {
        if (!ordered) flush()
        ordered = true
        list.push(trimmed.replace(/^\d+\.\s*/, ''))
        return
      }
      flush()
      nodes.push(<p key={index}>{inline(trimmed)}</p>)
    })
    flush()
    return nodes
  }, [text])

  if (!text.trim()) {
    return <p className="text-[13px] text-[#9A9A94]">Nothing written yet.</p>
  }

  return <div className={`prose-note ${className ?? ''}`}>{blocks}</div>
}

/* ------------------------------------------------------------ note photos */

function NotePhoto({ attachment, onOpen, onDelete }: { attachment: Attachment; onOpen: (url: string) => void; onDelete: (row: Attachment) => void }) {
  const thumbUrl = useAttachmentThumbUrl(attachment)
  const fullUrl = useAttachmentUrl(attachment)
  const url = thumbUrl ?? fullUrl
  return (
    <figure className="group relative overflow-hidden rounded-lg border border-line">
      {url ? (
        <button type="button" onClick={() => onOpen(fullUrl ?? url)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Handwritten note" loading="lazy" decoding="async" className="h-28 w-full cursor-zoom-in object-cover" />
        </button>
      ) : (
        <div className="h-28 w-full animate-pulse bg-[#F3F3EF]" />
      )}
      <button
        type="button"
        onClick={() => onDelete(attachment)}
        aria-label="Delete note photo"
        className="absolute right-1.5 top-1.5 rounded-md border border-line bg-white/95 p-1.5 text-[#8A8A85] opacity-0 transition-opacity hover:text-[#B42318] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </figure>
  )
}

/* --------------------------------------------------------------- the editor */

const TOOLS = [
  { key: 'h2', icon: Heading2, label: 'Heading' },
  { key: 'h3', icon: Heading3, label: 'Subheading' },
  { key: 'bold', icon: Bold, label: 'Bold' },
  { key: 'italic', icon: Italic, label: 'Italic' },
  { key: 'ul', icon: List, label: 'Bullet list' },
  { key: 'ol', icon: ListOrdered, label: 'Numbered list' },
  { key: 'formula', icon: Sigma, label: 'Formula' },
] as const

export function NoteEditor({ chapterId, notePhotos }: { chapterId: string; notePhotos: Attachment[] }) {
  const note = useChapterNote(chapterId)
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [viewer, setViewer] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (note === undefined || loaded) return
    setValue(note?.content ?? '')
    latestRef.current = note?.content ?? ''
    setLoaded(true)
  }, [note, loaded])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const persist = async (next: string) => {
    await saveChapterNote(chapterId, next)
    setStatus('saved')
  }

  const change = (next: string) => {
    setValue(next)
    latestRef.current = next
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persist(next)
    }, 650)
  }

  const insert = (before: string, after = before, placeholder = 'text') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
    change(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const prefixLine = (prefix: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`
    change(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }

  const onTool = (key: (typeof TOOLS)[number]['key']) => {
    if (key === 'h2') prefixLine('## ')
    if (key === 'h3') prefixLine('### ')
    if (key === 'bold') insert('**')
    if (key === 'italic') insert('*')
    if (key === 'ul') prefixLine('- ')
    if (key === 'ol') prefixLine('1. ')
    if (key === 'formula') insert('$', '$', 'a^2 + b^2 = c^2')
  }

  const ensureNoteId = async () => {
    if (note?.id) return note.id
    return saveChapterNote(chapterId, latestRef.current)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const noteId = await ensureNoteId()
      await addImageAttachment({ noteId, kind: 'note_photo', file })
      toast('Note photo attached')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not attach the photo', 'error')
    } finally {
      setUploading(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'write', label: 'Write' },
              { value: 'preview', label: 'Read' },
            ]}
          />
          <span className="text-[11px] text-[#9A9A94]">
            {status === 'saving' ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : status === 'saved' ? (
              <span className="inline-flex items-center gap-1 text-[#3E7A5E]">
                <Check className="h-3 w-3" /> Saved
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <Button variant="ghost" className="border border-line" onClick={() => cameraRef.current?.click()} loading={uploading}>
            <Camera className="h-3.5 w-3.5" /> Note photo
          </Button>
          <Button variant="ghost" onClick={() => galleryRef.current?.click()} loading={uploading}>
            <ImagePlus className="h-3.5 w-3.5" /> Gallery
          </Button>
        </div>
      </div>

      {mode === 'write' ? (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-center gap-0.5 border-b border-line bg-[#FCFCFA] px-1.5 py-1">
            {TOOLS.map((tool) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => onTool(tool.key)}
                aria-label={tool.label}
                title={tool.label}
                onMouseDown={(event) => event.preventDefault()}
                className="rounded p-1.5 text-[#6B6B66] hover:bg-[#EFEFEA] hover:text-ink"
              >
                <tool.icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <span className="ml-auto pr-1 text-[10.5px] text-[#B3B3AC]">Autosaves</span>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => change(event.target.value)}
            onBlur={() => {
              if (timerRef.current) clearTimeout(timerRef.current)
              void persist(latestRef.current)
            }}
            rows={14}
            placeholder={'## Important formulas\n- $SI = P × R × T / 100$\n\n## Shortcuts\n- Use fraction conversion for 12.5% = 1/8'}
            className="min-h-[240px] w-full resize-y border-0 px-3.5 py-3 text-[13.5px] leading-[1.7] outline-none placeholder:text-[#B3B3AC]"
          />
        </div>
      ) : (
        <div className="min-h-[160px] rounded-lg border border-line bg-white px-3.5 py-3">
          <NoteContent text={value} />
        </div>
      )}

      <p className="text-[11px] text-[#9A9A94]">
        Tip: wrap a formula in dollar signs, like <span className="formula">$a^2+b^2=c^2$</span>.
      </p>

      {notePhotos.length ? (
        <div>
          <p className="section-title mb-2">Handwritten notes</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {notePhotos.map((attachment) => (
              <NotePhoto
                key={attachment.id}
                attachment={attachment}
                onOpen={setViewer}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        </div>
      ) : null}

      {viewer ? <ImageViewer src={viewer} onClose={() => setViewer(null)} /> : null}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete note photo?"
        description="This removes the photo from your chapter notes."
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          await deleteAttachment(pendingDelete.id)
          setPendingDelete(null)
          toast('Note photo deleted')
        }}
      />
    </div>
  )
}

export function NoteEditorHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#9A9A94]">
      <Pencil className="h-3 w-3" /> Notes autosave as you type
    </span>
  )
}
