'use client'

import { Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useThemeChoice } from '@/lib/hooks'
import { setThemeChoice } from '@/lib/theme'

export function ThemeQuickToggle({ className }: { className?: string }) {
  const choice = useThemeChoice()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Always show light theme since dark mode is removed
  const isDark = false
  return (
    <button
      type="button"
      onClick={() => setThemeChoice('light')}
      className={cn('rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink', className)}
      aria-label="Switch to light theme"
      title="Switch to light theme"
    >
      <Sun className="h-4 w-4" />
    </button>
  )
}