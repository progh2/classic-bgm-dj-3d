import { describe, expect, it, vi } from 'vitest'
import { AudioFileAdapter } from '../src/playback/audioFileAdapter'

/** jsdom 없이도 검증할 수 있게 필요한 부분만 흉내낸 오디오 요소. */
class FakeAudio {
  src = ''
  volume = 1
  currentTime = 0
  duration = Number.NaN
  preload = ''
  error: { code: number } | null = null
  paused = true
  playCalls = 0
  private nextPlay: 'ok' | 'blocked' | 'fail' = 'ok'
  private handlers = new Map<string, Set<() => void>>()

  addEventListener(type: string, fn: () => void): void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(fn)
    this.handlers.set(type, set)
  }
  removeAttribute(): void {}
  load(): void {}
  emit(type: string): void {
    for (const fn of this.handlers.get(type) ?? []) fn()
  }
  failNextPlay(kind: 'blocked' | 'fail'): void {
    this.nextPlay = kind
  }
  async play(): Promise<void> {
    this.playCalls++
    const kind = this.nextPlay
    this.nextPlay = 'ok'
    if (kind === 'blocked') {
      const err = new Error('blocked')
      err.name = 'NotAllowedError'
      Object.setPrototypeOf(err, DOMException.prototype)
      throw err
    }
    if (kind === 'fail') throw new Error('boom')
    // 실제 요소는 play() 의 promise 와 playing 이벤트가 같은 틱에 오지 않는다.
    await Promise.resolve()
    this.paused = false
    this.emit('playing')
  }
  pause(): void {
    this.paused = true
    this.emit('pause')
  }
}

function make(): { a: AudioFileAdapter; el: FakeAudio } {
  const el = new FakeAudio()
  return { a: new AudioFileAdapter(el as unknown as HTMLAudioElement), el }
}

describe('AudioFileAdapter', () => {
  it('재생이 실제로 시작된 뒤에 현재 곡을 확정한다', async () => {
    const { a, el } = make()
    const p = a.load('t1', '/audio/t1.mp3', true)
    expect(a.status.state).toBe('loading')
    expect(a.status.trackId).toBeNull()
    expect(a.status.loadingTrackId).toBe('t1')
    await p
    expect(a.status.state).toBe('playing')
    expect(a.status.trackId).toBe('t1')
    expect(a.status.loadingTrackId).toBeNull()
    expect(el.src).toBe('/audio/t1.mp3')
  })

  it('자동 재생이 막히면 error 가 아니라 blocked 로 구분한다', async () => {
    const { a, el } = make()
    el.failNextPlay('blocked')
    await a.load('t1', '/audio/t1.mp3', true)
    expect(a.status.state).toBe('blocked')
  })

  it('autoplay 가 아니면 ready 까지만 간다', async () => {
    const { a, el } = make()
    await a.load('t1', '/audio/t1.mp3', false)
    expect(a.status.state).toBe('ready')
    expect(el.playCalls).toBe(0)
  })

  it('duck 은 사용자 음량 값을 덮어쓰지 않는다', () => {
    const { a, el } = make()
    a.setVolume(0.6)
    a.duck(0.25)
    expect(el.volume).toBeCloseTo(0.15)
    expect(a.status.volume).toBeCloseTo(0.6)
    a.unduck()
    expect(el.volume).toBeCloseTo(0.6)
  })

  it('메타데이터를 읽기 전에는 길이를 단정하지 않는다', async () => {
    const { a, el } = make()
    await a.load('t1', '/audio/t1.mp3', false)
    expect(a.status.durationSec).toBeNull()
    el.duration = 214.5
    el.emit('loadedmetadata')
    expect(a.status.durationSec).toBeCloseTo(214.5)
  })

  it('탐색은 알려진 길이 안으로 제한한다', async () => {
    const { a, el } = make()
    await a.load('t1', '/audio/t1.mp3', false)
    el.duration = 100
    el.emit('loadedmetadata')
    a.seek(-5)
    expect(el.currentTime).toBe(0)
    a.seek(500)
    expect(el.currentTime).toBe(100)
  })

  it('stop 은 idle 로 되돌리고 준비 중인 곡을 지운다', async () => {
    const { a } = make()
    await a.load('t1', '/audio/t1.mp3', true)
    a.stop()
    expect(a.status.state).toBe('idle')
    expect(a.status.loadingTrackId).toBeNull()
    expect(a.status.currentTimeSec).toBe(0)
  })

  it('구독자는 해지하면 더 이상 통보받지 않는다', () => {
    const { a, el } = make()
    const spy = vi.fn()
    const off = a.subscribe(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    off()
    a.setVolume(0.3)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(el.volume).toBeCloseTo(0.3)
  })
})
