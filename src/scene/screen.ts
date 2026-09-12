import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'
import { BoxGeometry, MeshPhysicalMaterial } from 'three'
import { applyTextureSet } from './textures'

/**
 * 집사 뒤에 걸린 안내판. 지금 무엇이 흐르고 있는지를 여기에 띄운다.
 *
 * 화면 앞을 덮는 큰 패널 대신 3D 안에서 보여 주기 위한 것이라, 캔버스에 그려
 * 텍스처로 붙인다. 매 프레임 다시 그리면 낭비이므로 내용이 바뀌었을 때와
 * 진행 막대가 눈에 띄게 움직였을 때만 다시 그린다.
 */

export interface ScreenContent {
  /** 큰 줄 — 곡 제목이나 상태 */
  title: string
  /** 작은 줄 — 작곡가·연주자 */
  subtitle: string
  /** 0~1. 모르면 null */
  progress: number | null
  elapsed: string
  duration: string
  /** 아래쪽 한 줄 안내. 없으면 빈 문자열 */
  notice: string
  /** 집사의 말. 따로 명판을 띄우면 화면을 가리므로 안내판 아래에 싣는다. */
  speech: string | null
  /** 재생 중이면 참 — 표시등에 쓴다 */
  playing: boolean
}

export interface Screen {
  readonly root: Group
  set(content: ScreenContent): void
  /** 액자 목재에 결을 입힌다. */
  applyTextures(base: string): Promise<void>
}

const W = 1280
const H = 720
const FONT = '"Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif'

export function createScreen(): Screen {
  // 액자 목재는 방의 판벽과 같은 결을 쓴다.
  const frameWood = new MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.92, metalness: 0 })
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  const root = new Group()

  // 바깥 액자는 어두운 목재, 안쪽 테두리만 황동으로 둘러 무게를 잡는다.
  const woodFrame = new Mesh(
    new BoxGeometry(3.48, 2.06, 0.08),
    frameWood,
  )
  woodFrame.castShadow = true
  root.add(woodFrame)

  const brassBezel = new Mesh(
    new BoxGeometry(3.26, 1.84, 0.05),
    new MeshStandardMaterial({ color: 0x6b5320, roughness: 0.52, metalness: 0.7 }),
  )
  brassBezel.position.z = 0.03
  root.add(brassBezel)

  // 화면은 스스로 빛나야 하므로 조명을 받지 않는 재질을 쓴다.
  const panel = new Mesh(new PlaneGeometry(3.12, 1.72), new MeshBasicMaterial({ map: texture }))
  panel.position.z = 0.058
  root.add(panel)

  // 유리 한 겹 — 표면이 주변을 아주 옅게 비춰야 판때기로 보이지 않는다.
  const glass = new Mesh(
    new PlaneGeometry(3.14, 1.74),
    new MeshPhysicalMaterial({
      color: 0x101010,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      envMapIntensity: 1.1,
    }),
  )
  glass.position.z = 0.062
  root.add(glass)

  let last: ScreenContent | null = null

  const draw = (c: ScreenContent): void => {
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // 바탕 — 짙은 판에 위쪽만 옅게 밝다
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#241a12')
    bg.addColorStop(1, '#140e09')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // 이중 괘선과 네 귀의 장식 — 공연 프로그램의 표지처럼
    ctx.strokeStyle = 'rgba(224, 199, 106, .5)'
    ctx.lineWidth = 3
    ctx.strokeRect(26, 26, W - 52, H - 52)
    ctx.strokeStyle = 'rgba(224, 199, 106, .22)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(38, 38, W - 76, H - 76)
    corners(ctx, 38, 38, W - 76, H - 76)

    ctx.fillStyle = '#c9a227'
    ctx.font = `500 30px ${FONT}`
    ctx.textBaseline = 'top'
    ctx.fillText('NOW PLAYING', 72, 76)

    // 재생 중 표시등 — 색만으로 구분하지 않도록 글자도 함께 쓴다
    ctx.fillStyle = c.playing ? '#e0c76a' : '#6b5a48'
    ctx.beginPath()
    ctx.arc(W - 96, 92, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `400 26px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(c.playing ? '재생 중' : '멈춤', W - 118, 78)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#f4ece0'
    wrap(ctx, c.title, 72, 176, W - 144, 66, `600 56px ${FONT}`, 2)

    ctx.fillStyle = '#bfae95'
    wrap(ctx, c.subtitle, 72, 330, W - 144, 46, `400 34px ${FONT}`, 2)

    // 오른쪽 여백에는 피아노 선화와 한 줄 글귀를 둔다.
    pianoLineArt(ctx, W - 400, 156, 270)
    ctx.fillStyle = 'rgba(224, 199, 106, .75)'
    ctx.font = `italic 300 32px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText('Good Music, Better Day', W - 110, 368)
    ctx.textAlign = 'left'

    // 본문과 진행 막대를 가르는 장식 괘선
    divider(ctx, 72, 418, W - 144)

    // 진행 막대
    const barY = 476
    const barW = W - 144
    ctx.fillStyle = 'rgba(244, 236, 224, .16)'
    ctx.fillRect(72, barY, barW, 10)
    if (c.progress !== null) {
      ctx.fillStyle = '#e0c76a'
      ctx.fillRect(72, barY, barW * Math.min(1, Math.max(0, c.progress)), 10)
    }

    ctx.fillStyle = '#bfae95'
    ctx.font = `400 30px ${FONT}`
    ctx.fillText(c.elapsed, 72, barY + 26)
    ctx.textAlign = 'right'
    ctx.fillText(c.duration, W - 72, barY + 26)
    ctx.textAlign = 'left'

    // 집사의 말과 안내는 같은 자리를 쓴다. 말이 있으면 말을 먼저 싣는다.
    if (c.speech) {
      ctx.fillStyle = 'rgba(224, 199, 106, .8)'
      ctx.font = `500 24px ${FONT}`
      ctx.fillText('세바스티안', 72, 566)
      ctx.fillStyle = '#f4ece0'
      wrap(ctx, c.speech, 72, 596, W - 144, 38, `400 30px ${FONT}`, 3)
    } else if (c.notice) {
      ctx.fillStyle = '#e6b98a'
      wrap(ctx, c.notice, 72, 596, W - 144, 38, `400 30px ${FONT}`, 2)
    }

    texture.needsUpdate = true
  }

  draw({
    title: '세바스티안의 음악 응접실',
    subtitle: '취향을 고르시거나 제게 맡기십시오.',
    progress: null,
    elapsed: '--:--',
    duration: '--:--',
    notice: '',
    speech: null,
    playing: false,
  })

  return {
    root,

    async applyTextures(base) {
      await applyTextureSet(frameWood, `${base}dark-wooden-planks/`, 'dark_wooden_planks', {
        repeat: [4, 2],
        tint: 0x8a6b4c,
        envMapIntensity: 0.3,
      })
    },

    set(content) {
      // 진행 막대가 1% 넘게 움직였거나 글이 바뀌었을 때만 다시 그린다.
      if (last && !changed(last, content)) return
      last = content
      draw(content)
    },
  }
}

