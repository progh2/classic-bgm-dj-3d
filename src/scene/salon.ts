import {
  AmbientLight,
  Object3D,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Vector2,
  Vector3,
  Scene,
  SpotLight,
  Texture,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  WebGLRenderer,
} from 'three'

import { createFurnishings, type Furnishings } from './furnishings'
import { BACK_Z, createRoom, WALL_X, type Room } from './room'
import { createBooks, type Books } from './books'
import { createHud3D, type Hud3D } from './hud3d'
import type { Panel } from './panel'
import { createTabletop, type Tabletop } from './tabletop'
import { createScreen, type Screen } from './screen'
import { createTurntable, type Turntable } from './turntable'

export interface Salon {
  /** 한 프레임 갱신. deltaSec 는 마지막 프레임과의 간격. */
  tick(nowMs: number, deltaSec: number): void
  resize(): void
  /** 응접실에 물건이나 사람을 놓는다. */
  add(object: Object3D): void
  /** 콘솔 테이블 모델이 도착하면 임시 상판을 치운다. */
  removePlaceholderTable(): void
  /** 환경광을 입힌다. 놋쇠와 목재가 반사할 대상이 생긴다. */
  applyEnvironment(texture: Texture): void
  /** 집사가 바라볼 대상. 카메라 앞에 둔 빈 오브젝트다. */
  readonly viewerAnchor: Object3D
  /** 집사 뒤에 걸린 안내판 */
  readonly screen: Screen
  /** 테이블 위의 레코드 재생기 */
  readonly turntable: Turntable
  /** 응접실의 방 자체 */
  readonly room: Room
  /** 테이블 위의 정물 */
  readonly tabletop: Tabletop
  /** 3D 안의 조작부 */
  readonly hud: Hud3D
  /** 방을 채우는 가구들 */
  readonly furnishings: Furnishings
  /** 프로그램북과 출처 안내서 */
  readonly books: Books
  /** 누를 수 있는 판을 장면에 더한다. 레이캐스트 대상이 된다. */
  addPanel(panel: Panel, pick: (id: string) => void): void
  /** 조작할 수 있는 거리로 다가간다. 집사가 자리를 잡은 뒤에 부른다. */
  moveIn(): void
  dispose(): void
}

/** WebGL 초기화 실패를 호출부에서 구분할 수 있게 던지는 오류. */
/** 상판 높이(m). 집사의 손이 이 뒤로 가려지도록 원래 콘솔보다 높게 잡는다. */
export const TABLE_TOP = 1.14

/** 구도를 옮길 때 쓰는 임시 벡터. 매 프레임 새로 만들지 않는다. */
const TARGET_POS = new Vector3()
/** 조작판이 서 있는 z. 여기서 화면에 담기는 폭을 재 조작판 크기를 맞춘다. */
const TABLE_FRONT_Z = 0.5

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL 을 초기화할 수 없습니다')
    this.name = 'WebGLUnavailableError'
    this.cause = cause
  }
}

/**
 * 응접실의 테이블과 조명만 세운 1차 장면.
 * 소품·VRM 집사는 단계 2에서 이 그룹 위에 올린다.
 */
