import type { CatalogEntry, Era, Focus, Mood } from './types'

/**
 * 집사의 네 가지 질문으로 곡목을 짠다.
 *
 * 시대와 편성은 '거르기'가 아니라 '가점'이다. 33곡뿐인 카탈로그에서 조건으로
 * 걸러 버리면 서너 곡만 남는다. 그러느니 앞에 세우고 나머지를 뒤에 붙인다.
 */

export interface Answers {
  mood: MoodChoice
  era: EraChoice
  instrument: InstrumentChoice
  presence: PresenceChoice
}

export type MoodChoice = 'grand' | 'hushed' | 'lyrical' | 'bright'
export type EraChoice = 'baroque' | 'classical' | 'romantic' | 'any'
export type InstrumentChoice = 'keys' | 'quartet' | 'orchestra' | 'any'
export type PresenceChoice = 'bg' | 'mid' | 'fore'

export interface Question {
  id: keyof Answers
  ask: string
  hint: string
  options: { id: string; label: string; blurb: string }[]
}

export const QUESTIONS: readonly Question[] = [
  {
    id: 'mood',
    ask: '오늘은 어떤 결로 모실까요?',
    hint: '방의 온도를 여기서 정합니다.',
    options: [
      { id: 'grand', label: '장대하게', blurb: '총주가 밀고 나가도록' },
      { id: 'hushed', label: '조용하게', blurb: '있는 줄 모르게 깔아두도록' },
      { id: 'lyrical', label: '서정적으로', blurb: '노래하듯 이어지도록' },
      { id: 'bright', label: '경쾌하게', blurb: '발끝이 가벼워지도록' },
    ],
  },
  {
    id: 'era',
    ask: '어느 시대의 손끝을 앞에 두시겠습니까?',
    hint: '고르지 않으셔도 됩니다. 제가 섞어 올리지요.',
    options: [
      { id: 'baroque', label: '바로크', blurb: '규칙적인 짜임' },
      { id: 'classical', label: '고전', blurb: '균형과 명료함' },
      { id: 'romantic', label: '낭만', blurb: '노래하는 관현악' },
      { id: 'any', label: '가리지 않겠습니다', blurb: '시대는 제게 맡기시고' },
    ],
  },
  {
    id: 'instrument',
    ask: '어느 편성을 앞에 세워 드릴까요?',
    hint: '앞에 세울 뿐, 그것만 틀지는 않습니다.',
    options: [
      { id: 'keys', label: '피아노', blurb: '건반 하나로' },
      { id: 'quartet', label: '현악 4중주', blurb: '네 대의 대화' },
      { id: 'orchestra', label: '관현악', blurb: '무대를 가득 채우는' },
      { id: 'any', label: '가리지 않겠습니다', blurb: '편성은 제게 맡기시고' },
    ],
  },
  {
    id: 'presence',
    ask: '소리는 어느 정도 존재감이면 좋겠습니까?',
    hint: '일을 방해하는 정도를 여기서 조절합니다.',
    options: [
      { id: 'bg', label: '배경으로 조용히', blurb: '있는 줄도 모르게' },
      { id: 'mid', label: '적당히', blurb: '가끔 귀에 걸리게' },
      { id: 'fore', label: '감상하듯', blurb: '오늘은 음악을 듣고 싶습니다' },
    ],
  },
]

/** 질답 없이 바로 트는 기본값 — "맡길게" */
export const DEFAULT_ANSWERS: Answers = {
  mood: 'hushed',
  era: 'any',
  instrument: 'any',
  presence: 'bg',
}

/** 답변한 결 → 카탈로그 분위기마다의 가중치 */
const MOOD_PREF: Record<MoodChoice, Partial<Record<Mood, number>>> = {
  grand: { grand: 3, tense: 1.8, bright: 1.4, playful: 0.6, calm: 0.4 },
  hushed: { calm: 3, melancholy: 1.8, playful: 0.5, bright: 0.5, grand: 0.3 },
  lyrical: { melancholy: 3, calm: 2, grand: 1, bright: 0.6 },
  bright: { bright: 3, playful: 2.4, calm: 0.8, grand: 0.6 },
}

const ERA_GROUP: Record<EraChoice, Era[] | null> = {
  baroque: ['baroque'],
  classical: ['classical'],
  romantic: ['romantic'],
  any: null,
}

const INSTRUMENT_GROUP: Record<InstrumentChoice, string[] | null> = {
  keys: ['piano'],
  quartet: ['string quartet'],
  orchestra: ['orchestra'],
  any: null,
}

/** 존재감 → 곡이 가져야 할 focus. 'mid' 는 가리지 않는다. */
const PRESENCE_FOCUS: Record<PresenceChoice, Focus | null> = {
  bg: 'background',
  mid: null,
  fore: 'foreground',
}

