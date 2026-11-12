import { db, getMeta, setMeta } from './db'
import type { Chapter, Subject } from './types'
import { slugify } from './utils'

type SeedChapter = { name: string; children?: string[] }

const SEED: {
  id: string
  key: string
  name: string
  slug: string
  color: string
  chapters: SeedChapter[]
}[] = [
  {
    id: 'sub_math',
    key: 'math',
    name: 'Mathematics',
    slug: 'mathematics',
    color: '#3157D5',
    chapters: [
      { name: 'Percentage' },
      { name: 'Profit and Loss' },
      { name: 'Discount' },
      { name: 'Simple Interest' },
      { name: 'Compound Interest' },
      { name: 'Ratio and Proportion' },
      { name: 'Average' },
      { name: 'Mixture and Alligation' },
      { name: 'Time and Work' },
      { name: 'Pipes and Cisterns' },
      { name: 'Time, Speed and Distance' },
      { name: 'Train' },
      { name: 'Boat and Stream' },
      { name: 'Number System' },
      { name: 'Simplification' },
      { name: 'Algebra' },
      { name: 'Geometry' },
      { name: 'Mensuration 2D' },
      { name: 'Mensuration 3D' },
      { name: 'Trigonometry' },
      { name: 'Height and Distance' },
      { name: 'Coordinate Geometry' },
      { name: 'Data Interpretation' },
    ],
  },
  {
    id: 'sub_reasoning',
    key: 'reasoning',
    name: 'Reasoning',
    slug: 'reasoning',
    color: '#5B5BD6',
    chapters: [
      { name: 'Analogy' },
      { name: 'Classification' },
      { name: 'Number Series' },
      { name: 'Alphabet Series' },
      { name: 'Coding-Decoding' },
      { name: 'Blood Relation' },
      { name: 'Direction' },
      { name: 'Order and Ranking' },
      { name: 'Syllogism' },
      { name: 'Venn Diagram' },
      { name: 'Mathematical Operations' },
      { name: 'Missing Number' },
      { name: 'Non-Verbal Reasoning' },
      { name: 'Mirror and Water Image' },
      { name: 'Paper Folding' },
      { name: 'Figure Counting' },
      { name: 'Embedded Figures' },
      { name: 'Dice' },
      { name: 'Calendar and Clock' },
      { name: 'Seating Arrangement' },
    ],
  },
  {
    id: 'sub_english',
    key: 'english',
    name: 'English',
    slug: 'english',
    color: '#2F7D5D',
    chapters: [
      { name: 'Parts of Speech' },
      { name: 'Noun' },
      { name: 'Pronoun' },
      { name: 'Verb' },
      { name: 'Adjective' },
      { name: 'Adverb' },
      { name: 'Articles' },
      { name: 'Preposition' },
      { name: 'Conjunction' },
      { name: 'Subject Verb Agreement' },
      { name: 'Tense' },
      { name: 'Voice' },
      { name: 'Narration' },
      { name: 'Error Detection' },
      { name: 'Sentence Improvement' },
      { name: 'Fill in the Blanks' },
      { name: 'Cloze Test' },
      { name: 'Reading Comprehension' },
      { name: 'Para Jumbles' },
      { name: 'One Word Substitution' },
      { name: 'Idioms and Phrases' },
      { name: 'Synonyms and Antonyms' },
      { name: 'Spelling Correction' },
      { name: 'Vocabulary' },
    ],
  },
  {
    id: 'sub_ga',
    key: 'ga',
    name: 'General Awareness',
    slug: 'general-awareness',
    color: '#B4741F',
    chapters: [
      { name: 'History', children: ['Ancient History', 'Medieval History', 'Modern History'] },
      { name: 'Geography', children: ['Indian Geography', 'World Geography', 'Physical Geography'] },
      {
        name: 'Polity',
        children: [
          'Constitution',
          'Fundamental Rights',
          'Parliament',
          'President and Governor',
          'Judiciary',
          'Constitutional Bodies',
        ],
      },
      {
        name: 'Economics',
        children: ['Basic Economics', 'Banking and Finance', 'Budget and Taxation', 'Economic Development'],
      },
      { name: 'Science', children: ['Physics', 'Chemistry', 'Biology'] },
      {
        name: 'Other',
        children: [
          'Static GK',
          'Art and Culture',
          'Sports',
          'Awards',
          'Important Days',
          'Books and Authors',
          'Current Affairs',
        ],
      },
    ],
  },
]

export const SEED_CHAPTER_IDS = SEED.flatMap((subject) => {
  const ids: string[] = []
  subject.chapters.forEach((chapter) => {
    const parent = `ch_${subject.key}_${slugify(chapter.name)}`
    ids.push(parent)
    chapter.children?.forEach((child) => ids.push(`${parent}__${slugify(child)}`))
  })
  return ids
})

export function buildSeedRows(userId: string) {
  // A fixed timestamp keeps freshly-seeded syllabus rows older than anything the
  // user (or a restored backup) writes, so a restore can safely win.
  const timestamp = '2024-01-01T00:00:00.000Z'
  const subjects: Subject[] = []
  const chapters: Chapter[] = []

  SEED.forEach((subject, subjectIndex) => {
    subjects.push({
      id: subject.id,
      userId,
      name: subject.name,
      slug: subject.slug,
      color: subject.color,
      position: subjectIndex,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    subject.chapters.forEach((chapter, chapterIndex) => {
      const parentId = `ch_${subject.key}_${slugify(chapter.name)}`
      chapters.push({
        id: parentId,
        userId,
        subjectId: subject.id,
        parentId: null,
        name: chapter.name,
        position: chapterIndex,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      chapter.children?.forEach((child, childIndex) => {
        chapters.push({
          id: `${parentId}__${slugify(child)}`,
          userId,
          subjectId: subject.id,
          parentId,
          name: child,
          position: childIndex,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      })
    })
  })

  return { subjects, chapters }
}

/** Seed once per installation. Never overwrites user data. */
export async function seedIfNeeded(userId: string) {
  const seeded = await getMeta('seeded')
  if (seeded === '1') return false
  const existing = await db.subjects.count()
  if (existing > 0) {
    await setMeta('seeded', '1')
    return false
  }
  const { subjects, chapters } = buildSeedRows(userId)
  await db.transaction('rw', db.subjects, db.chapters, db.outbox, db.meta, async () => {
    await db.subjects.bulkPut(subjects)
    await db.chapters.bulkPut(chapters)
    await db.outbox.bulkAdd(
      [
        ...subjects.map((s) => ({ entity: 'subjects' as const, entityId: s.id, op: 'upsert' as const })),
        ...chapters.map((c) => ({ entity: 'chapters' as const, entityId: c.id, op: 'upsert' as const })),
      ].map((row) => ({ ...row, createdAt: Date.now(), attempts: 0 })),
    )
    await setMeta('seeded', '1')
  })
  return true
}
