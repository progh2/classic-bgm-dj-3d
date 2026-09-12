import { describe, expect, it } from 'vitest'
import { buildQueue, DEFAULT_ANSWERS, QUESTIONS, type Answers } from '../src/catalog/select'
import type { CatalogEntry, Era, Focus, Mood } from '../src/catalog/types'

let n = 0
function track(o: {
  era: Era
  moods: Mood[]
  focus: Focus[]
  instruments: string[]
  composer?: string
}): CatalogEntry {
  const id = `t${++n}`
  return {
    track: {
      id,
      workId: `w${id}`,
      recordingId: id,
      title: id,
      composer: o.composer ?? `작곡가${id}`,
      performer: '연주자',
      era: o.era,
      instruments: o.instruments,
      moods: o.moods,
      focus: o.focus,
    },
    source: {
      trackId: id,
      provider: 'file',
      audioUrl: `https://example.invalid/${id}.mp3`,
      mimeType: 'audio/mpeg',
      availability: 'ok',
    },
    rights: {
      targetId: id,
      targetKind: 'track',
      workRights: '',
      recordingRights: '',
      licenseId: 'Public domain',
      licenseUrl: '',
      sourceUrl: '',
      rightsHolder: '',
      modifications: '',
      checkedAt: '2026-09-12',
      reviewStatus: 'confirmed',
    },
  }
}

/** 결과를 확인할 수 있도록 무작위를 고정한다. */
const fixed = () => 0.5

describe('질문', () => {
  it('네 가지를 묻고 각 질문에 기본값이 있다', () => {
    expect(QUESTIONS).toHaveLength(4)
    for (const q of QUESTIONS) {
      const ids = q.options.map((o) => o.id)
      expect(ids).toContain(DEFAULT_ANSWERS[q.id])
    }
  })
})

describe('buildQueue', () => {
  const calmBg = track({ era: 'baroque', moods: ['calm'], focus: ['background'], instruments: ['piano'] })
  const grandFore = track({ era: 'romantic', moods: ['grand'], focus: ['foreground'], instruments: ['orchestra'] })
  const playfulBg = track({ era: 'classical', moods: ['playful'], focus: ['background'], instruments: ['string quartet'] })
  const catalog = [calmBg, grandFore, playfulBg]

  it('존재감 답변에 맞는 곡을 앞세운다', () => {
    const q = buildQueue({ ...DEFAULT_ANSWERS, presence: 'bg' }, catalog, { size: 2, random: fixed })
    expect(q.entries.map((e) => e.track.id)).not.toContain(grandFore.track.id)
  })

  it('조건에 맞는 곡이 모자라면 풀어서 채우고 그 사실을 알린다', () => {
    const only = [grandFore]
    const q = buildQueue({ ...DEFAULT_ANSWERS, presence: 'bg' }, only, { size: 2, random: fixed })
    expect(q.entries).toHaveLength(1)
    expect(q.relaxed).toBe(true)
    expect(q.summary).toContain('결이 가까운 곡')
  })

  it('존재감만 고르면 그 조건의 곡만 나온다', () => {
    const q = buildQueue({ ...DEFAULT_ANSWERS, presence: 'bg' }, catalog, { size: 2, random: fixed })
    for (const e of q.entries) expect(e.track.focus).toContain('background')
  })

  it('고른 편성으로 먼저 거른다', () => {
    const many = [
      calmBg,
      grandFore,
      playfulBg,
      track({ era: 'baroque', moods: ['calm'], focus: ['background'], instruments: ['piano'] }),
      track({ era: 'romantic', moods: ['calm'], focus: ['background'], instruments: ['piano'] }),
      track({ era: 'classical', moods: ['bright'], focus: ['foreground'], instruments: ['piano'] }),
      track({ era: 'romantic', moods: ['grand'], focus: ['foreground'], instruments: ['piano'] }),
    ]
    const answers: Answers = { mood: 'hushed', era: 'any', instrument: 'keys', presence: 'mid' }
    const q = buildQueue(answers, many, { size: 4, random: fixed })
    expect(q.entries.length).toBeGreaterThan(0)
    for (const e of q.entries) expect(e.track.instruments).toContain('piano')
  })

  it('고른 편성의 곡이 모자라면 풀되 그 사실을 알린다', () => {
    const answers: Answers = { mood: 'hushed', era: 'any', instrument: 'quartet', presence: 'mid' }
    const q = buildQueue(answers, catalog, { size: 3, random: fixed })
    expect(q.entries.length).toBeGreaterThan(1)
    expect(q.relaxed).toBe(true)
    expect(q.summary).toContain('결이 가까운 곡')
  })

  it('최근 들은 곡은 되도록 뺀다', () => {
    const q = buildQueue({ ...DEFAULT_ANSWERS, presence: 'mid' }, catalog, {
      size: 2,
      exclude: [calmBg.track.id],
      random: fixed,
    })
    expect(q.entries.map((e) => e.track.id)).not.toContain(calmBg.track.id)
  })

  it('후보가 모자라면 최근 곡이라도 다시 넣는다', () => {
    const q = buildQueue({ ...DEFAULT_ANSWERS, presence: 'mid' }, catalog, {
      size: 3,
      exclude: catalog.map((e) => e.track.id),
      random: fixed,
    })
    expect(q.entries).toHaveLength(3)
  })

  it('같은 작곡가를 연달아 두지 않는다', () => {
    const many = [
      track({ era: 'baroque', moods: ['calm'], focus: ['background'], instruments: ['piano'], composer: '바흐' }),
      track({ era: 'baroque', moods: ['calm'], focus: ['background'], instruments: ['piano'], composer: '바흐' }),
      track({ era: 'baroque', moods: ['calm'], focus: ['background'], instruments: ['piano'], composer: '바흐' }),
      track({ era: 'romantic', moods: ['calm'], focus: ['background'], instruments: ['piano'], composer: '슈베르트' }),
      track({ era: 'romantic', moods: ['calm'], focus: ['background'], instruments: ['piano'], composer: '슈베르트' }),
    ]
    const q = buildQueue(DEFAULT_ANSWERS, many, { size: 4, random: fixed })
    const composers = q.entries.map((e) => e.track.composer)
    const backToBack = composers.filter((c, i) => i > 0 && c === composers[i - 1]).length
    // 두 작곡가뿐이라 완전히 번갈아 놓을 수 있다.
    expect(backToBack).toBe(0)
  })

  it('빈 카탈로그에서도 무너지지 않는다', () => {
    const q = buildQueue(DEFAULT_ANSWERS, [], { random: fixed })
    expect(q.entries).toHaveLength(0)
  })
})