function changed(a: ScreenContent, b: ScreenContent): boolean {
  if (
    a.title !== b.title ||
    a.subtitle !== b.subtitle ||
    a.notice !== b.notice ||
    a.speech !== b.speech ||
    a.playing !== b.playing ||
    a.elapsed !== b.elapsed ||
    a.duration !== b.duration
  ) {
    return true
  }
  if (a.progress === null || b.progress === null) return a.progress !== b.progress
  return Math.abs(a.progress - b.progress) > 0.01
}

/** 네 귀의 작은 꺾쇠 장식 */
function corners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const s = 26
  ctx.strokeStyle = 'rgba(224, 199, 106, .55)'
  ctx.lineWidth = 2
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(cx + sx * s, cy)
    ctx.lineTo(cx + sx * 8, cy)
    ctx.lineTo(cx, cy + sy * 8)
    ctx.lineTo(cx, cy + sy * s)
    ctx.stroke()
  }
}

/** 가운데에 마름모를 둔 장식 괘선 */
function divider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const mid = x + w / 2
  ctx.strokeStyle = 'rgba(224, 199, 106, .3)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(mid - 26, y)
  ctx.moveTo(mid + 26, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.fillStyle = 'rgba(224, 199, 106, .55)'
  ctx.beginPath()
  ctx.moveTo(mid, y - 7)
  ctx.lineTo(mid + 9, y)
  ctx.lineTo(mid, y + 7)
  ctx.lineTo(mid - 9, y)
  ctx.closePath()
  ctx.fill()
}

/** 그랜드 피아노 선화 — 위에서 본 윤곽과 건반 */
function pianoLineArt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const h = w * 0.62
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = 'rgba(224, 199, 106, .45)'
  ctx.lineWidth = 2.2
  // 위에서 본 그랜드 피아노 — 왼쪽은 곧고 오른쪽만 둥글게 부푼다.
  ctx.beginPath()
  ctx.moveTo(w * 0.1, h * 0.82)
  ctx.lineTo(w * 0.1, h * 0.16)
  ctx.lineTo(w * 0.56, h * 0.16)
  ctx.bezierCurveTo(w * 0.9, h * 0.18, w * 0.96, h * 0.5, w * 0.74, h * 0.72)
  ctx.bezierCurveTo(w * 0.66, h * 0.8, w * 0.6, h * 0.82, w * 0.52, h * 0.82)
  ctx.closePath()
  ctx.stroke()
  // 건반
  ctx.beginPath()
  ctx.rect(w * 0.1, h * 0.82, w * 0.42, h * 0.13)
  ctx.stroke()
  ctx.lineWidth = 1
  for (let i = 1; i < 10; i++) {
    const kx = w * 0.1 + (w * 0.42 * i) / 10
    ctx.beginPath()
    ctx.moveTo(kx, h * 0.82)
    ctx.lineTo(kx, h * 0.95)
    ctx.stroke()
  }
  ctx.restore()
}

/** 긴 줄을 폭에 맞춰 자른다. 넘치면 마지막 줄에 말줄임을 붙인다. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  font: string,
  maxLines: number,
): void {
  ctx.font = font
  if (!text) return
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

  for (let i = 0; i < lines.length; i++) {
    let out = lines[i] as string
    if (i === maxLines - 1 && ctx.measureText(out).width > maxWidth) {
      while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
      out = `${out}…`
    }
    ctx.fillText(out, x, y + i * lineHeight)
  }
}
