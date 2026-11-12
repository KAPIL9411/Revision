'use client'

import { useDroppable } from '@dnd-kit/core'
import {
  ChevronRight,
  Inbox,
  LayoutDashboard,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sigma,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useSubjectTree, useSyncState, type ChapterNode } from '@/lib/hooks'
import { cn, relativeTime } from '@/lib/utils'
import { ThemeQuickToggle } from '@/components/ThemeToggle'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

function DropChapter({
  chapterId,
  name,
  href,
  active,
  count,
  nested,
}: {
  chapterId: string
  name: string
  href: string
  active: boolean
  count: number
  nested?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `chapter:${chapterId}`, data: { type: 'chapter', chapterId } })
  return (
    <Link
      ref={setNodeRef}
      href={href}
      className={cn(
        'group flex items-center gap-2 rounded-md py-[5px] pr-1.5 text-[13px] transition-colors',
        nested ? 'pl-8' : 'pl-6',
        active ? 'bg-accent-soft font-medium text-accent' : 'text-body hover:bg-surface-3',
        isOver && 'bg-accent-soft ring-1 ring-accent/40',
      )}
    >
      <span className="truncate">{name}</span>
      {count > 0 ? (
        <span className={cn('ml-auto text-[10.5px] tabular-nums', active ? 'text-accent/70' : 'text-faint')}>
          {count}
        </span>
      ) : null}
    </Link>
  )
}

export function SyncBadge({ compact }: { compact?: boolean }) {
  const sync = useSyncState()
  const label = !sync.enabled
    ? 'Local only'
    : !sync.online
      ? 'Offline'
      : sync.error
        ? 'Sync issue'
        : sync.syncing
          ? 'Syncing…'
          : sync.signedIn
            ? sync.pending > 0
              ? `${sync.pending} pending`
              : 'Synced'
            : 'Not signed in'

  const tone = !sync.enabled
    ? 'bg-muted'
    : !sync.online
      ? 'bg-warn'
      : sync.error
        ? 'bg-danger'
        : sync.syncing
          ? 'bg-accent animate-pulse'
          : sync.signedIn && sync.pending === 0
            ? 'bg-success'
            : 'bg-warn'

  return (
    <Link href="/settings" className="flex items-center gap-2 rounded-md px-1 py-1 text-[11.5px] text-muted hover:text-ink">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone)} aria-hidden />
      <span className="truncate">{label}</span>
      {!compact && sync.lastSyncedAt ? (
        <span className="ml-auto truncate text-[10.5px] text-faint">{relativeTime(sync.lastSyncedAt)}</span>
      ) : null}
    </Link>
  )
}

