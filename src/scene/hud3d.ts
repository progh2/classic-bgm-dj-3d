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

  // 자막 명판 — 테이블 위, 안내판 아래
  const subtitle = createPanel({ width: 2.5, height: 0.5, canvasWidth: 1500 })
  subtitle.mesh.position.set(0, 0.46, -0.55)
  subtitle.setVisible(false)
  root.add(subtitle.mesh)

  // 조작판 — 테이블 앞쪽에 눕혀 둔다
  const controls = createPanel({ width: 2.1, height: 0.46, canvasWidth: 1260 })
  controls.mesh.position.set(0, 0.035, 0.34)
  controls.mesh.rotation.x = -Math.PI / 2.35
  root.add(controls.mesh)

  // 질답 카드 — 물을 때만 나타난다
  const ask = createPanel({ width: 2.3, height: 1.18, canvasWidth: 1380 })
  ask.mesh.position.set(0, 0.72, -0.3)
  ask.setVisible(false)
  root.add(ask.mesh)

  let content: Hud3DContent = {
    subtitle: null,
    playLabel: '재생',
    voiceLabel: '음성 켜기',
    hasTrack: false,
    notice: '',
  }

  const drawSubtitle = (): void => {
    subtitle.draw((ctx, { w, h }) => {
      if (!content.subtitle) return []
      plateBackground(ctx, w, h, 0.86)
      ctx.fillStyle = PLATE.brassSoft
      ctx.font = `500 26px ${F}`
      ctx.fillText('세바스티안', 40, 54)
      ctx.fillStyle = PLATE.ink
      ctx.font = `400 40px ${F}`
      wrap(ctx, content.subtitle, 40, 76, w - 80, 50, 2)
      return []
    })
  }

  const drawControls = (): void => {
    controls.draw((ctx, { w, h }, hovered) => {
      plateBackground(ctx, w, h, 0.92)
      ctx.font = `500 30px ${F}`
      const regions: Region[] = []
      const pad = 26
      const y = 30
      const bh = 74

      const cells: { id: string; label: string; width: number; primary?: boolean; off?: boolean }[] = [
        { id: 'ask', label: '취향 고르기', width: 200 },
        { id: 'auto', label: '맡길게', width: 150 },
        { id: 'prev', label: '◀', width: 84, off: !content.hasTrack },
        { id: 'play', label: content.playLabel, width: 160, primary: true, off: !content.hasTrack },
        { id: 'next', label: '▶', width: 84, off: !content.hasTrack },
        { id: 'greet', label: '인사', width: 120 },
        { id: 'voice', label: content.voiceLabel, width: 190 },
      ]
      const total = cells.reduce((n, c) => n + c.width, 0) + pad * (cells.length - 1)
      let x = (w - total) / 2

      for (const c of cells) {
        plateButton(ctx, c.label, x, y, c.width, bh, {
          hovered: hovered === c.id && !c.off,
          ...(c.primary === undefined ? {} : { primary: c.primary }),
          ...(c.off === undefined ? {} : { disabled: c.off }),
        })
        regions.push({ id: c.id, x, y, w: c.width, h: bh })
        x += c.width + pad
      }

      if (content.notice) {
        ctx.fillStyle = '#e6b98a'
        ctx.font = `400 24px ${F}`
        ctx.textAlign = 'center'
        ctx.fillText(content.notice, w / 2, y + bh + 34)
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

  drawSubtitle()
  drawControls()

  return {
    root,
    panels: [subtitle, controls, ask],

    setContent(c) {
      const subtitleChanged = c.subtitle !== content.subtitle
      content = c
      if (subtitleChanged) {
        subtitle.setVisible(c.subtitle !== null)
        drawSubtitle()
      }
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

/** 긴 줄을 폭에 맞춰 자른다. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = candidate
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i + 1) * lineHeight - 10))
}
