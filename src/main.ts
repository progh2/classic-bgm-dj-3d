import type { Butler } from './butler/butler'
import { LINES } from './butler/lines'
import { createSpeech } from './butler/speech'
import { CATALOG, formatTime } from './catalog/catalog'
import { buildQueue, DEFAULT_ANSWERS, QUESTIONS, type Answers } from './catalog/select'
import { createSession, type SessionState } from './core/session'
import { AudioFileAdapter } from './playback/audioFileAdapter'
import { createSalon, TABLE_TOP, WebGLUnavailableError, type Salon } from './scene/salon'

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`화면 요소를 찾을 수 없습니다: ${id}`)
  return node as T
}

const sceneHost = el('scene')
const status = el('butler-status')
const subtitleText = el('subtitle-text')
const askBox = el('ask')

let salon: Salon | null = null
let butler: Butler | null = null
let frame = 0
let lastMs = 0

/**
 * 소리는 브라우저가 첫 조작 전에 내주지 않는다. 그래서 응접실은 바로 열되,
 * 처음 무언가를 누른 시점을 소리의 출발점으로 삼는다.
 */
let userActed = false
/** 집사가 감상 중인 자세로 서 있는가. */
let listening = false
/** 프로그램북에서 지금 펼쳐 보고 있는 곡. 재생 중인 곡과 다를 수 있다. */
let browsedId: string | null = null
/** 곡목의 첫 줄 */
let listOffset = 0

/** 안내판 아래에 싣는 집사의 말. */
let speechLine: string | null = null

const speech = createSpeech({
  onSubtitle: (text) => {
    subtitleText.textContent = text ?? ''
    speechLine = text
    updateScene(session.state)
  },
  onTalking: (on) => {
    butler?.setTalking(on)
    butler?.setPose(on ? 'speak' : listening ? 'listen' : 'idle')
  },
})

const say = (text: string): void => void speech.say(text)

const adapter = new AudioFileAdapter()
let lastAnswers: Answers = DEFAULT_ANSWERS

const session = createSession(adapter, {
  refill: (recent) => buildQueue(lastAnswers, CATALOG, { size: 12, exclude: recent }).entries,
  onTrackChange: (entry) => {
    listening = true
    butler?.setPose('listen')
    // 다른 곡을 펼쳐 읽는 중이면 억지로 옮기지 않는다. 리본으로만 알린다.
    if (browsedId === null && entry) {
      const at = session.state.queue.findIndex((e) => e.track.id === entry.track.id)
      if (at >= 0) listOffset = Math.max(0, Math.floor(at / 7) * 7)
    }
  },
})

// ---- 화면 낭독기를 위한 감춰진 층 ----

let lastAnnounced = ''

function renderAccessible(state: SessionState): void {
  const entry = state.current
  el('now-title').textContent = entry?.track.title ?? ''
  el('now-meta').textContent = entry ? `${entry.track.composer} · ${entry.track.performer}` : ''
  el('problem').textContent = state.problem ?? ''
  const announce = entry ? `${entry.track.title} — ${entry.track.composer}` : ''
  if (announce !== lastAnnounced) {
    lastAnnounced = announce
    el('now-announce').textContent = announce
  }
  const seek = el<HTMLInputElement>('seek')
  const d = state.playback.durationSec
  seek.disabled = d === null
  if (d) seek.value = String(Math.round((state.playback.currentTimeSec / d) * 1000))
}

// ---- 3D 안의 조작부와 안내판 ----

/** 결마다의 빛깔. 조작부 글자와 테두리에 쓴다. */
const MOOD_COLOUR: Record<string, string> = {
  calm: '#8fd6c4',
  bright: '#f2c14e',
  melancholy: '#9aa8e6',
  grand: '#e0c76a',
  playful: '#f0a3ac',
  tense: '#e08a63',
}

function moodColour(moods: readonly string[]): string {
  for (const m of moods) {
    const c = MOOD_COLOUR[m]
    if (c) return c
  }
  return '#e0c76a'
}

