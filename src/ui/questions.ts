import { QUESTIONS, type Answers } from '../catalog/select'

/**
 * 집사의 네 질문을 한 화면에 하나씩 보여 준다.
 * 뒤로 가기와 "이건 맡길게요"(기본값으로 건너뛰기)를 제공한다.
 */
export interface AskPanel {
  start(): void
  close(): void
  readonly open: boolean
}

export interface AskPanelOptions {
  root: HTMLElement
  stepEl: HTMLElement
  questionEl: HTMLElement
  hintEl: HTMLElement
  optionsEl: HTMLElement
  backBtn: HTMLButtonElement
  skipBtn: HTMLButtonElement
  defaults: Answers
  /** 질문이 바뀔 때마다 집사가 읽을 문장. */
  onAsk: (text: string) => void
  onDone: (answers: Answers) => void
}

export function createAskPanel(o: AskPanelOptions): AskPanel {
  let step = 0
  let answers: Answers = { ...o.defaults }
  let open = false

  const render = (): void => {
    const q = QUESTIONS[step]
    if (!q) return
    o.stepEl.textContent = `${step + 1} / ${QUESTIONS.length}`
    o.questionEl.textContent = q.ask
    o.hintEl.textContent = q.hint
    o.backBtn.disabled = step === 0

    o.optionsEl.replaceChildren(
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
    // 질문이 바뀌면 첫 선택지로 초점을 옮겨 키보드만으로 진행할 수 있게 한다.
    ;(o.optionsEl.firstElementChild as HTMLElement | null)?.focus()
    o.onAsk(q.ask)
  }

  const choose = (optionId: string): void => {
    const q = QUESTIONS[step]
    if (!q) return
    answers = { ...answers, [q.id]: optionId } as Answers
    step += 1
    if (step >= QUESTIONS.length) {
      close()
      o.onDone(answers)
      return
    }
    render()
  }

  const close = (): void => {
    open = false
    o.root.setAttribute('hidden', '')
  }

  o.backBtn.addEventListener('click', () => {
    if (step === 0) return
    step -= 1
    render()
  })

  o.skipBtn.addEventListener('click', () => {
    // 이 질문만 기본값으로 두고 넘어간다.
    const q = QUESTIONS[step]
    if (q) choose(o.defaults[q.id])
  })

  return {
    get open() {
      return open
    },
    start() {
      step = 0
      answers = { ...o.defaults }
      open = true
      o.root.removeAttribute('hidden')
      render()
    },
    close,
  }
}
