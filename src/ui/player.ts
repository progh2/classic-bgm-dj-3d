import { formatTime } from '../catalog/catalog'
import type { SessionState } from '../core/session'

/** 재생 조작부. 상태를 받아 그리기만 하고, 조작은 콜백으로 넘긴다. */
export interface PlayerUI {
  render(state: SessionState): void
  show(): void
}

export interface PlayerUIOptions {
  root: HTMLElement
  titleEl: HTMLElement
  metaEl: HTMLElement
  timeEl: HTMLElement
  durationEl: HTMLElement
  seekEl: HTMLInputElement
  playBtn: HTMLButtonElement
  prevBtn: HTMLButtonElement
  nextBtn: HTMLButtonElement
  volumeEl: HTMLInputElement
  problemEl: HTMLElement
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (sec: number) => void
  onVolume: (v: number) => void
}

const LABEL: Record<string, string> = {
  idle: '재생',
  loading: '준비 중',
  ready: '재생',
  playing: '일시정지',
  paused: '재생',
  ended: '재생',
  blocked: '재생',
  error: '다시 시도',
}

export function createPlayerUI(o: PlayerUIOptions): PlayerUI {
  /** 사용자가 손잡이를 잡고 있는 동안에는 재생 위치가 밀어내지 않게 한다. */
  let scrubbing = false

  o.playBtn.addEventListener('click', o.onToggle)
  o.prevBtn.addEventListener('click', o.onPrev)
  o.nextBtn.addEventListener('click', o.onNext)
  o.volumeEl.addEventListener('input', () => o.onVolume(Number(o.volumeEl.value) / 100))
  o.seekEl.addEventListener('pointerdown', () => {
    scrubbing = true
  })
  const commitSeek = (): void => {
    scrubbing = false
    const frac = Number(o.seekEl.value) / 1000
    o.onSeek(frac)
  }
  o.seekEl.addEventListener('change', commitSeek)
  o.seekEl.addEventListener('pointerup', commitSeek)

  return {
    show() {
      o.root.removeAttribute('hidden')
    },

    render(state) {
      const { playback, current } = state
      const entry = current

      if (playback.state === 'loading' && !entry) {
        o.titleEl.textContent = '곡을 준비하고 있습니다'
        o.metaEl.textContent = ''
      } else if (entry) {
        o.titleEl.textContent = entry.track.title
        const bits = [entry.track.composer, entry.track.performer]
        if (playback.loadingTrackId) bits.push('다음 곡 준비 중')
        o.metaEl.textContent = bits.join(' · ')
      }

      // 색만으로 상태를 구분하지 않는다. 버튼 글자가 곧 상태다.
      o.playBtn.textContent = LABEL[playback.state] ?? '재생'
      o.playBtn.setAttribute('aria-pressed', String(playback.state === 'playing'))

      const duration = playback.durationSec
      o.timeEl.textContent = formatTime(playback.currentTimeSec)
      o.durationEl.textContent = formatTime(duration)
      o.seekEl.disabled = duration === null
      if (!scrubbing && duration) {
        o.seekEl.value = String(Math.round((playback.currentTimeSec / duration) * 1000))
      }

      if (playback.state === 'blocked') {
        o.problemEl.textContent = '브라우저가 자동 재생을 막았습니다. 재생 단추를 눌러 주십시오.'
      } else if (state.halted) {
        o.problemEl.textContent = `${state.problem ?? ''} 다시 시도하려면 재생 단추를 눌러 주십시오.`
      } else {
        o.problemEl.textContent = state.problem ?? ''
      }
    },
  }
}
