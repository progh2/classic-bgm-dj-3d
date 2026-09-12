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
import { BoxGeometry } from 'three'

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
  /** 재생 중이면 참 — 표시등에 쓴다 */
  playing: boolean
}

export interface Screen {
  readonly root: Group
  set(content: ScreenContent): void
}

const W = 1280
const H = 720
const FONT = '"Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif'

export function createScreen(): Screen {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter

  const root = new Group()

  // 황동 테두리 액자
  const frame = new Mesh(
    new BoxGeometry(2.52, 1.48, 0.06),
    new MeshStandardMaterial({ color: 0x6b5320, roughness: 0.42, metalness: 0.75 }),
  )
  frame.castShadow = true
  root.add(frame)

  // 화면은 스스로 빛나야 하므로 조명을 받지 않는 재질을 쓴다.
  const panel = new Mesh(new PlaneGeometry(2.36, 1.32), new MeshBasicMaterial({ map: texture }))
  panel.position.z = 0.032
  root.add(panel)

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

    ctx.strokeStyle = 'rgba(224, 199, 106, .45)'
    ctx.lineWidth = 3
    ctx.strokeRect(26, 26, W - 52, H - 52)

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

    // 진행 막대
    const barY = 470
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

    if (c.notice) {
      ctx.fillStyle = '#e6b98a'
      wrap(ctx, c.notice, 72, 590, W - 144, 40, `400 30px ${FONT}`, 2)
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
    playing: false,
  })

  return {
    root,
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
    a.playing !== b.playing ||
    a.elapsed !== b.elapsed ||
    a.duration !== b.duration
  ) {
    return true
  }
  if (a.progress === null || b.progress === null) return a.progress !== b.progress
  return Math.abs(a.progress - b.progress) > 0.01
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