const PLAY_LABEL: Record<string, string> = {
  idle: '재생',
  loading: '준비 중',
  ready: '재생',
  playing: '일시정지',
  paused: '재생',
  ended: '재생',
  blocked: '재생',
  error: '다시 시도',
}

function updateScene(state: SessionState): void {
  const { playback, current } = state
  const playing = playback.state === 'playing'
  const duration = playback.durationSec
  const progress = duration ? playback.currentTimeSec / duration : null

  const notice =
    playback.state === 'blocked'
      ? '브라우저가 자동 재생을 막았습니다. 재생을 눌러 주십시오.'
      : state.halted
        ? `${state.problem ?? ''} 재생을 누르면 다시 시도합니다.`
        : (state.problem ?? '')

  const hasTrack = current !== null || playback.state === 'loading'
  el('play').textContent = PLAY_LABEL[playback.state] ?? '재생'
  el<HTMLButtonElement>('play').disabled = !hasTrack
  el<HTMLButtonElement>('prev').disabled = !hasTrack
  el<HTMLButtonElement>('next').disabled = !hasTrack
  el('voice-toggle').textContent = speech.enabled ? '음성 끄기' : '음성 켜기'
  el('voice-toggle').setAttribute('aria-pressed', String(speech.enabled))
  el('console-notice').textContent = notice
  // 곡의 결에 따라 조작부의 빛깔이 바뀐다.
  document.documentElement.style.setProperty('--mood', moodColour(current?.track.moods ?? []))

  if (!salon) return

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
    notice,
    speech: speechLine,
    playing,
  })

  salon.books.setProgram({
    queue: state.queue,
    currentId: current?.track.id ?? null,
    browsedId,
    listOffset,
  })

  salon.turntable.set({
    spinning: playing,
    armDown: current !== null && playback.state !== 'idle' && playback.state !== 'ended',
    progress: progress ?? 0,
  })
}

session.subscribe((state) => {
  renderAccessible(state)
  updateScene(state)
})

// ---- 질답 ----

let askStep = -1
let answers: Answers = { ...DEFAULT_ANSWERS }

function renderAsk(): void {
  const q = QUESTIONS[askStep]
  if (!q) {
    salon?.hud.showAsk(null)
    askBox.setAttribute('hidden', '')
    return
  }
  askBox.removeAttribute('hidden')
  el('ask-step').textContent = `${askStep + 1} / ${QUESTIONS.length}`
  el('ask-question').textContent = q.ask
  el('ask-hint').textContent = q.hint
  el('ask-options').replaceChildren(
    ...q.options.map((opt) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = `${opt.label} — ${opt.blurb}`
      b.addEventListener('click', () => choose(opt.id))
      return b
    }),
  )
  salon?.hud.showAsk({
    step: `${askStep + 1} / ${QUESTIONS.length}`,
    question: q.ask,
    hint: q.hint,
    options: q.options.map((o) => ({ id: o.id, label: o.label, blurb: o.blurb })),
    canGoBack: askStep > 0,
  })
  listening = false
  butler?.setPose('speak')
  say(q.ask)
}

function startAsk(): void {
  askStep = 0
  answers = { ...DEFAULT_ANSWERS }
  renderAsk()
}

function choose(optionId: string): void {
  const q = QUESTIONS[askStep]
  if (!q) return
  answers = { ...answers, [q.id]: optionId } as Answers
  askStep += 1
  if (askStep >= QUESTIONS.length) {
    askStep = -1
    renderAsk()
    void begin(answers)
    return
  }
  renderAsk()
}

async function begin(picked: Answers): Promise<void> {
  lastAnswers = picked
  const queue = buildQueue(picked, CATALOG, { size: 20, exclude: session.recentIds() })
  if (queue.entries.length === 0) {
    say('죄송합니다. 지금 틀어 드릴 수 있는 곡이 없습니다.')
    return
  }
  butler?.setPose('present')
  say(queue.summary)
  browsedId = null
  listOffset = 0
  await session.setQueue(queue.entries)
}

