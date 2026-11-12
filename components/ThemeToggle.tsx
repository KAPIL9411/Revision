'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useThemeChoice } from '@/lib/hooks'
import { setThemeChoice, type ThemeChoice } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeSegmented() {
  const current = useThemeChoice()
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setThemeChoice(value)}
            aria-pressed={active}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] transition-colors',
              active ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** One-tap switch used in the shell; follows the resolved theme, not the "system" choice. */
export function ThemeQuickToggle({ className }: { className?: string }) {
  const choice = useThemeChoice()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted ? document.documentElement.classList.contains('dark') : choice === 'dark'
  return (
    <button
      type="button"
      onClick={() => setThemeChoice(isDark ? 'light' : 'dark')}
      className={cn('rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink', className)}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
