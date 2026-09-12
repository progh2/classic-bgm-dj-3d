import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Vector2,
} from 'three'

/**
 * 3D 안의 조작판. 캔버스에 그려 판에 붙이고, 판을 가리킨 지점을 캔버스 좌표로
 * 되돌려 어느 칸을 눌렀는지 가린다.
 *
 * 화면 앞에 2D 를 덮지 않기 위한 장치다. 대신 화면 낭독기와 키보드를 위해
 * 같은 기능의 감춰진 단추를 DOM 에 따로 둔다(index.html 의 sr-only).
 */

export interface Region {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  hovered: string | null,
) => Region[]

export interface Panel {
  readonly mesh: Mesh
  /** 내용과 누를 수 있는 칸을 다시 그린다. */
  draw(fn: DrawFn): void
  setVisible(visible: boolean): void
  readonly visible: boolean
  /** 판 위의 uv 좌표에 있는 칸의 id. 없으면 null. */
  hitTest(uv: Vector2): string | null
  /** 가리키고 있는 칸을 바꾼다. 바뀌면 다시 그린다. */
  setHover(id: string | null): void
}

export interface PanelOptions {
  /** 3D 에서의 크기(m) */
  width: number
  height: number
  /** 캔버스 해상도. 글자가 흐려지지 않도록 넉넉히 준다. */
  canvasWidth: number
}

export function createPanel(o: PanelOptions): Panel {
  const canvas = document.createElement('canvas')
  canvas.width = o.canvasWidth
  canvas.height = Math.round((o.canvasWidth * o.height) / o.width)
  const ctx = canvas.getContext('2d')

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 8

  const mesh = new Mesh(
    new PlaneGeometry(o.width, o.height),
    new MeshBasicMaterial({ map: texture, transparent: true }),
  )
  mesh.renderOrder = 10

  let regions: Region[] = []
  let hovered: string | null = null
  let lastDraw: DrawFn | null = null

  const render = (): void => {
    if (!ctx || !lastDraw) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    regions = lastDraw(ctx, { w: canvas.width, h: canvas.height }, hovered)
    texture.needsUpdate = true
  }

  return {
    mesh,

    draw(fn) {
      lastDraw = fn
      render()
    },

    setVisible(visible) {
      mesh.visible = visible
    },

    get visible() {
      return mesh.visible
    },

    hitTest(uv) {
      // uv 는 좌하단이 (0,0) 이고 캔버스는 좌상단이 (0,0) 이다.
      const x = uv.x * canvas.width
      const y = (1 - uv.y) * canvas.height
      for (const r of regions) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id
      }
      return null
    },

    setHover(id) {
      if (hovered === id) return
      hovered = id
      render()
    },
  }
}

/** 조작판의 공통 서식 — 옻칠한 판에 황동 테. */
export const PLATE = {
  font: '"Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif',
  ink: '#f4ece0',
  inkDim: '#bfae95',
  brass: '#c9a227',
  brassSoft: '#e0c76a',
}

/** 모서리를 둥글린 사각형 경로 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 판 바탕 — 짙은 판에 황동 테두리 */
export function plateBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opacity = 0.9,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, `rgba(34, 22, 15, ${opacity})`)
  g.addColorStop(1, `rgba(18, 12, 8, ${opacity})`)
  ctx.fillStyle = g
  roundRect(ctx, 3, 3, w - 6, h - 6, 14)
  ctx.fill()
  ctx.strokeStyle = 'rgba(201, 162, 39, .5)'
  ctx.lineWidth = 3
  ctx.stroke()
}

/** 단추 한 칸 */
export function plateButton(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  state: { hovered: boolean; primary?: boolean; disabled?: boolean },
): void {
  roundRect(ctx, x, y, w, h, 8)
  if (state.primary) {
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, state.hovered ? '#f0dc95' : '#e0c76a')
    g.addColorStop(1, state.hovered ? '#d8b445' : '#c9a227')
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = state.hovered ? 'rgba(201, 162, 39, .22)' : 'rgba(90, 60, 36, .5)'
  }
  ctx.fill()
  ctx.strokeStyle = state.hovered ? PLATE.brassSoft : 'rgba(201, 162, 39, .45)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = state.disabled
    ? 'rgba(244, 236, 224, .35)'
    : state.primary
      ? '#2b1c05'
      : PLATE.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + w / 2, y + h / 2 + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
