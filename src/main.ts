import { createSalon, WebGLUnavailableError, type Salon } from './scene/salon'

const sceneHost = document.getElementById('scene')
const gate = document.getElementById('gate')
const enterVoice = document.getElementById('enter-voice')
const enterQuiet = document.getElementById('enter-quiet')

let salon: Salon | null = null
let frame = 0

function startScene(): void {
  if (!sceneHost || salon) return
  try {
    salon = createSalon(sceneHost)
  } catch (err) {
    if (err instanceof WebGLUnavailableError) {
      // 단계 6에서 2D 응접실로 대체한다. 그때까지는 사실대로 알린다.
      sceneHost.textContent = ''
      sceneHost.removeAttribute('aria-hidden')
      sceneHost.innerHTML =
        '<p style="padding:24px;line-height:1.8">이 기기에서는 3D 응접실을 열 수 없습니다. ' +
        '음악과 출처 안내는 준비 중인 2D 화면에서 제공할 예정입니다.</p>'
      return
    }
    throw err
  }
  const loop = (t: number): void => {
    salon?.tick(t)
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
  window.addEventListener('resize', () => salon?.resize())
}

/** 음성 사용 여부는 단계 2 의 집사 TTS 가 읽어 간다. */
function enter(withVoice: boolean): void {
  sessionStorage.setItem('salon.voice', withVoice ? 'on' : 'off')
  gate?.setAttribute('hidden', '')
  startScene()
}

enterVoice?.addEventListener('click', () => enter(true))
enterQuiet?.addEventListener('click', () => enter(false))

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frame)
  salon?.dispose()
  salon = null
})
