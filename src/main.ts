import type { Butler } from './butler/butler'
import { LINES } from './butler/lines'
import { createSpeech } from './butler/speech'
import { createSalon, WebGLUnavailableError, type Salon } from './scene/salon'

const sceneHost = document.getElementById('scene')
const gate = document.getElementById('gate')
const enterVoice = document.getElementById('enter-voice')
const enterQuiet = document.getElementById('enter-quiet')
const subtitleBox = document.getElementById('subtitle')
const subtitleText = document.getElementById('subtitle-text')
const hud = document.getElementById('hud')
const voiceToggle = document.getElementById('voice-toggle')
const repeatBtn = document.getElementById('repeat-greeting')
const status = document.getElementById('butler-status')

let salon: Salon | null = null
let butler: Butler | null = null
let frame = 0
let lastMs = 0

const speech = createSpeech({
  onSubtitle: (text) => {
    if (!subtitleBox || !subtitleText) return
    subtitleText.textContent = text ?? ''
    subtitleBox.toggleAttribute('hidden', text === null)
  },
  onTalking: (on) => {
    butler?.setTalking(on)
    butler?.setPose(on ? 'speak' : 'idle')
  },
})

function say(text: string): void {
  void speech.say(text)
}

function setStatus(text: string): void {
  if (status) status.textContent = text
}

function startScene(): void {
  if (!sceneHost || salon) return
  try {
    salon = createSalon(sceneHost)
  } catch (err) {
    if (err instanceof WebGLUnavailableError) {
      // 단계 6에서 2D 응접실로 대체한다. 그때까지는 사실대로 알린다.
      sceneHost.removeAttribute('aria-hidden')
      sceneHost.innerHTML =
        '<p class="fallback">이 기기에서는 3D 응접실을 열 수 없습니다. ' +
        '음악과 출처 안내는 준비 중인 2D 화면에서 제공할 예정입니다.</p>'
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

/** 콘솔 테이블을 불러와 임시 상판과 바꾼다. 실패하면 임시 상판을 그대로 둔다. */
async function dressRoom(): Promise<void> {
  if (!salon) return
  try {
    const { loadTable } = await import('./scene/table')
    const table = await loadTable(`${import.meta.env.BASE_URL}props/classic-console/ClassicConsole_01_1k.gltf`)
    salon.add(table.root)
    salon.removePlaceholderTable()
  } catch (err) {
    console.warn('콘솔 테이블을 불러오지 못했습니다', err)
  }
}

async function bringInButler(): Promise<void> {
  if (!salon) return
  setStatus('집사가 오는 중입니다…')
  try {
    // 입장 화면이 먼저 뜨도록 three-vrm 과 집사 코드는 이때 받는다.
    const { loadButler } = await import('./butler/butler')
    butler = await loadButler(`${import.meta.env.BASE_URL}models/sebastian.vrm`, (frac) => {
      setStatus(`집사가 오는 중입니다… ${Math.round(frac * 100)}%`)
    })
  } catch (err) {
    // 집사가 없어도 음악과 책자는 쓸 수 있어야 한다.
    console.warn('집사 모델을 불러오지 못했습니다', err)
    setStatus('집사가 자리를 비웠습니다. 음악은 그대로 이용하실 수 있습니다.')
    say(LINES.greetQuiet)
    return
  }

  // 자세를 화면에서 맞춰 보기 위한 통로. 개발 빌드에서만 연다.
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__butler = butler
  }
  butler.root.position.set(0, 0, -1.05)
  butler.lookAt(salon.viewerAnchor)
  salon.add(butler.root)
  setStatus('')

  butler.bow()
  say(speech.enabled ? LINES.greetVoice : LINES.greetQuiet)
  if (speech.enabled && !speech.hasKoreanVoice()) setStatus(LINES.noVoice)
}

function enter(withVoice: boolean): void {
  speech.enabled = withVoice
  sessionStorage.setItem('salon.voice', withVoice ? 'on' : 'off')
  gate?.setAttribute('hidden', '')
  hud?.removeAttribute('hidden')
  updateVoiceToggle()
  startScene()
  void dressRoom()
  void bringInButler()
}

function updateVoiceToggle(): void {
  if (!voiceToggle) return
  voiceToggle.textContent = speech.enabled ? '음성 끄기' : '음성 켜기'
  voiceToggle.setAttribute('aria-pressed', String(speech.enabled))
}

enterVoice?.addEventListener('click', () => enter(true))
enterQuiet?.addEventListener('click', () => enter(false))

voiceToggle?.addEventListener('click', () => {
  speech.enabled = !speech.enabled
  if (!speech.enabled) speech.cancel()
  updateVoiceToggle()
})

repeatBtn?.addEventListener('click', () => {
  butler?.bow()
  say(speech.enabled ? LINES.greetVoice : LINES.greetQuiet)
})

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frame)
  speech.dispose()
  butler?.dispose()
  butler = null
  salon?.dispose()
  salon = null
})
