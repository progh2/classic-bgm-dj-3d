import { Group, type Vector2 } from 'three'
import {
  createPanel,
  PLATE,
  plateBackground,
  plateButton,
  roundRect,
  type Panel,
  type Region,
} from './panel'

/**
 * 3D 안에서 처리하는 조작부 — 자막 명판, 조작판, 질답 카드.
 *
 * 화면 앞에 2D 를 덮지 않기 위해 전부 장면 안의 판으로 그린다.
 */

export interface Hud3DContent {
  /** 집사의 말. 없으면 명판을 감춘다. */
  subtitle: string | null
  /** 재생 단추에 쓸 글자 */
  playLabel: string
  /** 음성 단추에 쓸 글자 */
  voiceLabel: string
  /** 곡이 걸려 있으면 이전·다음·재생을 쓸 수 있다. */
  hasTrack: boolean
  /** 아래쪽 한 줄 안내 */
  notice: string
}

export interface AskContent {
  step: string
  question: string
  hint: string
  options: { id: string; label: string; blurb: string }[]
  canGoBack: boolean
}

export interface Hud3D {
  readonly root: Group
  readonly panels: Panel[]
  /** 좁은 화면에서는 단추를 두 줄로 접는다. */
  setCompact(compact: boolean): void
  setContent(c: Hud3DContent): void
  showAsk(c: AskContent | null): void
  /** 판 위 uv 에 있는 칸의 id */
  hit(panel: Panel, uv: Vector2): string | null
  onPick(handler: (id: string) => void): void
  pick(id: string): void
}

const F = PLATE.font

