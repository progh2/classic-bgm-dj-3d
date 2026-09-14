import type { Butler } from './butler/butler'
import { introduce, LINES } from './butler/lines'
import { createSpeech } from './butler/speech'
import { CATALOG, formatTime } from './catalog/catalog'
import { buildQueue, DEFAULT_ANSWERS, QUESTIONS, type Answers } from './catalog/select'
import { createSession, type SessionState } from './core/session'
import { phaseNow } from './scene/daylight'
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
/**
 * 다음 곡이 시작될 때 집사가 소개할 것인가.
 *
 * 자동으로 넘어갈 때마다 떠들면 배경으로 깔아 두기 어렵다. 이전·다음을
 * 누르거나 곡목에서 고른 경우에만 켠다.
 */
let announceNext = false
/** 인사를 자막으로만 건넸는가. 첫 조작 때 소리로 다시 건넨다. */
let greetedSilently = false
/** 집사가 지금 어디에 있는가. 자리를 옮기는 동안 겹쳐 부르지 않도록 센다. */
let butlerPlace: 'console' | 'piano' = 'console'
/** 실제로 의자에 앉았는가. 걸어가는 중에는 거짓이다. */
let butlerSeated = false
let moveToken = 0

/** 집사가 서는 콘솔 뒤 자리 */
const CONSOLE_SPOT = { x: 0.62, z: -1.0 }

function isPianoTrack(entry: { track: { instruments: readonly string[] } }): boolean {
  return entry.track.instruments.includes('piano')
}

/**
 * 곡의 편성에 따라 집사가 자리를 옮긴다.
 *
 * 피아노곡이면 피아노 앞에 앉아 친다. 관현악이나 4중주가 흐르는데 집사가
 * 건반을 두드리고 있으면 소리와 그림이 어긋난다.
 */
async function placeButler(toPiano: boolean): Promise<void> {
  if (!salon || !butler) return
  const place = toPiano ? 'piano' : 'console'
  if (butlerPlace === place) return
  butlerPlace = place
  const my = ++moveToken

  if (toPiano) {
    salon.lookAt('piano', 2.4)
    // 의자 뒤로 걸어가 선 다음에 앉는다. 앉는 자세를 걷는 중에 씌우면
    // 다리를 접은 채로 걷는 괴상한 모습이 된다.
    const stand = salon.piano.approach
    await butler.walkTo(stand.x, stand.z, playFootstep)
    if (my !== moveToken) return
    const seat = salon.piano.seat
    butler.placeAt(seat.x, seat.z, salon.piano.facing)
    butler.sit(true, salon.piano.seatHeight, salon.piano.facing)
    butlerSeated = true
    butler.setPlaying(session.state.playback.state === 'playing')
  } else {
    butler.setPlaying(false)
    butlerSeated = false
    butler.sit(false)
    salon.lookAt('close', 2.4)
    await butler.walkTo(CONSOLE_SPOT.x, CONSOLE_SPOT.z, playFootstep)
    if (my !== moveToken) return
    butler.setPose(listening ? 'listen' : 'idle')
  }
}

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
    if (on) butler?.setPose('speak')
    else if (butlerSeated) butler?.restPose()
    else butler?.setPose(listening ? 'listen' : 'idle')
  },
})

const say = (text: string): void => void speech.say(text)

const adapter = new AudioFileAdapter()
let lastAnswers: Answers = DEFAULT_ANSWERS

