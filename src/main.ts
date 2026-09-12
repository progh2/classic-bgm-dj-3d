import type { Butler } from './butler/butler'
import { LINES } from './butler/lines'
import { createSpeech } from './butler/speech'
import { CATALOG, formatTime } from './catalog/catalog'
import { buildQueue, DEFAULT_ANSWERS, type Answers } from './catalog/select'
import { createSession, type Session, type SessionState } from './core/session'
import { AudioFileAdapter } from './playback/audioFileAdapter'
import { createSalon, WebGLUnavailableError, type Salon } from './scene/salon'
import { createPlayerUI } from './ui/player'
import { createAskPanel } from './ui/questions'

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`화면 요소를 찾을 수 없습니다: ${id}`)
  return node as T
}

const sceneHost = el('scene')
const gate = el('gate')
const hud = el('hud')
const subtitleBox = el('subtitle')
const subtitleText = el('subtitle-text')
const status = el('butler-status')

let salon: Salon | null = null
let butler: Butler | null = null
let frame = 0
let lastMs = 0

const speech = createSpeech({
  onSubtitle: (text) => {
    subtitleText.textContent = text ?? ''
    subtitleBox.toggleAttribute('hidden', text === null)
  },
  onTalking: (on) => {
    butler?.setTalking(on)
    butler?.setPose(on ? 'speak' : listening ? 'listen' : 'idle')
  },
})

/** 음악이 흐르는 동안에는 집사가 조용히 선다. */
let listening = false

const say = (text: string): void => {
  void speech.say(text)
}

const adapter = new AudioFileAdapter()
const session: Session = createSession(adapter, {
  // 큐가 끝나면 마지막 답변으로 다음 묶음을 만들어 이어 붙인다.
  refill: (recent) => buildQueue(lastAnswers, CATALOG, { size: 12, exclude: recent }).entries,
  onTrackChange: (entry) => {
    if (!entry) return
    listening = true
    butler?.setPose('listen')
  },
})

let lastAnswers: Answers = DEFAULT_ANSWERS

const player = createPlayerUI({
  root: el('player'),
  titleEl: el('now-title'),
  metaEl: el('now-meta'),
  announceEl: el('now-announce'),
  timeEl: el('now-time'),
  durationEl: el('now-duration'),
  seekEl: el<HTMLInputElement>('seek'),
  playBtn: el<HTMLButtonElement>('play'),
  prevBtn: el<HTMLButtonElement>('prev'),
  nextBtn: el<HTMLButtonElement>('next'),
  volumeEl: el<HTMLInputElement>('volume'),
  problemEl: el('problem'),
  onToggle: () => {
    // 연속 실패로 멈춘 뒤의 재생 단추는 '다시 시도'다.
    if (session.state.halted) void session.resume()
    else void session.toggle()
  },
  onPrev: () => void session.previous(),
  onNext: () => void session.next(),
  onSeek: (frac) => {
    const d = session.state.playback.durationSec
    if (d) session.seek(frac * d)
  },
  onVolume: (v) => {
    session.setVolume(v)
    localStorage.setItem('salon.volume', String(v))
  },
})

session.subscribe((state) => {
  player.render(state)
  updateScene(state)
})

/** 안내판과 재생기에 지금 상태를 옮긴다. */
function updateScene(state: SessionState): void {
  if (!salon) return
  const { playback, current } = state
  const playing = playback.state === 'playing'
  const duration = playback.durationSec
  const progress = duration ? playback.currentTimeSec / duration : null

  salon.screen.set({
    title: current
      ? current.track.title
      : playback.state === 'loading'
        ? '곡을 준비하고 있습니다'
        : '세바스티안의 음악 응접실',
    subtitle: current
      ? `${current.track.composer} · ${current.track.performer}`
      : '취향을 고르시거나 제게 맡기십시오.',
    progress,
    elapsed: formatTime(current ? playback.currentTimeSec : null),
    duration: formatTime(duration),
    notice:
      playback.state === 'blocked'
        ? '브라우저가 자동 재생을 막았습니다. 아래 재생 단추를 눌러 주십시오.'
        : (state.problem ?? ''),
    playing,
  })

  salon.turntable.set({
    spinning: playing,
    armDown: current !== null && playback.state !== 'idle' && playback.state !== 'ended',
    progress: progress ?? 0,
  })
}