// ---- 조작 ----

function act(id: string): void {
  // 첫 조작이 소리의 출발점이다. 이때부터 음성을 켤 수 있다.
  if (!userActed) {
    userActed = true
    speech.enabled = true
    updateScene(session.state)
  }

  if (id.startsWith('opt:')) {
    choose(id.slice(4))
    return
  }
  if (id.startsWith('track:')) {
    const trackId = id.slice(6)
    const entry = session.state.queue.find((e) => e.track.id === trackId)
    // 한 번 누르면 펼쳐 읽고, 이미 펼친 곡을 다시 누르면 그 곡을 튼다.
    if (browsedId === trackId && entry) void session.playEntry(entry)
    else browsedId = trackId
    updateScene(session.state)
    return
  }
  if (id.startsWith('link:')) {
    // 바깥 출처는 새 탭으로 연다. 응접실의 재생은 그대로 이어진다.
    window.open(id.slice(5), '_blank', 'noopener,noreferrer')
    return
  }
  switch (id) {
    case 'ask':
      startAsk()
      break
    case 'auto':
      askStep = -1
      renderAsk()
      void begin(DEFAULT_ANSWERS)
      break
    case 'prev':
      void session.previous()
      break
    case 'next':
      void session.next()
      break
    case 'play':
      if (session.state.halted) void session.resume()
      else void session.toggle()
      break
    case 'greet':
      butler?.bow()
      say(speech.enabled ? LINES.greetVoice : LINES.greetQuiet)
      break
    case 'voice':
      speech.enabled = !speech.enabled
      if (!speech.enabled) speech.cancel()
      updateScene(session.state)
      break
    case 'list:prev':
      listOffset = Math.max(0, listOffset - 7)
      updateScene(session.state)
      break
    case 'list:next':
      listOffset = Math.min(Math.max(0, session.state.queue.length - 7), listOffset + 7)
      updateScene(session.state)
      break
    case 'follow':
      browsedId = null
      updateScene(session.state)
      break
    case 'source:open':
      salon?.books.setSourceOpen(true)
      break
    case 'source:close':
      salon?.books.setSourceOpen(false)
      break
    case 'source:track': {
      const shown =
        session.state.queue.find((e) => e.track.id === (browsedId ?? session.state.current?.track.id))
      if (shown) window.open(shown.rights.sourceUrl, '_blank', 'noopener,noreferrer')
      break
    }
    case 'back':
      if (askStep > 0) {
        askStep -= 1
        renderAsk()
      }
      break
    case 'skip': {
      const q = QUESTIONS[askStep]
      if (q) choose(DEFAULT_ANSWERS[q.id])
      break
    }
  }
}

// ---- 장면 ----

function startScene(): boolean {
  try {
    salon = createSalon(sceneHost)
  } catch (err) {
    if (err instanceof WebGLUnavailableError) {
      // 조작부가 전부 3D 안에 있으므로, 3D 를 못 열면 사실대로 알린다.
      sceneHost.innerHTML =
        '<p style="padding:32px;line-height:1.9;max-width:34rem;margin:auto">' +
        '이 기기에서는 3D 응접실을 열 수 없습니다. 같은 기능의 2D 화면을 준비하고 있습니다. ' +
        '그동안은 <a style="color:#e0c76a" href="https://progh2.github.io/classic-bgm-dj/">2D 버전</a>을 이용해 주세요.</p>'
      return false
    }
    throw err
  }

  salon.hud.onPick(act)
  for (const panel of salon.books.panels) salon.addPanel(panel, act)

  const loop = (t: number): void => {
    const delta = lastMs === 0 ? 0.016 : Math.min(0.1, (t - lastMs) / 1000)
    lastMs = t
    butler?.tick(t, delta)
    salon?.tick(t, delta)
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
  window.addEventListener('resize', () => salon?.resize())
  return true
}

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
  const textures = `${import.meta.env.BASE_URL}textures/`
  const warn = (what: string) => (err: unknown) => console.warn(`${what}을 불러오지 못했습니다`, err)
  void salon.room.applyTextures(textures).catch(warn('방의 결'))
  void salon.screen.applyTextures(textures).catch(warn('안내판 액자 결'))

  try {
    const { loadTable } = await import('./scene/table')
    const table = await loadTable(
      `${import.meta.env.BASE_URL}props/classic-console/ClassicConsole_01_1k.gltf`,
      TABLE_TOP,
    )
    salon.add(table.root)
    salon.removePlaceholderTable()
  } catch (err) {
    console.warn('콘솔 테이블을 불러오지 못했습니다', err)
  }
}

