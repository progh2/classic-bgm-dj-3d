import { describe, expect, it, vi } from 'vitest'
import { createSession } from '../src/core/session'
import type { PlaybackAdapter, PlaybackStatus } from '../src/playback/adapter'
import type { CatalogEntry } from '../src/catalog/types'

function entry(id: string): CatalogEntry {
  return {
    track: {
      id,
      workId: id,
      recordingId: id,
      title: `${id} 제목`,
      composer: '작곡가',
      performer: '연주자',
      era: 'baroque',
      instruments: ['piano'],
      moods: ['calm'],
      focus: ['background'],
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

/** 재생 성공/실패를 시험에서 정하는 가짜 엔진. */
function fakeAdapter() {
  const listeners = new Set<(s: PlaybackStatus) => void>()
  let status: PlaybackStatus = {
    state: 'idle',
    trackId: null,
    loadingTrackId: null,
    currentTimeSec: 0,
    durationSec: null,
    volume: 0.8,
  }
  const failing = new Set<string>()
  const loads: string[] = []

  const set = (patch: Partial<PlaybackStatus>): void => {
    status = { ...status, ...patch }
    for (const l of listeners) l(status)
  }

  const adapter: PlaybackAdapter = {
    get status() {
      return status
    },
    subscribe(l) {
      listeners.add(l)
      l(status)
      return () => listeners.delete(l)
    },
    async load(trackId, _url, autoplay) {
      loads.push(trackId)
      set({ state: 'loading', loadingTrackId: trackId })
      if (failing.has(trackId)) {
        set({ state: 'error', errorKind: 'notfound' })
        return
      }
      if (autoplay) set({ state: 'playing', trackId, loadingTrackId: null, durationSec: 100 })
    },
    async play() {
      set({ state: 'playing' })
    },
    pause() {
      set({ state: 'paused' })
    },
    stop() {
      set({ state: 'idle', trackId: null, loadingTrackId: null })
    },
    seek(sec) {
      set({ currentTimeSec: sec })
    },
    setVolume(v) {
      set({ volume: v })
    },
    duck() {},
    unduck() {},
    dispose() {
      listeners.clear()
    },
  }

  return { adapter, failing, loads, end: () => set({ state: 'ended' }), set }
}

describe('createSession', () => {
  it('큐를 받으면 첫 곡을 틀고 현재 곡을 확정한다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    expect(s.state.current?.track.id).toBe('a')
    expect(s.state.index).toBe(0)
  })

  it('곡이 끝나면 다음 곡으로 넘어간다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    f.end()
    await vi.waitFor(() => expect(s.state.current?.track.id).toBe('b'))
  })

  it('실패한 곡은 건너뛰되 연달아 세 번이면 멈춘다', async () => {
    const f = fakeAdapter()
    f.failing.add('a')
    f.failing.add('b')
    f.failing.add('c')
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b'), entry('c'), entry('d')])
    await vi.waitFor(() => expect(s.state.halted).toBe(true))
    // d 까지 무한히 밀고 가지 않는다.
    expect(f.loads).toEqual(['a', 'b', 'c'])
    expect(s.state.problem).toContain('연달아')
  })

  it('멈춘 뒤 다시 시도하면 같은 자리에서 재개한다', async () => {
    const f = fakeAdapter()
    f.failing.add('a')
    f.failing.add('b')
    f.failing.add('c')
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b'), entry('c')])
    await vi.waitFor(() => expect(s.state.halted).toBe(true))
    f.failing.clear()
    await s.resume()
    expect(s.state.halted).toBe(false)
    expect(s.state.current?.track.id).toBe('c')
  })

  it('큐가 끝나가면 다음 묶음을 이어 붙인다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter, { refill: () => [entry('x')] })
    await s.setQueue([entry('a')])
    await s.next()
    expect(s.state.current?.track.id).toBe('x')
  })

  it('이어 붙일 곡이 없으면 사실대로 알리고 멈춘다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a')])
    await s.next()
    expect(s.state.problem).toContain('모두 들으셨습니다')
  })

  it('재생 중 이전 단추는 4초가 지났으면 곡 처음으로 돌아간다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    await s.playAt(1)
    f.set({ currentTimeSec: 30 })
    await s.previous()
    expect(s.state.current?.track.id).toBe('b')
    expect(s.state.playback.currentTimeSec).toBe(0)
  })

  it('목록에 없는 곡을 고르면 지금 자리 뒤에 끼워 넣는다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    await s.playEntry(entry('z'))
    expect(s.state.queue.map((e) => e.track.id)).toEqual(['a', 'z', 'b'])
    expect(s.state.current?.track.id).toBe('z')
  })

  it('최근 들은 곡을 기억한다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    await s.next()
    expect(s.recentIds()).toEqual(['a', 'b'])
  })
})