const ask = createAskPanel({
  root: el('ask'),
  stepEl: el('ask-step'),
  questionEl: el('ask-question'),
  hintEl: el('ask-hint'),
  optionsEl: el('ask-options'),
  backBtn: el<HTMLButtonElement>('ask-back'),
  skipBtn: el<HTMLButtonElement>('ask-skip'),
  defaults: DEFAULT_ANSWERS,
  onAsk: (text) => {
    listening = false
    butler?.setPose('speak')
    say(text)
  },
  onDone: (answers) => void begin(answers),
})

async function begin(answers: Answers): Promise<void> {
  lastAnswers = answers
  const queue = buildQueue(answers, CATALOG, { size: 20, exclude: session.recentIds() })
  if (queue.entries.length === 0) {
    say('죄송합니다. 지금 틀어 드릴 수 있는 곡이 없습니다.')
    return
  }
  butler?.setPose('present')
  say(queue.summary)
  player.show()
  await session.setQueue(queue.entries)
}

function startScene(): void {
  if (salon) return
  try {
    salon = createSalon(sceneHost)
  } catch (err) {
    if (err instanceof WebGLUnavailableError) {
      // 단계 6에서 2D 응접실로 대체한다. 그때까지는 사실대로 알리고 음악은 계속 쓴다.
      sceneHost.removeAttribute('aria-hidden')
      sceneHost.innerHTML =
        '<p class="fallback">이 기기에서는 3D 응접실을 열 수 없습니다. ' +
        '음악과 선곡은 아래 조작부로 그대로 이용하실 수 있습니다.</p>'
      return
    }
    throw err
  }

  const loop = (t: number): void => {
    const delta = lastMs === 0 ? 0.016 : Math.min(0.1, (t - lastMs) / 1000)
    lastMs = t
    butler?.tick(t, delta)
    salon?.tick(t, delta)
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
  window.addEventListener('resize', () => salon?.resize())
}

/** 환경광을 입힌다. 실패해도 조명만으로 장면은 보인다. */
async function lightRoom(): Promise<void> {
  if (!salon) return
  try {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js')
    const hdr = await new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}hdri/ballroom_1k.hdr`)
    salon.applyEnvironment(hdr)
  } catch (err) {
    console.warn('환경광을 불러오지 못했습니다', err)
  }
}

async function dressRoom(): Promise<void> {
  if (!salon) return
  // 바닥·벽·판벽의 결. 실패해도 단색으로 보인다.
  const textures = `${import.meta.env.BASE_URL}textures/`
  void salon.room
    .applyTextures(textures)
    .catch((err: unknown) => console.warn('방의 결을 불러오지 못했습니다', err))
  void salon.screen
    .applyTextures(textures)
    .catch((err: unknown) => console.warn('안내판 액자 결을 불러오지 못했습니다', err))
  try {
    const { loadTable } = await import('./scene/table')
    const table = await loadTable(`${import.meta.env.BASE_URL}props/classic-console/ClassicConsole_01_1k.gltf`)
    salon.add(table.root)
    salon.removePlaceholderTable()
  } catch (err) {
    console.warn('콘솔 테이블을 불러오지 못했습니다', err)
  }
}

/**
 * 발걸음 소리. 겹쳐 울려야 하므로 요소를 돌려 쓰고, 걸음마다 세기를 조금씩
 * 달리해 기계음처럼 들리지 않게 한다.
 */
const footsteps: HTMLAudioElement[] = []
let footstepAt = 0

function playFootstep(): void {
  try {
    if (footsteps.length === 0) {
      for (let i = 0; i < 3; i++) {
        const a = new Audio(`${import.meta.env.BASE_URL}audio/step.ogg`)
        a.preload = 'auto'
        footsteps.push(a)
      }
    }
    const a = footsteps[footstepAt % footsteps.length]
    footstepAt += 1
    if (!a) return
    a.currentTime = 0
    a.volume = 0.16 + Math.random() * 0.06
    void a.play().catch(() => {
      // 첫 조작 전이면 브라우저가 막는다. 발소리는 없어도 되는 소리다.
    })
  } catch {
    // 소리가 없어도 입장은 그대로 진행한다.
  }
}

async function bringInButler(): Promise<void> {
  if (!salon) return
  status.textContent = '집사가 오는 중입니다…'
  try {
    // 입장 화면이 먼저 뜨도록 three-vrm 과 집사 코드는 이때 받는다.
    const { loadButler } = await import('./butler/butler')
    butler = await loadButler(`${import.meta.env.BASE_URL}models/sebastian.vrm`, (frac) => {
      status.textContent = `집사가 오는 중입니다… ${Math.round(frac * 100)}%`
    })
  } catch (err) {
    // 집사가 없어도 음악은 그대로 쓸 수 있어야 한다.
    console.warn('집사 모델을 불러오지 못했습니다', err)
    status.textContent = '집사가 자리를 비웠습니다. 음악은 그대로 이용하실 수 있습니다.'
    say(LINES.greetQuiet)
    return
  }

  if (import.meta.env.DEV) {
    // 자세를 화면에서 맞춰 보기 위한 통로.
    ;(window as unknown as Record<string, unknown>).__butler = butler
  }
  // 오른쪽 문에서 걸어 들어온다. 이미 서 있는 것보다 사람이 온 느낌이 난다.
  butler.root.position.set(2.35, 0, -1.45)
  butler.lookAt(salon.viewerAnchor)
  salon.add(butler.root)
  status.textContent = ''

  await butler.walkTo(0.06, -1.05, playFootstep)
  butler.bow()
  say(speech.enabled ? LINES.greetVoice : LINES.greetQuiet)
  if (speech.enabled && !speech.hasKoreanVoice()) status.textContent = LINES.noVoice
}

function enter(withVoice: boolean): void {
  speech.enabled = withVoice
  sessionStorage.setItem('salon.voice', withVoice ? 'on' : 'off')
  gate.setAttribute('hidden', '')
  hud.removeAttribute('hidden')
  updateVoiceToggle()

  // 기기에 저장해 둔 음량을 되살린다. 소리는 이 조작으로 이미 허락받았다.
  const saved = Number(localStorage.getItem('salon.volume'))
  const volume = Number.isFinite(saved) && saved > 0 ? saved : 0.8
  session.setVolume(volume)
  el<HTMLInputElement>('volume').value = String(Math.round(volume * 100))

  startScene()
  updateScene(session.state)
  void lightRoom()
  void dressRoom()
  void bringInButler()
}

function updateVoiceToggle(): void {
  const btn = el('voice-toggle')
  btn.textContent = speech.enabled ? '음성 끄기' : '음성 켜기'
  btn.setAttribute('aria-pressed', String(speech.enabled))
}

el('enter-voice').addEventListener('click', () => enter(true))
el('enter-quiet').addEventListener('click', () => enter(false))

el('voice-toggle').addEventListener('click', () => {
  speech.enabled = !speech.enabled
  if (!speech.enabled) speech.cancel()
  updateVoiceToggle()
})

el('repeat-greeting').addEventListener('click', () => {
  butler?.bow()
  say(speech.enabled ? LINES.greetVoice : LINES.greetQuiet)
})

el('start-ask').addEventListener('click', () => ask.start())
el('start-auto').addEventListener('click', () => void begin(DEFAULT_ANSWERS))

// 키보드만으로 감상할 수 있게 한다. 입력창 안에서는 동작하지 않는다.
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return
  if (gate.hasAttribute('hidden') === false) return
  if (e.key === ' ') {
    e.preventDefault()
    void session.toggle()
  } else if (e.key === 'ArrowRight' && e.altKey) {
    void session.next()
  } else if (e.key === 'ArrowLeft' && e.altKey) {
    void session.previous()
  }
})

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frame)
  speech.dispose()
  session.dispose()
  butler?.dispose()
  butler = null
  salon?.dispose()
  salon = null
})
