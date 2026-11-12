'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta } from '@/lib/db'
import { useChapterOptions } from '@/lib/hooks'
import { QuestionForm } from './QuestionForm'
import { Spinner } from './ui'

export function QuickCapture({
  onSaved,
  initialImage,
}: {
  onSaved?: (id: string) => void
  initialImage?: File | null
}) {
  const options = useChapterOptions()
  const lastChapterId = useLiveQuery(() => getMeta('lastChapterId'), [])
  const lastChapter = (options ?? []).find((row) => row.chapter.id === lastChapterId)

  if (!options || lastChapterId === undefined) return <Spinner label="Preparing capture…" />

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] leading-relaxed text-muted">
        Capture now, place it later. Saved on this device instantly — syncs when you are online.
      </p>
      <QuestionForm
        compact
        defaultSubjectId={lastChapter?.chapter.subjectId}
        defaultChapterId={null}
        initialImage={initialImage}
        onSaved={onSaved}
      />
    </div>
  )
}
