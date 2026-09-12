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
  /** 화면에 담기는 가로 폭에 맞춰 조작판과 질답 카드를 줄인다. */
  fitWidth(visibleWidth: number): void
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

  // 질답 카드 — 물을 때만 나타난다
  const ASK_W = 2.2
  const ask = createPanel({ width: ASK_W, height: 1.12, canvasWidth: 1380 })
  ask.mesh.position.set(0, 0.8, -0.26)
  ask.setVisible(false)
  root.add(ask.mesh)

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


  return {
    root,
    panels: [ask],

    fitWidth(visibleWidth) {
      ask.mesh.scale.setScalar(Math.min(1, (visibleWidth * 0.94) / ASK_W))
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