/** 발걸음 소리. 겹쳐 울리도록 요소를 돌려 쓰고, 걸음마다 세기를 조금씩 달리한다. */
const footsteps: HTMLAudioElement[] = []
let footstepAt = 0

function playFootstep(): void {
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
  // 첫 조작 전이면 브라우저가 막는다. 발소리는 없어도 되는 소리다.
  void a.play().catch(() => {})
}

async function bringInButler(): Promise<void> {
  if (!salon) return
  status.textContent = '집사가 오는 중입니다…'
  try {
    const { loadButler } = await import('./butler/butler')
    butler = await loadButler(`${import.meta.env.BASE_URL}models/sebastian.vrm`, (frac) => {
      status.textContent = `집사가 오는 중입니다… ${Math.round(frac * 100)}%`
    })
  } catch (err) {
    console.warn('집사 모델을 불러오지 못했습니다', err)
    status.textContent = '집사가 자리를 비웠습니다. 음악은 그대로 이용하실 수 있습니다.'
    say(LINES.greetQuiet)
    return
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__butler = butler
  }
  // 오른쪽 문에서 걸어 들어온다. 이미 서 있는 것보다 사람이 온 느낌이 난다.
  butler.root.position.set(2.6, 0, -1.5)
  butler.lookAt(salon.viewerAnchor)
  salon.add(butler.root)
  status.textContent = ''

  // 집사가 나타나는 순간부터 천천히 다가간다. 걸어 들어오는 동안 화면이 좁혀진다.
  salon.moveIn()
  await butler.walkTo(0.62, -1.0, playFootstep)
  butler.bow()
  say(LINES.greetQuiet)
}

// ---- 감춰진 층의 단추도 같은 일을 한다 ----

for (const [id, action] of [
  ['start-ask', 'ask'],
  ['start-auto', 'auto'],
  ['prev', 'prev'],
  ['play', 'play'],
  ['next', 'next'],
  ['repeat-greeting', 'greet'],
  ['voice-toggle', 'voice'],
  ['ask-back', 'back'],
  ['ask-skip', 'skip'],
] as const) {
  el(id).addEventListener('click', () => act(action))
}

el<HTMLInputElement>('seek').addEventListener('change', (e) => {
  const d = session.state.playback.durationSec
  if (d) session.seek((Number((e.target as HTMLInputElement).value) / 1000) * d)
})

el<HTMLInputElement>('volume').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value) / 100
  session.setVolume(v)
  localStorage.setItem('salon.volume', String(v))
})

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return
  if (e.key === ' ') {
    e.preventDefault()
    act('play')
  } else if (e.key === 'ArrowRight' && e.altKey) {
    act('next')
  } else if (e.key === 'ArrowLeft' && e.altKey) {
    act('prev')
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

// ---- 무거운 자료는 기기에 한 번만 받는다 ----

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 등록이 실패해도 서비스는 그대로 돌아간다. 매번 받을 뿐이다.
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch((err: unknown) => console.warn('자료 캐시를 등록하지 못했습니다', err))
}

// ---- 시작 ----

const saved = Number(localStorage.getItem('salon.volume'))
const volume = Number.isFinite(saved) && saved > 0 ? saved : 0.8
session.setVolume(volume)
el<HTMLInputElement>('volume').value = String(Math.round(volume * 100))

if (startScene()) {
  updateScene(session.state)
  void lightRoom()
  void dressRoom()
  void bringInButler()
}