export function createSalon(host: HTMLElement): Salon {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } catch (err) {
    throw new WebGLUnavailableError(err)
  }

  // 4K 출력과 devicePixelRatio 를 무제한 추종하지 않는다 (PRD 8. 큰 화면).
  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  // 선형 출력은 촛불 같은 밝은 부분이 하얗게 뭉친다. 필름 톤매핑으로 눌러 준다.
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.outputColorSpace = SRGBColorSpace
  host.appendChild(renderer.domElement)

  // 누를 수 있는 판과 그 판의 처리기. 조작판과 책자가 여기에 등록한다.
  const pickable: { panel: Panel; pick: (id: string) => void }[] = []

  const scene = new Scene()
  scene.background = new Color(0x17110c)
  scene.fog = new Fog(0x17110c, 8, 20)

  const camera = new PerspectiveCamera(38, 1, 0.1, 60)

  /**
   * 구도는 두 단계다. 처음에는 방을 넓게 보여 주고(wide), 집사가 자리를 잡으면
   * 조작할 수 있는 거리(close)로 다가간다. 두 구도 모두 화면 비율에 맞춰 거리를
   * 다시 계산한다. 세로로 긴 휴대폰에서 옆이 잘려 단추를 누를 수 없던 문제가
   * 여기서 생겼다.
   */
  const SHOTS = {
    wide: { at: new Vector3(0.1, 1.5, -0.8), box: { w: 4.6, h: 2.9 } },
    close: { at: new Vector3(0.12, 1.38, -0.55), box: { w: 3.2, h: 2.0 } },
  } as const
  type ShotName = keyof typeof SHOTS

  let shot: ShotName = 'wide'
  /** 구도를 옮기는 중이면 0~1 로 진행한다. 끝나면 null. */
  let shotMove: { from: Vector3; fromAt: Vector3; t: number } | null = null
  const camAt = SHOTS.wide.at.clone()

  /**
   * 그 구도를 담으려면 카메라가 어디에 서야 하는가.
   *
   * 세로로 긴 화면에서 가로를 다 담으려 하면 카메라가 방 밖까지 물러난다.
   * (비율 0.5 에서는 9m 가 나왔다.) 그래서 물러나는 거리에 상한을 두고,
   * 좁아서 못 담는 가로는 조작판을 줄여 맞춘다.
   */
  const MAX_BACK = 4.3
  const placeFor = (name: ShotName, out: Vector3): Vector3 => {
    const s = SHOTS[name]
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const d = Math.min(
      MAX_BACK,
      Math.max(s.box.w / 2 / (half * camera.aspect), s.box.h / 2 / half),
    )
    // 상판이 보이도록 거리에 비례해 눈높이를 올린다.
    return out.set(s.at.x, s.at.y + d * 0.19, s.at.z + d)
  }

  /** 어떤 z 평면에서 화면에 담기는 가로 폭(m) */
  const visibleWidthAt = (z: number): number => {
    const half = Math.tan((camera.fov * Math.PI) / 360)
    return 2 * Math.abs(camera.position.z - z) * half * camera.aspect
  }

  const applyShot = (): void => {
    if (shotMove) return
    placeFor(shot, camera.position)
    camAt.copy(SHOTS[shot].at)
    camera.lookAt(camAt)
    hud.fitWidth(visibleWidthAt(TABLE_FRONT_Z))
  }

  // 콘솔 테이블 모델이 도착하기 전까지 세워 두는 임시 상판.
  const table = new Group()
  table.name = 'placeholder-table'
  const topMat = new MeshStandardMaterial({ color: 0x4a2a1b, roughness: 0.42, metalness: 0.08 })
  const top = new Mesh(new BoxGeometry(2.2, 0.07, 1.15), topMat)
  top.position.y = 0.78
  top.castShadow = true
  top.receiveShadow = true
  table.add(top)

  const legMat = new MeshStandardMaterial({ color: 0x351d13, roughness: 0.55 })
  for (const [x, z] of [
    [-0.95, -0.45],
    [0.95, -0.45],
    [-0.95, 0.45],
    [0.95, 0.45],
  ] as const) {
    const leg = new Mesh(new CylinderGeometry(0.05, 0.06, 0.75, 12), legMat)
    leg.position.set(x, 0.38, z)
    leg.castShadow = true
    table.add(leg)
  }
  scene.add(table)

  const room = createRoom()
  scene.add(room.root)

  const furnishings = createFurnishings(BACK_Z, WALL_X)
  scene.add(furnishings.root)

  scene.add(new AmbientLight(0xffd9a8, 0.26))

  // 키 — 왼쪽 위에서 내려오는 따뜻한 빛. 그림자를 만드는 주광원이다.
  const key = new SpotLight(0xffd2a1, 20, 10, Math.PI / 4.4, 0.5, 1.5)
  key.position.set(-1.15, 2.6, 1.35)
  key.target.position.set(0, 1.0, -0.4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0012
  key.shadow.normalBias = 0.02
  scene.add(key, key.target)

  // 림 — 뒤 오른쪽에서 오는 서늘한 빛. 집사의 윤곽을 배경에서 떼어낸다.
  const rim = new SpotLight(0xbcd2ff, 10, 9, Math.PI / 4.5, 0.7, 1.4)
  rim.position.set(1.9, 2.5, -2.1)
  rim.target.position.set(0, 1.35, -1.05)
  scene.add(rim, rim.target)

  // 필 — 정면 아래에서 아주 약하게. 얼굴 그늘이 까맣게 막히지 않도록.
  const fill = new PointLight(0xffe6c8, 2.4, 7, 1.8)
  fill.position.set(0.4, 1.5, 2.2)
  scene.add(fill)

  const candle = new PointLight(0xffb469, 2.6, 3.6, 2)
  candle.position.set(0.78, TABLE_TOP + 0.12, 0.28)
  scene.add(candle)



  // 집사가 이쪽을 보게 할 기준점. 카메라보다 살짝 아래에 둬야 눈이 마주친다.
  const viewerAnchor = new Object3D()
  const HOME = new Vector3(0, 1.46, 2.1)
  viewerAnchor.position.copy(HOME)
  scene.add(viewerAnchor)

  // 마우스·손가락이 가리키는 곳을 집사가 본다. 포인터가 없으면 정면으로 돌아온다.
  const wanted = HOME.clone()
  const ndc = new Vector2()
  const pointerPlane = new Vector3()

  const aimAt = (clientX: number, clientY: number): void => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    // 카메라 앞 일정 거리의 평면 위로 옮긴다. 그 점을 집사가 본다.
    pointerPlane.set(ndc.x, ndc.y, 0.5).unproject(camera)
    pointerPlane.sub(camera.position).normalize()
    wanted.copy(camera.position).addScaledVector(pointerPlane, 2.1)
  }

  // 조작판 누르기 — 판을 가리킨 지점을 캔버스 좌표로 되돌려 어느 칸인지 가린다.
  const raycaster = new Raycaster()
  const pickAt = (
    clientX: number,
    clientY: number,
  ): { panel: Panel; id: string; pick: (id: string) => void } | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const live = pickable.filter((p) => p.panel.visible)
    for (const hit of raycaster.intersectObjects(live.map((p) => p.panel.mesh), false)) {
      const found = live.find((p) => p.panel.mesh === hit.object)
      if (!found || !hit.uv) continue
      const id = found.panel.hitTest(hit.uv)
      if (id) return { panel: found.panel, id, pick: found.pick }
    }
    return null
  }

  const clearHover = (): void => {
    for (const p of pickable) p.panel.setHover(null)
  }

  const onPointerMove = (e: PointerEvent): void => {
    aimAt(e.clientX, e.clientY)
    const found = pickAt(e.clientX, e.clientY)
    clearHover()
    if (found) found.panel.setHover(found.id)
    renderer.domElement.style.cursor = found ? 'pointer' : 'default'
  }

  const onPointerDown = (e: PointerEvent): void => {
    const found = pickAt(e.clientX, e.clientY)
    if (found) found.pick(found.id)
  }
  window.addEventListener('pointerdown', onPointerDown)
  const onPointerLeave = (): void => {
    wanted.copy(HOME)
    clearHover()
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('blur', onPointerLeave)

  // 집사 뒤 안내판 — 지금 흐르는 곡을 여기에 띄운다.
  const screen = createScreen()
  // 안내판은 뒷벽에 건다. 벽에서 떠 있으면 허공에 뜬 판때기로 보인다.
  screen.root.position.set(0, 1.78, BACK_Z + 0.07)
  scene.add(screen.root)

  // 테이블 위의 물건들. 상판 높이에 맞춰 한 묶음으로 올린다.
  const turntable = createTurntable()
  turntable.root.position.set(-0.33, 0, 0.11)
  turntable.root.rotation.y = 0.22

  const tabletop = createTabletop()
  const books = createBooks()

  const hud = createHud3D()
  for (const panel of hud.panels) pickable.push({ panel, pick: (id) => hud.pick(id) })

  const onTable = new Group()
  onTable.position.y = TABLE_TOP
  onTable.add(turntable.root, tabletop.root, books.root, hud.root)
  scene.add(onTable)

  const resize = (): void => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // 세로로 긴 화면에서는 위아래로 더 담아야 옆이 덜 잘린다.
    camera.fov = camera.aspect < 1 ? 46 : 38
    camera.updateProjectionMatrix()
    hud.setCompact(camera.aspect < 1.05)
    applyShot()
  }
  resize()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const goTo = (name: ShotName): void => {
    if (shot === name) return
    shot = name
    if (reduceMotion) {
      shotMove = null
      applyShot()
      return
    }
    shotMove = { from: camera.position.clone(), fromAt: camAt.clone(), t: 0 }
  }

  return {
    viewerAnchor,
    screen,
    turntable,
    room,
    tabletop,
    hud,
    furnishings,
    books,
    addPanel(panel, pick) {
      pickable.push({ panel, pick })
    },
    moveIn() {
      goTo('close')
    },
    add(object) {
      scene.add(object)
    },
    removePlaceholderTable() {
      scene.remove(table)
    },
    applyEnvironment(texture) {
      const pmrem = new PMREMGenerator(renderer)
      // 배경으로 그리지는 않는다. 반사와 간접광에만 쓴다.
      scene.environment = pmrem.fromEquirectangular(texture).texture
      scene.environmentIntensity = 0.5
      pmrem.dispose()
      texture.dispose()
    },
    tick(nowMs, deltaSec) {
      if (shotMove) {
        // 집사가 걸어 들어오는 동안 천천히 다가간다.
        shotMove.t = Math.min(1, shotMove.t + deltaSec / 5)
        // 부드럽게 들어가고 부드럽게 멈춘다.
        const e = shotMove.t < 0.5
          ? 4 * shotMove.t ** 3
          : 1 - (-2 * shotMove.t + 2) ** 3 / 2
        placeFor(shot, TARGET_POS)
        camera.position.lerpVectors(shotMove.from, TARGET_POS, e)
        camAt.lerpVectors(shotMove.fromAt, SHOTS[shot].at, e)
        camera.lookAt(camAt)
        hud.fitWidth(visibleWidthAt(TABLE_FRONT_Z))
        if (shotMove.t >= 1) shotMove = null
      }
      // 촛불의 미세한 흔들림. 모션 줄이기에서는 고정한다.
      candle.intensity = reduceMotion ? 2.2 : 2.2 + Math.sin(nowMs / 240) * 0.18
      // 시선은 조금 늦게 따라온다. 그래야 눈이 홱홱 돌지 않는다.
      viewerAnchor.position.lerp(wanted, Math.min(1, deltaSec * 4))
      turntable.tick(deltaSec)
      renderer.render(scene, camera)
    },
    resize,
    dispose() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('blur', onPointerLeave)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
