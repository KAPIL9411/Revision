'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { EmptyState, ProgressBar, Spinner } from '@/components/ui'
import { useSubjectTree } from '@/lib/hooks'

export default function LibraryPage() {
  const tree = useSubjectTree()

  if (!tree) return <Spinner label="Loading library…" />

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h1">Library</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Everything is organised by subject and chapter. Open a subject to rename, reorder or add chapters.
        </p>
      </header>

      {tree.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {tree.map((group) => {
            const chapterCount = group.chapters.reduce((sum, node) => sum + 1 + node.children.length, 0)
            return (
              <Link
                key={group.subject.id}
                href={`/subjects/${group.subject.id}`}
                className="card p-4 transition-colors hover:border-[#D8D8D2]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.subject.color }} />
                    <h2 className="text-[14px] font-semibold">{group.subject.name}</h2>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-[#B3B3AC]" />
                </div>
                <p className="mt-1 text-[11.5px] text-muted">
                  {chapterCount} chapters · {group.count} question{group.count === 1 ? '' : 's'}
                </p>
                <div className="mt-3">
                  <ProgressBar value={group.revised} total={group.count} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {group.revised} revised · {Math.max(0, group.count - group.revised)} pending
                </p>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No subjects yet" description="Reinstall the vault or restore a backup to get the SSC syllabus." />
      )}
    </div>
  )
}
