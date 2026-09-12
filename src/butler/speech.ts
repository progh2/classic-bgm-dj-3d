/**
 * 집사의 말하기. 브라우저 `speechSynthesis` 를 쓰고, 한 번에 하나씩만 말한다.
 *
 * 기기마다 한국어 음성 설치 여부와 음색이 다르고, 음성 목록이 늦게 채워지기도
 * 한다. 음성을 못 찾거나 오류가 나도 자막으로 계속 진행한다.
 */

export interface SpeechOptions {
  /** 자막을 표시할 함수. 음성이 없어도 이것만은 항상 호출한다. */
  onSubtitle: (text: string | null) => void
  /** 말하기 시작/종료. 집사의 입 움직임에 연결한다. */
  onTalking: (on: boolean) => void
}

export interface Speech {
  /** 음성 사용 여부. 끄면 자막만 나온다. */
  enabled: boolean
  /** 앞의 발화를 취소하고 이 문장을 말한다. */
  say(text: string): Promise<void>
  /** 진행 중인 발화를 멈추고 자막을 지운다. */
  cancel(): void
  /** 이 기기에서 한국어 음성을 찾았는지. 자막 안내에 쓴다. */
  hasKoreanVoice(): boolean
  /** 마지막 발화가 실제로 소리로 나왔는지. 브라우저가 막으면 거짓이다. */
  didSpeak(): boolean
  dispose(): void
}

/** 음성 목록은 비어 있다가 voiceschanged 로 채워지는 브라우저가 있다. */
function loadVoices(synth: SpeechSynthesis, timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices()
  if (now.length > 0) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = (): void => {
      synth.removeEventListener('voiceschanged', done)
      clearTimeout(timer)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(done, timeoutMs)
    synth.addEventListener('voiceschanged', done)
  })
}

/**
 * 기기마다 깔린 한국어 음성이 다르다. 이름에서 남성인 것을 먼저 찾고,
 * 없으면 아무 한국어 음성이나 쓰되 음높이를 낮춰 부드럽게 들리게 한다.
 *
 * 실제로 만나는 이름들: Windows 는 'Microsoft InJoon', 삼성은 '한국어 남성',
 * 안드로이드는 'ko-KR-Standard-C/D' 가 남성 계열이다.
 */
const MALE_HINT = /injoon|인준|남성|남자|\bmale\b|standard-c|standard-d|wavenet-c|wavenet-d/i
const FEMALE_HINT = /heami|해미|yuna|유나|여성|여자|female|standard-a|standard-b|wavenet-a|wavenet-b/i

function pickKorean(voices: SpeechSynthesisVoice[]): {
  voice: SpeechSynthesisVoice | null
  male: boolean
} {
  const ko = voices.filter((v) => v.lang.toLowerCase().startsWith('ko'))
  if (ko.length === 0) return { voice: null, male: false }

  // 점수로 고른다. 남성 이름이 가장 크고, 그다음이 음질이다.
  // 기기에 딸린 기본 음성보다 내려받는 음성이 대체로 덜 기계적이다.
  const score = (v: SpeechSynthesisVoice): number => {
    let n = 0
    if (MALE_HINT.test(v.name)) n += 10
    if (FEMALE_HINT.test(v.name)) n -= 8
    if (/google|natural|neural|premium|enhanced/i.test(v.name)) n += 4
    if (!v.localService) n += 2
    if (v.default) n += 1
    return n
  }

  const best = [...ko].sort((a, b) => score(b) - score(a))[0] ?? null
  return { voice: best, male: best !== null && MALE_HINT.test(best.name) }
}

export function createSpeech(opts: SpeechOptions): Speech {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  let voice: SpeechSynthesisVoice | null = null
  /** 남성 음성을 찾았는가. 못 찾았으면 음높이를 더 낮춰 흉내낸다. */
  let voiceIsMale = false
  let voicesReady = false
  /** 마지막 발화가 실제로 소리로 나왔는가. 브라우저가 막으면 거짓이다. */
  let spokeAloud = false
  /** 발화마다 번호를 매겨, 취소된 뒤 도착한 이벤트를 무시한다. */
  let token = 0
  let subtitleTimer: ReturnType<typeof setTimeout> | undefined

  /** 글자 수에 맞춰 읽을 시간을 준 뒤 자막을 내린다. */
  const holdSubtitle = (text: string, my: number): void => {
    clearTimeout(subtitleTimer)
    subtitleTimer = setTimeout(
      () => {
        if (my === token) opts.onSubtitle(null)
      },
      2500 + text.length * 90,
    )
  }

  if (synth) {
    void loadVoices(synth).then((vs) => {
      const picked = pickKorean(vs)
      voice = picked.voice
      voiceIsMale = picked.male
      voicesReady = true
    })
  }

  const stopTalking = (): void => {
    opts.onTalking(false)
  }

  const speech: Speech = {
    // 들어서자마자 인사를 건네야 하므로 처음부터 켜 둔다. 브라우저가 막으면
    // 소리가 나지 않을 뿐이고, 그때는 첫 조작에서 다시 건넨다.
    enabled: true,

    async say(text) {
      const my = ++token
      clearTimeout(subtitleTimer)
      opts.onSubtitle(text)

      if (!speech.enabled || !synth) {
        // 자막만으로 진행한다. 읽을 시간만큼 두었다가 내린다.
        holdSubtitle(text, my)
        return
      }
      synth.cancel()

      // 음성 목록이 아직 안 왔으면 잠깐 기다린다. 그래도 없으면 자막으로 간다.
      if (!voicesReady) {
        await loadVoices(synth, 800).then((vs) => {
          const picked = pickKorean(vs)
          voice = picked.voice
          voiceIsMale = picked.male
          voicesReady = true
        })
        if (my !== token) return
      }

      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      if (voice) u.voice = voice
      // 집사는 서두르지 않는다. 조금 느리게.
      u.rate = 0.95
      // 음높이를 많이 내리면 남성처럼 들리기보다 기계음이 된다. 조금만 내린다.
      u.pitch = voiceIsMale ? 0.92 : 0.88
      u.volume = 1
      spokeAloud = false

      await new Promise<void>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          clearTimeout(guard)
          if (my === token) {
            stopTalking()
            holdSubtitle(text, my)
          }
          resolve()
        }
        // 일부 브라우저에서 end 가 오지 않는 경우가 있어 시간 제한을 둔다.
        const guard = setTimeout(finish, 2000 + text.length * 220)
        u.addEventListener('start', () => {
          spokeAloud = true
          if (my === token) opts.onTalking(true)
        })
        u.addEventListener('end', finish)
        u.addEventListener('error', finish)
        synth.speak(u)
      })
    },

    cancel() {
      token++
      clearTimeout(subtitleTimer)
      synth?.cancel()
      opts.onTalking(false)
      opts.onSubtitle(null)
    },

    hasKoreanVoice() {
      return voice !== null
    },

    didSpeak() {
      return spokeAloud
    },

    dispose() {
      token++
      clearTimeout(subtitleTimer)
      synth?.cancel()
    },
  }

  return speech
}
