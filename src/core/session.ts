import type { CatalogEntry } from '../catalog/types'
import type { PlaybackAdapter, PlaybackStatus } from '../playback/adapter'

/**
 * 한 번의 감상. 곡목과 지금 듣는 자리를 들고 있고, 재생 엔진과 화면을 잇는다.
 *
 * 재생이 실제로 시작된 시점을 기준으로 '현재 곡'을 정한다(어댑터가 판단한다).
 * 곡이 연달아 실패하면 무한히 건너뛰지 않고 멈춘다.
 */

/** 연속 실패가 이 수에 이르면 멈추고 사용자에게 넘긴다. */
const MAX_CONSECUTIVE_FAILURES = 3
/** 되도록 다시 틀지 않을 최근 곡 수. */
const RECENT_MEMORY = 20

export interface SessionState {
  queue: CatalogEntry[]
  index: number
  /** 재생이 확인된 곡. 준비 중에는 이전 곡이 남아 있다. */
  current: CatalogEntry | null
  playback: PlaybackStatus
  /** 연속 실패로 멈춘 상태. 사용자가 다시 시작해야 한다. */
  halted: boolean
  /** 마지막으로 알린 문제. 없으면 null. */
  problem: string | null
}

export interface Session {
  readonly state: SessionState
  subscribe(listener: (s: SessionState) => void): () => void
  setQueue(entries: CatalogEntry[], startIndex?: number): Promise<void>
  playAt(index: number): Promise<void>
  /** 목록에 없는 곡을 골라 지금 튼다. 자동 큐는 그대로 이어진다. */
  playEntry(entry: CatalogEntry): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  toggle(): Promise<void>
  seek(sec: number): void
  setVolume(v: number): void
  /** 멈춘 상태를 풀고 현재 곡부터 다시 시도한다. */
  resume(): Promise<void>
  /** 감상을 마친다. 곡목은 남기고 재생만 멈춘다. */
  stop(): void
  recentIds(): readonly string[]
  dispose(): void
}

export interface SessionOptions {
  /** 큐가 끝나갈 때 다음 묶음을 만들어 이어 붙인다. 없으면 큐가 끝나면 멈춘다. */
  refill?: (recent: readonly string[]) => CatalogEntry[]
  /** 곡이 바뀔 때마다 알린다. 책자와 집사가 따라온다. */
  onTrackChange?: (entry: CatalogEntry | null) => void
}

export function createSession(adapter: PlaybackAdapter, options: SessionOptions = {}): Session {
  const listeners = new Set<(s: SessionState) => void>()
  const recent: string[] = []
  let failures = 0
  /** 재생 요청마다 번호를 매겨, 지난 요청의 뒤늦은 처리로 곡이 바뀌지 않게 한다. */
  let requestId = 0
  let lastAnnounced: string | null = null

  let state: SessionState = {
    queue: [],
    index: -1,
    current: null,
    playback: adapter.status,
    halted: false,
    problem: null,
  }

  const emit = (patch: Partial<SessionState>): void => {
    state = { ...state, ...patch }
    for (const l of listeners) l(state)
  }

  const unsubscribeAdapter = adapter.subscribe((playback) => {
    const current = playback.trackId
      ? (state.queue.find((e) => e.track.id === playback.trackId) ?? state.current)
      : state.current
    emit({ playback, current })

    if (current && current.track.id !== lastAnnounced) {
      lastAnnounced = current.track.id
      remember(current.track.id)
      failures = 0
      options.onTrackChange?.(current)
    }

    if (playback.state === 'ended') void advance(1)
    if (playback.state === 'error') void handleFailure()
  })

  function remember(id: string): void {
    const at = recent.indexOf(id)
    if (at >= 0) recent.splice(at, 1)
    recent.push(id)
    while (recent.length > RECENT_MEMORY) recent.shift()
  }

  async function handleFailure(): Promise<void> {
    failures += 1
    const failed = state.queue[state.index]
    const name = failed ? failed.track.title : '이 곡'
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      emit({
        halted: true,
        problem: `${name}을 포함해 ${failures}곡을 연달아 불러오지 못했습니다. 잠시 뒤 다시 시도해 주십시오.`,
      })
      return
    }
    emit({ problem: `${name}을 불러오지 못해 다음 곡으로 넘어갑니다.` })
    await advance(1)
  }

  async function start(index: number): Promise<void> {
    const entry = state.queue[index]
    if (!entry) return
    const my = ++requestId
    emit({ index, halted: false })
    await adapter.load(entry.track.id, entry.source.audioUrl, true)
    if (my !== requestId) return
  }

  async function advance(step: number): Promise<void> {
    if (state.halted) return
    const nextIndex = state.index + step

    if (nextIndex >= state.queue.length) {
      const more = options.refill?.(recent) ?? []
      if (more.length === 0) {
        emit({ problem: '준비한 곡을 모두 들으셨습니다.' })
        adapter.stop()
        return
      }
      emit({ queue: [...state.queue, ...more] })
      await start(nextIndex)
      return
    }
    if (nextIndex < 0) return
    await start(nextIndex)
  }

  return {
    get state() {
      return state
    },

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async setQueue(entries, startIndex = 0) {
      failures = 0
      emit({ queue: entries, index: -1, halted: false, problem: null })
      if (entries.length > 0) await start(startIndex)
    },

    async playAt(index) {
      failures = 0
      emit({ problem: null })
      await start(index)
    },

    async playEntry(entry) {
      // 큐에 없는 곡은 지금 자리 바로 뒤에 끼워 넣는다. 이어지는 자동 큐는 그대로다.
      const at = state.queue.findIndex((e) => e.track.id === entry.track.id)
      if (at >= 0) {
        await this.playAt(at)
        return
      }
      const insertAt = Math.max(0, state.index + 1)
      const queue = [...state.queue]
      queue.splice(insertAt, 0, entry)
      emit({ queue })
      await this.playAt(insertAt)
    },

    async next() {
      failures = 0
      emit({ problem: null })
      await advance(1)
    },

    async previous() {
      failures = 0
      emit({ problem: null })
      // 곡이 한참 진행됐으면 처음으로 되돌리는 쪽이 자연스럽다.
      if (state.playback.currentTimeSec > 4) {
        adapter.seek(0)
        return
      }
      await advance(-1)
    },

    async toggle() {
      if (state.playback.state === 'playing') adapter.pause()
      else await adapter.play()
    },

    seek(sec) {
      adapter.seek(sec)
    },

    setVolume(v) {
      adapter.setVolume(v)
    },

    async resume() {
      failures = 0
      emit({ halted: false, problem: null })
      await start(state.index >= 0 ? state.index : 0)
    },

    stop() {
      adapter.stop()
      emit({ problem: null })
    },

    recentIds() {
      return recent
    },

    dispose() {
      requestId++
      unsubscribeAdapter()
      listeners.clear()
      adapter.dispose()
    },
  }
}
