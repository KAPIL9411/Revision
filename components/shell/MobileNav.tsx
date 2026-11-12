'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Home, Inbox, Library, Plus, Search, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeQuickToggle } from '@/components/ThemeToggle'
import { db } from '@/lib/db'
import { cn } from '@/lib/utils'
import { SyncBadge } from './Sidebar'

export function MobileHeader() {
  const pathname = usePathname()

  // The home screen owns its greeting row; other screens get this slim bar.
  if (pathname === '/') return null

  return (
    <header className="safe-top sticky top-0 z-30 lg:hidden">
      <div className="flex h-12 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/ssc-emblem.webp"
          alt="Staff Selection Commission"
          className="h-7 w-auto select-none"
          draggable={false}
        />
        <div className="ml-auto flex items-center gap-1">
          <SyncBadge compact />
          <ThemeQuickToggle />
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}

export function MobileNav({ onCapture }: { onCapture: () => void }) {
  const pathname = usePathname()
  const inboxCount = useLiveQuery(() => db.questions.filter((question) => !question.primaryChapterId).count(), [])

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden" aria-label="Main navigation">
      <div className="pointer-events-auto mx-auto flex max-w-[420px] items-center gap-0.5 rounded-full border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-xl">
        <NavPill href="/" label="Home" icon={Home} active={isActive('/')} />
        <NavPill href="/inbox" label="Inbox" icon={Inbox} active={isActive('/inbox')} badge={inboxCount ?? 0} />

        <button
          onClick={onCapture}
          aria-label="Quick capture question"
          className="mx-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_20px_-8px_rgba(49,87,213,0.9)] transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>

        <NavPill href="/search" label="Search" icon={Search} active={isActive('/search')} />
        <NavPill href="/subjects" label="Library" icon={Library} active={isActive('/subjects')} />
      </div>
    </nav>
  )
}

function NavPill({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: typeof Home
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-medium transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-faint hover:text-ink',
      )}
    >
      <span className="relative">
        <Icon className={cn('h-[18px] w-[18px]', active && 'stroke-[2.2]')} />
        {badge ? (
          <span className="absolute -right-2 -top-1 min-w-[14px] rounded-full bg-accent px-1 text-center text-[9px] leading-[14px] text-on-accent">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  )
}
