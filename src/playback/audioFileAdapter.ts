import type { PlaybackAdapter, PlaybackState, PlaybackStatus } from './adapter'

/**
 * HTMLAudioElement 로 권리 확인된 음원 파일을 재생한다.
 *
 * 빠른 연속 클릭에서 이전 로딩의 늦은 이벤트가 현재 곡을 덮어쓰지 않도록
 * 요청마다 토큰을 발급하고, 토큰이 다르면 이벤트를 버린다.
 */
export class AudioFileAdapter implements PlaybackAdapter {
  private readonly el: HTMLAudioElement
  private listeners = new Set<(s: PlaybackStatus) => void>()
  private token = 0
  /** 사용자가 정한 음량. duck 은 이 값을 건드리지 않는다. */
  private userVolume = 0.8
  private duckFactor = 1
  private st: PlaybackStatus = {
    state: 'idle',
    trackId: null,
    loadingTrackId: null,
    currentTimeSec: 0,
    durationSec: null,
    volume: 0.8,
  }

  constructor(el: HTMLAudioElement = new Audio()) {
    this.el = el
    this.el.preload = 'metadata'
    this.el.volume = this.userVolume
    this.bind()
  }

  get status(): PlaybackStatus {
    return this.st
  }

  subscribe(listener: (s: PlaybackStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.st)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<PlaybackStatus>): void {
    this.st = { ...this.st, ...patch }
    for (const l of this.listeners) l(this.st)
  }

  private bind(): void {
    const el = this.el
    el.addEventListener('loadedmetadata', () => {
      this.set({ durationSec: Number.isFinite(el.duration) ? el.duration : null })
    })
    el.addEventListener('timeupdate', () => {
      this.set({ currentTimeSec: el.currentTime })
    })
    el.addEventListener('playing', () => {
      // 재생이 실제로 시작된 이 시점에 현재 곡을 확정한다.
      this.set({
        state: 'playing',
        trackId: this.st.loadingTrackId ?? this.st.trackId,
        loadingTrackId: null,
      })
    })
    el.addEventListener('pause', () => {
      if (this.st.state === 'playing') this.set({ state: 'paused' })
    })
    el.addEventListener('ended', () => this.set({ state: 'ended' }))
    el.addEventListener('error', () => this.set({ state: 'error', errorKind: mediaError(el) }))
  }

  async load(trackId: string, url: string, autoplay: boolean): Promise<void> {
    const my = ++this.token
    this.set({
      state: 'loading',
      loadingTrackId: trackId,
      currentTimeSec: 0,
      durationSec: null,
      errorKind: undefined,
    })
    this.el.src = url
    this.el.load()
    if (!autoplay) {
      if (my === this.token) this.set({ state: 'ready' })
      return
    }
    await this.tryPlay(my)
  }

  private async tryPlay(my: number): Promise<void> {
    try {
      await this.el.play()
      // playing 이벤트에서 상태를 확정한다. 여기서는 늦은 응답만 걸러낸다.
      if (my !== this.token) this.el.pause()
    } catch (err) {
      if (my !== this.token) return
      // 소리 있는 자동 재생이 사용자 조작 없이 막힌 경우와 실제 오류를 구분한다.
      const blocked = err instanceof DOMException && err.name === 'NotAllowedError'
      this.set(blocked ? { state: 'blocked' } : { state: 'error', errorKind: 'unknown' })
    }
  }

  async play(): Promise<void> {
    await this.tryPlay(this.token)
  }

  pause(): void {
    this.el.pause()
  }

  stop(): void {
    this.token++
    this.el.pause()
    this.el.currentTime = 0
    this.set({ state: 'idle', currentTimeSec: 0, loadingTrackId: null })
  }

  seek(sec: number): void {
    const d = this.st.durationSec
    this.el.currentTime = d === null ? Math.max(0, sec) : Math.min(Math.max(0, sec), d)
  }

  setVolume(v: number): void {
    this.userVolume = clamp01(v)
    this.applyVolume()
  }

  duck(factor: number): void {
    this.duckFactor = clamp01(factor)
    this.applyVolume()
  }

  unduck(): void {
    this.duckFactor = 1
    this.applyVolume()
  }

  private applyVolume(): void {
    this.el.volume = clamp01(this.userVolume * this.duckFactor)
    // 이용자에게 보이는 값은 사용자가 정한 음량이다.
    this.set({ volume: this.userVolume })
  }

  dispose(): void {
    this.token++
    this.el.pause()
    this.el.removeAttribute('src')
    this.listeners.clear()
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function mediaError(el: HTMLAudioElement): NonNullable<PlaybackStatus['errorKind']> {
  switch (el.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'aborted'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network'
    case MediaError.MEDIA_ERR_DECODE:
      return 'decode'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'notfound'
    default:
      return 'unknown'
  }
}

export type { PlaybackState }