export function createHud3D(): Hud3D {
  const root = new Group()
  let handler: ((id: string) => void) | null = null

  // 조작판 — 상판 앞쪽에 보면대처럼 세워 둔다. 눕히면 위에서 봐도 글자가
  // 납작해져 읽히지 않는다. 좁은 화면에서는 두 줄로 접어 단추를 키운다.
  const controls = createPanel({ width: 1.94, height: 0.66, canvasWidth: 1400 })
  controls.mesh.position.set(0, 0.3, 0.44)
  controls.mesh.rotation.x = -0.3
  root.add(controls.mesh)

  // 질답 카드 — 물을 때만 나타난다
  const ask = createPanel({ width: 2.2, height: 1.12, canvasWidth: 1380 })
  ask.mesh.position.set(0, 0.78, -0.28)
  ask.setVisible(false)
  root.add(ask.mesh)

  let compact = false
  let content: Hud3DContent = {
    subtitle: null,
    playLabel: '재생',
    voiceLabel: '음성 켜기',
    hasTrack: false,
    notice: '',
  }

  const drawControls = (): void => {
    controls.draw((ctx, { w, h }, hovered) => {
      const regions: Region[] = []
      const cells: { id: string; label: string; span: number; primary?: boolean; off?: boolean }[] = [
        { id: 'ask', label: '취향 고르기', span: 1.5 },
        { id: 'auto', label: '맡길게', span: 1.1 },
        { id: 'prev', label: '◀', span: 0.62, off: !content.hasTrack },
        { id: 'play', label: content.playLabel, span: 1.2, primary: true, off: !content.hasTrack },
        { id: 'next', label: '▶', span: 0.62, off: !content.hasTrack },
        { id: 'greet', label: '인사', span: 0.85 },
        { id: 'voice', label: content.voiceLabel, span: 1.4 },
      ]
      // 좁은 화면에서는 재생 조작을 아랫줄로 내려 단추를 키운다.
      const rows = compact
        ? [cells.filter((c) => ['prev', 'play', 'next'].includes(c.id)),
           cells.filter((c) => !['prev', 'play', 'next'].includes(c.id))]
        : [cells]

      const pad = compact ? 16 : 20
      const bh = compact ? 128 : 104
      const gap = 18
      const usableH = rows.length * bh + (rows.length - 1) * gap
      let y = (h - usableH) / 2 - (content.notice ? 22 : 0)

      plateBackground(ctx, w, h, 0.9)

      for (const row of rows) {
        const spans = row.reduce((n, c) => n + c.span, 0)
        const unit = (w - pad * 2 - pad * (row.length - 1)) / spans
        ctx.font = `500 ${compact ? 40 : 36}px ${F}`
        let x = pad
        for (const c of row) {
          const bw = unit * c.span
          plateButton(ctx, c.label, x, y, bw, bh, {
            hovered: hovered === c.id && !c.off,
            ...(c.primary === undefined ? {} : { primary: c.primary }),
            ...(c.off === undefined ? {} : { disabled: c.off }),
          })
          regions.push({ id: c.id, x, y, w: bw, h: bh })
          x += bw + pad
        }
        y += bh + gap
      }

      if (content.notice) {
        ctx.fillStyle = '#e6b98a'
        ctx.font = `400 28px ${F}`
        ctx.textAlign = 'center'
        ctx.fillText(content.notice, w / 2, y + 18)
        ctx.textAlign = 'left'
      }
      return regions
    })
  }

  const drawAsk = (c: AskContent): void => {
    ask.draw((ctx, { w, h }, hovered) => {
      plateBackground(ctx, w, h, 0.93)
      const regions: Region[] = []

      ctx.fillStyle = PLATE.brassSoft
      ctx.font = `500 24px ${F}`
      ctx.fillText(c.step, 44, 54)

      ctx.fillStyle = PLATE.ink
      ctx.font = `600 44px ${F}`
      ctx.fillText(c.question, 44, 112)

      ctx.fillStyle = PLATE.inkDim
      ctx.font = `400 26px ${F}`
      ctx.fillText(c.hint, 44, 152)

      // 선택지 — 두 칸씩
      const cols = 2
      const bw = (w - 88 - 20) / cols
      const bh = 96
      c.options.forEach((opt, i) => {
        const x = 44 + (i % cols) * (bw + 20)
        const y = 184 + Math.floor(i / cols) * (bh + 16)
        const on = hovered === `opt:${opt.id}`
        roundRect(ctx, x, y, bw, bh, 8)
        ctx.fillStyle = on ? 'rgba(201, 162, 39, .22)' : 'rgba(90, 60, 36, .45)'
        ctx.fill()
        ctx.strokeStyle = on ? PLATE.brassSoft : 'rgba(201, 162, 39, .4)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = PLATE.ink
        ctx.font = `600 32px ${F}`
        ctx.fillText(opt.label, x + 22, y + 42)
        ctx.fillStyle = PLATE.inkDim
        ctx.font = `400 24px ${F}`
        ctx.fillText(opt.blurb, x + 22, y + 76)
        regions.push({ id: `opt:${opt.id}`, x, y, w: bw, h: bh })
      })

      const navY = h - 86
      ctx.font = `500 28px ${F}`
      plateButton(ctx, '뒤로', 44, navY, 140, 62, {
        hovered: hovered === 'back' && c.canGoBack,
        disabled: !c.canGoBack,
      })
      regions.push({ id: 'back', x: 44, y: navY, w: 140, h: 62 })
      plateButton(ctx, '이건 맡길게요', 204, navY, 250, 62, { hovered: hovered === 'skip' })
      regions.push({ id: 'skip', x: 204, y: navY, w: 250, h: 62 })

      return regions
    })
  }

  drawControls()

  return {
    root,
    panels: [controls, ask],

    setCompact(next) {
      if (compact === next) return
      compact = next
      drawControls()
    },

    setContent(c) {
      content = c
      drawControls()
    },

    showAsk(c) {
      if (!c) {
        ask.setVisible(false)
        return
      }
      ask.setVisible(true)
      drawAsk(c)
    },

    hit(panel, uv) {
      return panel.hitTest(uv)
    },

    onPick(h) {
      handler = h
    },

    pick(id) {
      handler?.(id)
    },
  }
}
