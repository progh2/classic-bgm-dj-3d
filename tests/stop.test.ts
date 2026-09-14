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
      title: id,
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
      checkedAt: '2026-09-14',
      reviewStatus: 'confirmed',
    },
  }
}

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
      set({ state: 'loading', loadingTrackId: trackId })
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
    seek() {},
    setVolume() {},
    duck() {},
    unduck() {},
    dispose() {
      listeners.clear()
    },
  }
  return { adapter }
}

describe('감상 마치기', () => {
  it('stop 은 재생을 멈추되 곡목은 남긴다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    expect(s.state.current?.track.id).toBe('a')

    s.stop()
    expect(s.state.playback.state).toBe('idle')
    expect(s.state.queue).toHaveLength(2)
    expect(s.state.problem).toBeNull()
  })

  it('마친 뒤에도 다시 틀 수 있다', async () => {
    const f = fakeAdapter()
    const s = createSession(f.adapter)
    await s.setQueue([entry('a'), entry('b')])
    s.stop()
    await s.playAt(1)
    await vi.waitFor(() => expect(s.state.current?.track.id).toBe('b'))
  })
})