const ERA_WORD: Record<EraChoice, string> = {
  baroque: '바로크',
  classical: '고전',
  romantic: '낭만',
  any: '여러 시대',
}
const INSTRUMENT_WORD: Record<InstrumentChoice, string> = {
  keys: '피아노',
  quartet: '현악 4중주',
  orchestra: '관현악',
  any: '여러 편성',
}
const MOOD_WORD: Record<MoodChoice, string> = {
  grand: '장대한',
  hushed: '조용한',
  lyrical: '서정적인',
  bright: '경쾌한',
}

export interface Queue {
  entries: CatalogEntry[]
  /** 집사가 결과를 아뢰는 말 */
  summary: string
  /** 조건을 풀어서 채웠는가 */
  relaxed: boolean
}

export interface BuildOptions {
  size?: number
  /** 되도록 빼고 싶은 최근 재생 곡. 후보가 모자라면 다시 넣는다. */
  exclude?: readonly string[]
  random?: () => number
}

export function buildQueue(
  answers: Answers,
  catalog: readonly CatalogEntry[],
  options: BuildOptions = {},
): Queue {
  const { size = 20, exclude = [], random = Math.random } = options
  const weights = MOOD_PREF[answers.mood]
  const eras = ERA_GROUP[answers.era]
  const instruments = INSTRUMENT_GROUP[answers.instrument]
  const wantFocus = PRESENCE_FOCUS[answers.presence]
  const excluded = new Set(exclude)

  const score = (e: CatalogEntry): number => {
    // 여러 분위기를 가진 곡은 가장 높은 가중치를 쓴다.
    let best = 0
    for (const m of e.track.moods) best = Math.max(best, weights[m] ?? 0)
    let s = best * 2 + random() * 1.3
    if (eras?.includes(e.track.era)) s += 3
    if (instruments?.some((i) => e.track.instruments.includes(i))) s += 3
    return s
  }

  const gather = (useFocus: Focus | null, dropExcluded: boolean): CatalogEntry[] => {
    const pool = catalog.filter((e) => {
      if (useFocus && !e.track.focus.includes(useFocus)) return false
      if (dropExcluded && excluded.has(e.track.id)) return false
      return true
    })
    return pool
      .map((e) => ({ e, s: score(e) }))
      .sort((a, b) => b.s - a.s)
      .map(({ e }) => e)
  }

  // 조건이 빡세서 곡이 모자라면 한 단계씩 푼다.
  let relaxed = false
  let ranked = gather(wantFocus, true)
  if (ranked.length < size && excluded.size > 0) {
    ranked = gather(wantFocus, false)
  }
  if (ranked.length < size && wantFocus !== null) {
    ranked = gather(null, false)
    relaxed = true
  }

  // 상위권을 넉넉히 남긴 뒤 작곡가를 흩뿌린다 — 1위부터 줄 세운 티가 나지 않게.
  const shortlist = ranked.slice(0, Math.max(size, Math.round(size * 2.2)))
  const entries = spreadByComposer(shortlist, random).slice(0, size)

  return { entries, summary: describe(answers, entries, relaxed), relaxed }
}

/** 같은 작곡가가 연달아 나오지 않게 흩뿌린다. */
function spreadByComposer(entries: CatalogEntry[], random: () => number): CatalogEntry[] {
  const byComposer = new Map<string, CatalogEntry[]>()
  for (const e of entries) {
    const key = e.track.composer
    const list = byComposer.get(key)
    if (list) list.push(e)
    else byComposer.set(key, [e])
  }
  const queues = shuffle([...byComposer.values()], random)
  const out: CatalogEntry[] = []
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift()
      if (next) out.push(next)
    }
  }
  return out
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const ai = a[i] as T
    a[i] = a[j] as T
    a[j] = ai
  }
  return a
}

function describe(answers: Answers, entries: CatalogEntry[], relaxed: boolean): string {
  const lines = [
    `${ERA_WORD[answers.era]}에서 ${MOOD_WORD[answers.mood]} 결로 ${entries.length}곡 골라 두었어요.`,
  ]
  if (answers.instrument !== 'any') {
    lines.push(`${INSTRUMENT_WORD[answers.instrument]}을 앞에 세웠어요.`)
  }
  if (answers.presence === 'bg') lines.push('있는 줄 모르게 깔아 둘게요.')
  else if (answers.presence === 'fore') lines.push('오늘은 음악에 귀를 내어 주세요.')
  if (relaxed) lines.push('원하신 조건이 좁아, 결이 가까운 곡을 몇 장 더 얹었어요.')
  return lines.join(' ')
}
