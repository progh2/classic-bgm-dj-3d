/** 재생 엔진 추상화. 책자·집사·추천 로직은 이 인터페이스만 본다. */

export type PlaybackState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'blocked'
  | 'error'

export interface PlaybackStatus {
  state: PlaybackState
  /** 실제로 재생이 확인된 트랙. 준비 중인 트랙은 여기에 넣지 않는다. */
  trackId: string | null
  /** 로딩 중인 트랙 (있으면) */
  loadingTrackId: string | null
  currentTimeSec: number
  /** 메타데이터를 읽기 전에는 null */
  durationSec: number | null
  volume: number
  errorKind?: 'notfound' | 'network' | 'decode' | 'aborted' | 'unknown' | undefined
}

export interface PlaybackAdapter {
  readonly status: PlaybackStatus
  subscribe(listener: (status: PlaybackStatus) => void): () => void
  /** 트랙을 불러오고 재생을 시도한다. 성공하면 state 가 playing 이 된다. */
  load(trackId: string, url: string, autoplay: boolean): Promise<void>
  play(): Promise<void>
  pause(): void
  stop(): void
  seek(sec: number): void
  setVolume(v: number): void
  /** 안내 음성 동안 음량을 낮춘다. 사용자가 바꾼 값은 보존한다. */
  duck(factor: number): void
  unduck(): void
  dispose(): void
}
