'use client'

import { X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { cn, uid } from '@/lib/utils'

/* ------------------------------------------------------------------ buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

export function Button({
  variant = 'secondary',
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button className={cn(VARIANTS[variant], className)} {...props} disabled={props.disabled || loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={cn('btn-icon', className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- toasts */

export interface ToastItem {
  id: string
  message: string
  tone: 'default' | 'error'
}

let toastItems: ToastItem[] = []
const toastListeners = new Set<() => void>()

function emitToast() {
  toastListeners.forEach((listener) => listener())
}

export function toast(message: string, tone: 'default' | 'error' = 'default') {
  const item = { id: uid(), message, tone }
  toastItems = [...toastItems, item]
  emitToast()
  setTimeout(() => {
    toastItems = toastItems.filter((row) => row.id !== item.id)
    emitToast()
  }, 3600)
}

export function Toaster() {
  const items = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener)
      return () => toastListeners.delete(listener)
    },
    () => toastItems,
    () => toastItems,
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'pointer-events-auto max-w-sm rounded-lg border px-3.5 py-2.5 text-[13px] shadow-pop',
            item.tone === 'error'
              ? 'border-[#E7C9C9] bg-[#FDF2F2] text-[#B42318]'
              : 'border-[#26352E] bg-[#202124] text-white',
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- sheet */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideClose = false,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  hideClose?: boolean
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-[#1B1B18]/35 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-pop sm:rounded-xl',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              {title ? (
                <h2 id={titleId} className="text-[15px] font-semibold">
                  {title}
                </h2>
              ) : null}
              {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
            </div>
            {!hideClose && (
              <IconButton label="Close" onClick={onClose} className="-mr-1.5 -mt-1">
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        )}
        <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line bg-[#FCFCFA] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- dropdown */

export function Dropdown({
  trigger,
  children,
  align = 'end',
  className,
}: {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  icon,
  disabled,
}: {
  children: ReactNode
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40',
        danger ? 'text-[#B42318] hover:bg-[#FDF2F2]' : 'text-[#33332F] hover:bg-[#F3F3EF]',
      )}
    >
      {icon ? <span className="text-[#8A8A85]">{icon}</span> : null}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ confirm */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
  busy,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-[#55554F]">{description}</p>
    </Sheet>
  )
}

/* -------------------------------------------------------------- image viewer */

export function ImageViewer({
  src,
  alt,
  onClose,
}: {
  src: string
  alt?: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(3, value + 0.25))
      if (event.key === '-') setZoom((value) => Math.max(1, value - 0.25))
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-[#141412]">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-[12.5px] text-white/60">Handwritten solution</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            className="rounded-md p-2 text-white/80 hover:bg-white/10"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-[12px] text-white/60">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
            className="rounded-md p-2 text-white/80 hover:bg-white/10"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="ml-2 rounded-md p-2 text-white/80 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="thin-scroll flex-1 overflow-auto p-4">
        <div className="flex min-h-full items-start justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? 'Attachment'}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="max-w-full rounded transition-transform"
          />
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- small pieces */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#FCFCFA] px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-[#B3B3AC]">{icon}</div> : null}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function StatTile({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <p className="section-title">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      {hint ? <p className="mt-1.5 text-[11.5px] text-muted">{hint}</p> : null}
    </>
  )
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="card px-4 py-3.5 text-left transition-colors hover:border-[#D8D8D2]"
      >
        {content}
      </button>
    )
  }
  return <div className="card px-4 py-3.5">{content}</div>
}

export function ProgressBar({ value, total, tone = 'accent' }: { value: number; total: number; tone?: 'accent' | 'muted' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFEFEA]">
      <div
        className={cn('h-full rounded-full transition-all', tone === 'accent' ? 'bg-accent' : 'bg-[#B9B9B2]')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-line bg-[#F3F3EF] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
            value === option.value
              ? 'bg-white text-ink shadow-[0_1px_2px_rgba(24,24,20,0.08)]'
              : 'text-[#6B6B66] hover:text-ink',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function NamePrompt({
  open,
  title,
  description,
  initial,
  placeholder,
  submitLabel = 'Save',
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  initial?: string
  placeholder?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setValue(initial ?? '')
  }, [open, initial])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!value.trim()}
            onClick={async () => {
              if (!value.trim()) return
              setBusy(true)
              try {
                await onSubmit(value.trim())
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {submitLabel}
          </Button>
        </div>
      }
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) {
            event.preventDefault()
            void onSubmit(value.trim()).then(onClose)
          }
        }}
        placeholder={placeholder ?? 'Name'}
        className="input"
      />
    </Sheet>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? 'Loading…'}
    </div>
  )
}
