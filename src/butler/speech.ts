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

function pickKorean(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ko = voices.filter((v) => v.lang.toLowerCase().startsWith('ko'))
  if (ko.length === 0) return null
  // 남성 집사이므로 이름에 단서가 있으면 남성 음성을 고른다. 없으면 첫 번째.
  const male = ko.find((v) => /male|남|minsu|injoon|gyeong/i.test(v.name) && !/female|여/i.test(v.name))
  return male ?? ko[0] ?? null
}

export function createSpeech(opts: SpeechOptions): Speech {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  let voice: SpeechSynthesisVoice | null = null
  let voicesReady = false
  /** 발화마다 번호를 매겨, 취소된 뒤 도착한 이벤트를 무시한다. */
  let token = 0

  if (synth) {
    void loadVoices(synth).then((vs) => {
      voice = pickKorean(vs)
      voicesReady = true
    })
  }

  const stopTalking = (): void => {
    opts.onTalking(false)
  }

  const speech: Speech = {
    enabled: false,

    async say(text) {
      const my = ++token
      opts.onSubtitle(text)

      if (!speech.enabled || !synth) {
        // 자막만으로 진행한다. 읽는 시간만큼은 자막을 남겨 둔다.
        return
      }
      synth.cancel()

      // 음성 목록이 아직 안 왔으면 잠깐 기다린다. 그래도 없으면 자막으로 간다.
      if (!voicesReady) {
        await loadVoices(synth, 800).then((vs) => {
          voice = pickKorean(vs)
          voicesReady = true
        })
        if (my !== token) return
      }

      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      if (voice) u.voice = voice
      u.rate = 0.98
      u.pitch = 0.92

      await new Promise<void>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          clearTimeout(guard)
          if (my === token) stopTalking()
          resolve()
        }
        // 일부 브라우저에서 end 가 오지 않는 경우가 있어 시간 제한을 둔다.
        const guard = setTimeout(finish, 2000 + text.length * 220)
        u.addEventListener('start', () => {
          if (my === token) opts.onTalking(true)
        })
        u.addEventListener('end', finish)
        u.addEventListener('error', finish)
        synth.speak(u)
      })
    },

    cancel() {
      token++
      synth?.cancel()
      opts.onTalking(false)
      opts.onSubtitle(null)
    },

    hasKoreanVoice() {
      return voice !== null
    },

    dispose() {
      token++
      synth?.cancel()
    },
  }

  return speech
}
