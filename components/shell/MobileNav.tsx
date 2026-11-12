'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Inbox, LayoutDashboard, Library, Plus, Search, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { db } from '@/lib/db'
import { cn } from '@/lib/utils'
import { SyncBadge } from './Sidebar'

export function MobileHeader() {
  return (
    <header className="safe-top sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-line bg-[#FBFBF8]/95 px-4 backdrop-blur lg:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/ssc-emblem.webp"
        alt="Staff Selection Commission"
        className="h-8 w-auto select-none"
        draggable={false}
      />
      <div className="ml-auto flex items-center gap-2">
        <SyncBadge compact />
        <Link href="/settings" aria-label="Settings" className="rounded-md p-1.5 text-[#6B6B66] hover:bg-[#EFEFEA]">
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )
}

export function MobileNav({ onCapture }: { onCapture: () => void }) {
  const pathname = usePathname()
  const inboxCount = useLiveQuery(() => db.questions.filter((question) => !question.primaryChapterId).count(), [])

  const items = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/inbox', label: 'Inbox', icon: Inbox, badge: inboxCount ?? 0 },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/subjects', label: 'Library', icon: Library },
  ]

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden"
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-5 items-end px-1 pb-1">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <div className="flex justify-center">
          <button
            onClick={onCapture}
            aria-label="Quick capture question"
            className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow-[0_6px_16px_-6px_rgba(49,87,213,0.7)] active:bg-accent-dark"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {items.slice(2).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  )
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: typeof Inbox
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium',
        active ? 'text-accent' : 'text-[#8A8A85]',
      )}
    >
      <span className="relative">
        <Icon className="h-[19px] w-[19px]" />
        {badge ? (
          <span className="absolute -right-2 -top-1 min-w-[14px] rounded-full bg-accent px-1 text-center text-[9px] leading-[14px] text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  )
}