export function Sidebar({
  onQuickCapture,
  onTogglePanel,
  panelOpen,
}: {
  onQuickCapture: () => void
  onTogglePanel: () => void
  panelOpen: boolean
}) {
  const pathname = usePathname()
  const tree = useSubjectTree()
  const inboxCount = useLiveQuery(() => db.questions.filter((question) => !question.primaryChapterId).count(), [])
  const [openSubjects, setOpenSubjects] = useState<string[]>([])
  const [openParents, setOpenParents] = useState<string[]>([])

  const activeChapterId = useMemo(() => {
    const match = pathname.match(/^\/chapters\/([^/]+)/)
    return match?.[1] ?? null
  }, [pathname])

  useEffect(() => {
    if (!tree) return
    if (activeChapterId) {
      const subject = tree.find((group) =>
        group.chapters.some(
          (node) => node.chapter.id === activeChapterId || node.children.some((child) => child.id === activeChapterId),
        ),
      )
      if (subject) {
        setOpenSubjects((rows) => (rows.includes(subject.subject.id) ? rows : [...rows, subject.subject.id]))
        const parent = subject.chapters.find((node) =>
          node.children.some((child) => child.id === activeChapterId),
        )
        if (parent) {
          setOpenParents((rows) => (rows.includes(parent.chapter.id) ? rows : [...rows, parent.chapter.id]))
        }
      }
    }
  }, [activeChapterId, tree])

  const toggle = (list: string[], setList: (rows: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((row) => row !== id) : [...list, id])
  }

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inbox', label: 'Question Inbox', icon: Inbox, badge: inboxCount ?? 0 },
    { href: '/formulas', label: 'Formula Book', icon: Sigma },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[268px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center px-3.5 pb-3 pt-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/ssc-emblem.webp"
          alt="Staff Selection Commission"
          className="h-[52px] w-auto select-none"
          draggable={false}
        />
      </div>

      <div className="px-3">
        <button onClick={onQuickCapture} className="btn-primary h-8 w-full justify-start px-2.5 text-[12.5px]">
          <Plus className="h-3.5 w-3.5" /> New question
        </button>
      </div>

      <nav className="mt-3 space-y-0.5 px-3">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} className={cn('navlink', active && 'navlink-active')}>
              <item.icon className="h-[15px] w-[15px]" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] tabular-nums', active ? 'bg-surface/70 text-accent' : 'bg-surface-3 text-muted')}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <p className="section-title mb-1.5 px-4">Library</p>
        <div className="thin-scroll flex-1 overflow-y-auto px-3 pb-3">
          {(tree ?? []).map((group) => {
            const open = openSubjects.includes(group.subject.id)
            return (
              <div key={group.subject.id} className="mb-0.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle(openSubjects, setOpenSubjects, group.subject.id)}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${group.subject.name}`}
                    className="rounded p-1 text-faint hover:bg-surface-3 hover:text-ink"
                  >
                    <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
                  </button>
                  <Link
                    href={`/subjects/${group.subject.id}`}
                    className={cn(
                      'flex flex-1 items-center gap-2 truncate rounded-md py-1 pr-1.5 text-[13px] font-medium',
                      pathname === `/subjects/${group.subject.id}` ? 'text-accent' : 'text-body hover:text-ink',
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: group.subject.color }} />
                    <span className="truncate">{group.subject.name}</span>
                    <span className="ml-auto text-[10.5px] tabular-nums text-faint">{group.count}</span>
                  </Link>
                </div>

                {open ? (
                  <div className="mt-0.5 space-y-px">
                    {group.chapters.map((node: ChapterNode) => {
                      const parentOpen = openParents.includes(node.chapter.id)
                      const hasChildren = node.children.length > 0
                      return (
                        <div key={node.chapter.id}>
                          <div className="flex items-center">
                            {hasChildren ? (
                              <button
                                onClick={() => toggle(openParents, setOpenParents, node.chapter.id)}
                                aria-label={`${parentOpen ? 'Collapse' : 'Expand'} ${node.chapter.name}`}
                                className="ml-[26px] rounded p-0.5 text-faint hover:text-ink"
                              >
                                <ChevronRight className={cn('h-2.5 w-2.5 transition-transform', parentOpen && 'rotate-90')} />
                              </button>
                            ) : (
                              <span className="ml-[26px] w-[14px]" />
                            )}
                            <DropChapter
                              chapterId={node.chapter.id}
                              name={node.chapter.name}
                              href={`/chapters/${node.chapter.id}`}
                              active={activeChapterId === node.chapter.id}
                              count={node.count}
                              nested
                            />
                          </div>
                          {hasChildren && parentOpen
                            ? node.children.map((child) => (
                                <DropChapter
                                  key={child.id}
                                  chapterId={child.id}
                                  name={child.name}
                                  href={`/chapters/${child.id}`}
                                  active={activeChapterId === child.id}
                                  count={0}
                                  nested
                                />
                              ))
                            : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-1 border-t border-line px-3 py-2.5">
        <button
          onClick={onTogglePanel}
          className={cn('navlink w-full', panelOpen && 'bg-surface-3 text-ink')}
          aria-pressed={panelOpen}
        >
          <PanelRight className="h-[15px] w-[15px]" />
          Quick capture panel
        </button>
        <div className="flex items-center justify-between gap-2">
          <SyncBadge />
          <ThemeQuickToggle />
        </div>
      </div>
    </aside>
  )
}