const session = createSession(adapter, {
  refill: (recent) => buildQueue(lastAnswers, CATALOG, { size: 12, exclude: recent }).entries,
  onTrackChange: (entry) => {
    listening = true
    if (entry) void placeButler(isPianoTrack(entry))
    if (butlerPlace === 'console') butler?.setPose('listen')
    if (announceNext && entry) {
      announceNext = false
      say(introduce(entry.track, entry.note?.shortNote))
    }
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
  // 누를 수 없는 단추는 없는 편이 낫다. 곡이 걸리기 전에는 감춘다.
  el('transport').toggleAttribute('hidden', !hasTrack)
  el('play').textContent = PLAY_LABEL[playback.state] ?? '재생'
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
        : '세실리아의 음악 응접실',
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

  butler?.setGroove(playing && butlerPlace === 'console')
  // 피아노 앞에서는 멈추면 손을 내린다. 걸어가는 중에는 손대지 않는다.
  if (butlerPlace === 'piano' && butlerSeated) butler?.setPlaying(playing)

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
    askBox.setAttribute('hidden', '')
    return
  }
  askBox.removeAttribute('hidden')
  el('ask-step').textContent = `${askStep + 1} / ${QUESTIONS.length}`
  el('ask-question').textContent = q.ask
  el('ask-hint').textContent = q.hint
  el<HTMLButtonElement>('ask-back').disabled = askStep === 0
  el('ask-options').replaceChildren(
    ...q.options.map((opt) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'ask__option'
      const strong = document.createElement('b')
      strong.textContent = opt.label
      const span = document.createElement('span')
      span.textContent = opt.blurb
      b.append(strong, span)
      b.addEventListener('click', () => choose(opt.id))
      return b
    }),
  )
  // 키보드만으로도 고를 수 있게 첫 선택지로 초점을 옮긴다.
  ;(el('ask-options').firstElementChild as HTMLElement | null)?.focus()
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
    updateScene(session.state)
    // 브라우저는 첫 조작 전에 소리를 내주지 않는다. 들어올 때의 인사는
    // 자막으로만 지나갔으므로, 이 시점에 한 번 소리로 건넨다.
    if (greetedSilently) {
      greetedSilently = false
      butler?.bow()
      say(LINES.greetVoice)
      return
    }
  }

  if (id.startsWith('opt:')) {
    choose(id.slice(4))
    return
  }
  if (id.startsWith('track:')) {
    const trackId = id.slice(6)
    const entry = session.state.queue.find((e) => e.track.id === trackId)
    // 한 번 누르면 펼쳐 읽고, 이미 펼친 곡을 다시 누르면 그 곡을 튼다.
    if (browsedId === trackId && entry) {
      announceNext = true
      void session.playEntry(entry)
    }
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
      announceNext = true
      void session.previous()
      break
    case 'next':
      announceNext = true
      void session.next()
      break
    case 'play':
      if (session.state.halted) {
        void session.resume()
      } else {
        // 멈추고 트는 것을 말로도 알린다. 무엇이 일어났는지 화면을 안 봐도 안다.
        const wasPlaying = session.state.playback.state === 'playing'
        say(wasPlaying ? LINES.paused : LINES.resumed)
        void session.toggle()
      }
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

  for (const panel of salon.books.panels) salon.addPanel(panel, act)

  /** 초당 60장이면 충분하다. 120Hz·144Hz 화면에서 두 배로 그리지 않는다. */
  const MIN_FRAME_MS = 1000 / 61
  const loop = (t: number): void => {
    frame = requestAnimationFrame(loop)
    if (lastMs !== 0 && t - lastMs < MIN_FRAME_MS) return
    const delta = lastMs === 0 ? 0.016 : Math.min(0.1, (t - lastMs) / 1000)
    lastMs = t
    butler?.tick(t, delta)
    salon?.tick(t, delta)
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

/** 창밖을 지금 시각에 맞춘다. 1분마다 다시 본다. */
function followDaylight(): void {
  const apply = (): void => {
    if (!salon) return
    const phase = phaseNow()
    salon.furnishings.setDaylight(1 - phase.night, phase.colour)
  }
  apply()
  window.setInterval(apply, 60_000)
}

/** 벽에 걸 그림을 고른다. 올 때마다 다른 그림이 걸린다. */
async function hangArtworks(): Promise<void> {
  if (!salon) return
  try {
    const { ARTWORKS } = await import('./catalog/artworks')
    const shuffled = [...ARTWORKS].sort(() => Math.random() - 0.5).slice(0, 3)
    await salon.furnishings.hangArtworks(shuffled)
  } catch (err) {
    console.warn('그림을 걸지 못했습니다', err)
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

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function bringInButler(): Promise<void> {
  if (!salon) return
  status.textContent = '안내인이 오는 중입니다…'
  try {
    const { loadButler } = await import('./butler/butler')
    butler = await loadButler(`${import.meta.env.BASE_URL}models/cecilia.vrm`, (frac) => {
      status.textContent = `안내인이 오는 중입니다… ${Math.round(frac * 100)}%`
    })
  } catch (err) {
    console.warn('안내인 모델을 불러오지 못했습니다', err)
    status.textContent = '안내인이 자리를 비웠습니다. 음악은 그대로 이용하실 수 있습니다.'
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

  // 발소리를 듣고 오른쪽 문으로 고개를 돌렸다가, 집사를 따라 가운데로 돌아온다.
  playFootstep()
  salon.lookAt('door', 1.6)
  await wait(1400)
  salon.lookAt('close', 4.2)
  await butler.walkTo(0.62, -1.0, playFootstep)
  butler.bow()
  // 자리에 서면 바로 인사한다. 브라우저가 소리를 막았으면 자막만 지나가므로,
  // 그 사실을 기억해 두었다가 첫 조작 때 다시 건넨다.
  await speech.say(LINES.greetVoice)
  greetedSilently = !speech.didSpeak()
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

/**
 * 브라우저는 첫 조작 전에 소리를 내주지 않는다. 단추가 아니라 화면 아무 데나
 * 처음 닿는 순간을 붙잡아 그때 인사를 건넨다. 단추를 눌러야만 인사하던 것을
 * 조금 낫게 하는 방법이고, 정책 자체를 비껴갈 수는 없다.
 */
function onFirstTouch(): void {
  if (userActed) return
  userActed = true
  updateScene(session.state)
  if (greetedSilently) {
    greetedSilently = false
    butler?.bow()
    say(LINES.greetVoice)
  }
}
window.addEventListener('pointerdown', onFirstTouch, { once: true, passive: true })
window.addEventListener('keydown', onFirstTouch, { once: true })

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
  followDaylight()
  void hangArtworks()
  void bringInButler()
}
