import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SpotLight,
  TextureLoader,
  SRGBColorSpace,
  Vector2,
} from 'three'

/**
 * 방을 채우는 것들 — 창과 커튼, LP 책장, 흉상, 액자, 그랜드 피아노.
 *
 * 전부 기본 도형으로 세운다. 이 정도 거리와 조도에서는 실루엣과 색이
 * 형태보다 크게 읽히고, 내려받을 모델을 늘리지 않아도 된다.
 */

const WOOD_DARK = 0x2a1a0e
const WOOD = 0x3d2614
const BRASS = 0x8a6a1e

export interface Artwork {
  title: string
  artist: string
  imageUrl: string
}

export interface Furnishings {
  readonly root: Group
  /** 창으로 드는 빛의 세기와 빛깔을 바꾼다. 0 은 한밤, 1 은 한낮. */
  setDaylight(amount: number, colour: number): void
  /** 벽의 액자에 그림을 건다. 실패한 액자는 그리던 그림을 그대로 둔다. */
  hangArtworks(list: readonly Artwork[]): Promise<void>
}

export function createFurnishings(backZ: number, wallX: number): Furnishings {
  const root = new Group()

  const woodDark = new MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.72, metalness: 0.04 })
  const wood = new MeshStandardMaterial({ color: WOOD, roughness: 0.6, metalness: 0.05 })
  const brass = new MeshStandardMaterial({ color: BRASS, roughness: 0.34, metalness: 0.8 })
  const velvet = new MeshStandardMaterial({ color: 0x6b1a1c, roughness: 0.95, metalness: 0 })
  const marble = new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.42, metalness: 0.02 })

  // ---- 왼쪽 벽: 창과 커튼 ----
  const window = new Group()
  window.position.set(-wallX + 0.06, 1.5, backZ + 1.35)
  window.rotation.y = Math.PI / 2

  const glassGlow = new Mesh(
    new PlaneGeometry(1.5, 2.0),
    new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 }),
  )
  window.add(glassGlow)

  // 창살
  const bar = (w: number, h: number, x: number, y: number): void => {
    const m = new Mesh(new BoxGeometry(w, h, 0.05), woodDark)
    m.position.set(x, y, 0.03)
    window.add(m)
  }
  bar(1.62, 0.08, 0, 1.04)
  bar(1.62, 0.08, 0, -1.04)
  bar(0.08, 2.16, -0.79, 0)
  bar(0.08, 2.16, 0.79, 0)
  bar(0.05, 2.0, 0, 0)
  bar(1.5, 0.05, 0, 0.34)
  bar(1.5, 0.05, 0, -0.34)
  root.add(window)

  // 창으로 드는 빛. RectAreaLight 는 별도 초기화가 필요해 스포트로 대신한다.
  const daylight = new SpotLight(0xffd9a0, 9, 9, Math.PI / 3.4, 0.85, 1.4)
  daylight.position.set(-wallX + 0.2, 1.9, backZ + 1.35)
  daylight.target.position.set(wallX * 0.4, 0.4, backZ + 3.2)
  root.add(daylight, daylight.target)

  // 커튼 — 주름진 천을 세로 판 여러 장으로 흉내낸다
  for (const side of [-1, 1] as const) {
    const curtain = new Group()
    curtain.position.set(-wallX + 0.12, 1.5, backZ + 1.35 + side * 0.92)
    curtain.rotation.y = Math.PI / 2
    for (let i = 0; i < 5; i++) {
      const fold = new Mesh(new BoxGeometry(0.11, 2.5, 0.06), velvet)
      fold.position.set(side * (i * 0.1 - 0.2), 0, Math.sin(i * 1.4) * 0.04)
      fold.rotation.z = side * 0.012 * i
      fold.castShadow = true
      curtain.add(fold)
    }
    root.add(curtain)
  }
  const rod = new Mesh(new CylinderGeometry(0.022, 0.022, 2.9, 12), brass)
  rod.rotation.x = Math.PI / 2
  rod.position.set(-wallX + 0.16, 2.78, backZ + 1.35)
  root.add(rod)

  // ---- 왼쪽 벽: LP 책장 ----
  const shelf = new Group()
  shelf.position.set(-wallX + 0.3, 0, backZ + 3.5)
  shelf.rotation.y = Math.PI / 2

  const CASE_W = 1.7
  const CASE_H = 1.25
  const CASE_D = 0.42
  const carcass = new Mesh(new BoxGeometry(CASE_W, CASE_H, CASE_D), woodDark)
  carcass.position.y = CASE_H / 2
  carcass.castShadow = true
  carcass.receiveShadow = true
  shelf.add(carcass)

  // 칸마다 LP 를 빼곡히 꽂는다. 색과 두께를 조금씩 달리해야 줄이 살아난다.
  const lpColours = [0x2a2420, 0x4a2a1c, 0x24303a, 0x3a2436, 0x5a4a2a, 0x1e2a26]
  for (const rowY of [0.34, 0.86] as const) {
    let x = -CASE_W / 2 + 0.08
    while (x < CASE_W / 2 - 0.1) {
      const t = 0.008 + Math.random() * 0.012
      const lp = new Mesh(
        new BoxGeometry(t, 0.3 + Math.random() * 0.02, 0.3),
        new MeshStandardMaterial({
          color: lpColours[Math.floor(Math.random() * lpColours.length)] ?? 0x2a2420,
          roughness: 0.85,
        }),
      )
      lp.position.set(x, rowY, 0.03)
      lp.rotation.z = (Math.random() - 0.5) * 0.04
      shelf.add(lp)
      x += t + 0.003
    }
    const board = new Mesh(new BoxGeometry(CASE_W - 0.04, 0.03, CASE_D - 0.04), wood)
    board.position.y = rowY - 0.17
    shelf.add(board)
  }
  root.add(shelf)

  // 책장 위 초록 갓 램프
  const lamp = new Group()
  lamp.position.set(-wallX + 0.3, CASE_H, backZ + 3.5)
  const lampBase = new Mesh(new CylinderGeometry(0.07, 0.085, 0.03, 20), brass)
  lamp.add(lampBase)
  const lampStem = new Mesh(new CylinderGeometry(0.012, 0.012, 0.2, 12), brass)
  lampStem.position.y = 0.11
  lamp.add(lampStem)
  const shade = new Mesh(
    new LatheGeometry(
      [new Vector2(0.001, 0.09), new Vector2(0.09, 0.075), new Vector2(0.115, 0.0)],
      20,
    ),
    new MeshStandardMaterial({ color: 0x1e5c3a, roughness: 0.4, metalness: 0.1, side: DoubleSide }),
  )
  shade.position.y = 0.21
  lamp.add(shade)
  const lampGlow = new PointLight(0xffe0a8, 1.6, 1.6, 2)
  lampGlow.position.y = 0.18
  lamp.add(lampGlow)
  root.add(lamp)

  // ---- 왼쪽 뒤: 흉상과 받침 ----
  const bust = new Group()
  bust.position.set(-wallX + 0.55, 0, backZ + 0.55)
  const column = new Mesh(new CylinderGeometry(0.16, 0.19, 1.05, 20), woodDark)
  column.position.y = 0.525
  column.castShadow = true
  bust.add(column)
  const cap = new Mesh(new BoxGeometry(0.42, 0.05, 0.42), wood)
  cap.position.y = 1.075
  bust.add(cap)
  // 흉상 — 어깨, 목, 머리, 뒤로 넘긴 머리칼
  const shoulders = new Mesh(
    new LatheGeometry(
      [new Vector2(0.001, 0.3), new Vector2(0.1, 0.27), new Vector2(0.17, 0.12), new Vector2(0.19, 0)],
      20,
    ),
    marble,
  )
  shoulders.position.y = 1.1
  shoulders.castShadow = true
  bust.add(shoulders)
  const head = new Mesh(new SphereGeometry(0.105, 20, 16), marble)
  head.scale.set(0.92, 1.12, 1)
  head.position.set(0, 1.47, 0.01)
  head.castShadow = true
  bust.add(head)
  const hair = new Mesh(new SphereGeometry(0.118, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), marble)
  hair.scale.set(1, 0.95, 1.05)
  hair.position.set(0, 1.5, -0.012)
  bust.add(hair)
  root.add(bust)

  // ---- 오른쪽 벽: 작곡가 액자 ----
  const portraitTexture = makePortraitTexture()
  /** 액자마다 그림을 갈아 끼울 수 있도록 재질과 크기를 들고 있는다. */
  const frames: { material: MeshStandardMaterial; canvas: Mesh; box: { w: number; h: number } }[] = []

  for (const [i, y, h] of [
    [0, 1.95, 0.62],
    [1, 1.22, 0.62],
    [2, 1.95, 0.46],
  ] as const) {
    const frame = new Group()
    frame.position.set(wallX - 0.06, y, backZ + 0.9 + i * 0.95)
    frame.rotation.y = -Math.PI / 2
    const w = h * 0.78
    const outer = new Mesh(new BoxGeometry(w + 0.09, h + 0.09, 0.05), brass)
    frame.add(outer)
    const material = new MeshStandardMaterial({ map: portraitTexture, roughness: 0.9 })
    const canvasMesh = new Mesh(new PlaneGeometry(1, 1), material)
    canvasMesh.scale.set(w, h, 1)
    canvasMesh.position.z = 0.028
    frame.add(canvasMesh)
    root.add(frame)
    frames.push({ material, canvas: canvasMesh, box: { w, h } })
  }

  // ---- 오른쪽 뒤: 나팔 축음기 ----
  // 그랜드 피아노를 세워 봤지만 이 거리에서는 검은 덩어리로만 보였다.
  // 나팔이 달린 축음기는 실루엣만으로 무엇인지 바로 읽힌다.
  const stand = new Group()
  stand.position.set(wallX - 0.85, 0, backZ + 1.5)
  stand.rotation.y = -0.5

  const standTop = new Mesh(new BoxGeometry(0.62, 0.05, 0.5), wood)
  standTop.position.y = 0.78
  standTop.castShadow = true
  stand.add(standTop)
  for (const [lx, lz] of [
    [-0.25, -0.19],
    [0.25, -0.19],
    [-0.25, 0.19],
    [0.25, 0.19],
  ] as const) {
    const leg = new Mesh(new CylinderGeometry(0.022, 0.028, 0.78, 12), woodDark)
    leg.position.set(lx, 0.39, lz)
    stand.add(leg)
  }

  const box = new Mesh(new BoxGeometry(0.4, 0.14, 0.34), woodDark)
  box.position.y = 0.875
  box.castShadow = true
  stand.add(box)
  const platter = new Mesh(new CylinderGeometry(0.14, 0.14, 0.012, 32), brass)
  platter.position.y = 0.951
  stand.add(platter)
  const disc = new Mesh(
    new CylinderGeometry(0.132, 0.132, 0.004, 40),
    new MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.35 }),
  )
  disc.position.y = 0.959
  stand.add(disc)

  // 나팔 — 아래에서 위로 벌어지는 원뿔
  const horn = new Mesh(
    new LatheGeometry(
      [
        new Vector2(0.012, 0),
        new Vector2(0.03, 0.1),
        new Vector2(0.075, 0.21),
        new Vector2(0.16, 0.31),
        new Vector2(0.235, 0.36),
      ],
      28,
      0,
      Math.PI * 2,
    ),
    new MeshStandardMaterial({ color: BRASS, roughness: 0.3, metalness: 0.82, side: DoubleSide }),
  )
  horn.position.set(0.02, 0.97, -0.04)
  horn.rotation.x = 0.42
  horn.castShadow = true
  stand.add(horn)

  const arm = new Mesh(new CylinderGeometry(0.008, 0.008, 0.22, 10), brass)
  arm.position.set(0.06, 0.985, 0.06)
  arm.rotation.z = Math.PI / 2.6
  stand.add(arm)

  const crank = new Mesh(new CylinderGeometry(0.007, 0.007, 0.13, 10), brass)
  crank.position.set(-0.22, 0.9, 0.06)
  crank.rotation.z = Math.PI / 2
  stand.add(crank)
  root.add(stand)

  const cornerLight = new PointLight(0xffdca8, 1.0, 2.6, 2)
  cornerLight.position.set(wallX - 0.9, 1.35, backZ + 1.5)
  root.add(cornerLight)

  const loader = new TextureLoader()
  loader.setCrossOrigin('anonymous')

  return {
    root,

    setDaylight(amount, colour) {
      const a = Math.min(1, Math.max(0, amount))
      daylight.intensity = 9 * a
      daylight.color.setHex(colour)
      const glass = glassGlow.material as MeshBasicMaterial
      glass.color.setHex(colour)
      // 한밤에도 창이 완전히 죽지는 않는다. 바깥의 먼 불빛이 남는다.
      glass.opacity = 0.12 + 0.72 * a
    },

    async hangArtworks(list) {
      await Promise.all(
        frames.map(async (frame, i) => {
          const art = list[i % Math.max(1, list.length)]
          if (!art) return
          try {
            const texture = await loader.loadAsync(art.imageUrl)
            texture.colorSpace = SRGBColorSpace
            // 그림의 비율을 지키면서 액자 안에 들어가게 맞춘다.
            const image = texture.image as { width: number; height: number }
            const ratio = image.width / image.height
            const box = frame.box
            const w = Math.min(box.w, box.h * ratio)
            frame.canvas.scale.set(w, w / ratio, 1)
            frame.material.map = texture
            frame.material.needsUpdate = true
          } catch {
            // 못 받으면 그리던 그림을 그대로 둔다.
          }
        }),
      )
    },
  }
}

/** 액자 속 그림 — 세피아 톤의 흉상 실루엣. 멀리서 초상으로 읽히면 충분하다. */
function makePortraitTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 328
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
    g.addColorStop(0, '#4a3a26')
    g.addColorStop(1, '#221812')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = 'rgba(226, 208, 176, .5)'
    // 어깨
    ctx.beginPath()
    ctx.ellipse(128, 300, 92, 74, 0, Math.PI, 0)
    ctx.fill()
    // 머리
    ctx.beginPath()
    ctx.ellipse(128, 180, 52, 64, 0, 0, Math.PI * 2)
    ctx.fill()
    // 머리칼
    ctx.fillStyle = 'rgba(120, 96, 68, .55)'
    ctx.beginPath()
    ctx.ellipse(128, 152, 62, 48, 0, Math.PI, 0)
    ctx.fill()

    // 캔버스의 낡은 기운
    ctx.fillStyle = 'rgba(0, 0, 0, .25)'
    for (let i = 0; i < 260; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1.5, 1.5)
    }
  }
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}
