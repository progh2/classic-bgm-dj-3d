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
import type { Panel } from './panel'
import { createPiano, type Piano } from './piano'
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
  /** 방을 채우는 가구들 */
  readonly furnishings: Furnishings
  /** 프로그램북과 출처 안내서 */
  readonly books: Books
  /** 그랜드 피아노와 의자 */
  readonly piano: Piano
  /** 누를 수 있는 판을 장면에 더한다. 레이캐스트 대상이 된다. */
  addPanel(panel: Panel, pick: (id: string) => void): void
  /** 구도를 옮긴다. seconds 를 주면 그 시간에 걸쳐 움직인다. */
  lookAt(shot: 'wide' | 'door' | 'close' | 'piano', seconds?: number): void
  dispose(): void
}

/** WebGL 초기화 실패를 호출부에서 구분할 수 있게 던지는 오류. */
/**
 * 상판 높이(m). 원래 콘솔은 0.95m 인데, 손을 가리려고 1.14m 까지 키웠더니
 * 폭이 1.85m 가 되어 사람 옆에서 거대해 보였다. 실제 콘솔에 가깝게 되돌린다.
 */
export const TABLE_TOP = 1.0

/** 구도를 옮길 때 쓰는 임시 벡터. 매 프레임 새로 만들지 않는다. */
const TARGET_POS = new Vector3()
const TARGET_AT = new Vector3()

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
    // 처음에는 빈 응접실을 가운데로 본다. 발소리가 나면 오른쪽 문으로 고개를
    // 돌려 집사를 발견하고, 그가 걸어오는 동안 함께 가운데로 돌아온다.
    // 세 구도 모두 같은 자리에서 본다. 시작 연출에서 움직이는 것은 카메라가
    // 아니라 바라보는 방향이다. 사람이 고개를 돌리는 것에 가깝다.
    wide: { at: new Vector3(0, 1.6, -1.05), box: { w: 4.2, h: 2.6 } },
    door: { at: new Vector3(1.55, 1.48, -1.35), box: { w: 4.2, h: 2.6 } },
    // 집사가 피아노에 앉으면 그쪽으로 고개를 돌린다.
    piano: { at: new Vector3(-0.85, 1.42, -0.95), box: { w: 4.4, h: 2.7 } },
    close: { at: new Vector3(0, 1.58, -1.1), box: { w: 4.2, h: 2.6 } },
  } as const
  type ShotName = keyof typeof SHOTS

  /** 카메라가 서는 자리. 구도가 바뀌어도 이 자리는 움직이지 않는다. */
  const EYE = new Vector3(0, 1.56, -1.1)

  let shot: ShotName = 'wide'
  /** 구도를 옮기는 중이면 0~1 로 진행한다. 끝나면 null. */
  let shotMove: { from: Vector3; fromAt: Vector3; t: number; seconds: number } | null = null
  const camAt = SHOTS.wide.at.clone()

  /**
   * 그 구도를 담으려면 카메라가 어디에 서야 하는가.
   *
   * 세로로 긴 화면에서 가로를 다 담으려 하면 카메라가 방 밖까지 물러난다.
   * (비율 0.5 에서는 9m 가 나왔다.) 그래서 물러나는 거리에 상한을 두고,
   * 좁아서 못 담는 가로는 조작판을 줄여 맞춘다.
   */
  const MAX_BACK = 5.2
  const placeFor = (name: ShotName, out: Vector3): Vector3 => {
    const s = SHOTS[name]
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const d = Math.min(
      MAX_BACK,
      Math.max(s.box.w / 2 / (half * camera.aspect), s.box.h / 2 / half),
    )
    // 카메라는 늘 방 한가운데 앞자리에 선다. 눈높이를 많이 올리면 안내판이
    // 사다리꼴로 일그러지므로 조금만 올린다.
    return out.set(EYE.x, EYE.y + d * 0.07, EYE.z + d)
  }

  /** 어떤 z 평면에서 화면에 담기는 가로 폭(m) */
  const visibleWidthAt = (z: number): number => {
    const half = Math.tan((camera.fov * Math.PI) / 360)
    return 2 * Math.abs(camera.position.z - z) * half * camera.aspect
  }

  /**
   * 세로로 긴 화면에서는 안내판 위로 빈 벽과 천장이 넓게 남는다. 화면 윗변이
   * 안내판 윗변에 닿도록 바라보는 높이를 내려, 남는 자리를 아래쪽 테이블에 준다.
   */
  const aimHeightFor = (name: ShotName): number => {
    const base = SHOTS[name].at.y
    if (camera.aspect >= 1) return base
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const toBoard = Math.abs(camera.position.z - BACK_Z)
    const wanted = screen.topY() + 0.1 - toBoard * half
    return Math.max(0.95, Math.min(base, wanted))
  }

  const applyShot = (): void => {
    if (shotMove) return
    placeFor(shot, camera.position)
    screen.fitWidth(visibleWidthAt(BACK_Z))
    camAt.copy(SHOTS[shot].at).setY(aimHeightFor(shot))
    camera.lookAt(camAt)
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

  // 콘솔 왼쪽에 피아노를 놓는다. 피아노곡이 걸리면 집사가 여기 앉아 친다.
  // 건반이 방 가운데를 향하도록 돌려 놓는다. 그래야 앉은 집사를 옆·앞에서
  // 비스듬히 보게 되고, 등만 보이지 않는다.
  const piano = createPiano(new Vector3(-1.45, 0, -0.75), -1.35)
  scene.add(piano.root)

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
  // 가리키는 것이 없으면 보는 사람 쪽 — 곧 카메라 쪽을 본다. 손가락으로 쓰는
  // 기기에는 포인터가 없어서, 이 기본값이 곧 평소 얼굴 방향이 된다.
  const HOME = new Vector3()
  const homeFromCamera = (): Vector3 => HOME.copy(camera.position).setY(camera.position.y - 0.12)
  viewerAnchor.position.copy(homeFromCamera())
  scene.add(viewerAnchor)

  // 마우스·손가락이 가리키는 곳을 집사가 본다. 포인터가 없으면 정면으로 돌아온다.
  const wanted = HOME.clone()
  /** 포인터가 움직인 적이 있는가. 터치 기기에서는 끝까지 거짓이다. */
  let pointerSeen = false
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
    pointerSeen = true
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
    pointerSeen = false
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


  const onTable = new Group()
  onTable.position.y = TABLE_TOP
  onTable.add(turntable.root, tabletop.root, books.root)
  scene.add(onTable)

  const resize = (): void => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // 세로로 긴 화면에서는 위아래로 더 담아야 옆이 덜 잘린다.
    camera.fov = camera.aspect < 1 ? 46 : 38
    camera.updateProjectionMatrix()
    applyShot()
  }
  resize()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const goTo = (name: ShotName, seconds = 4): void => {
    if (shot === name) return
    shot = name
    if (reduceMotion) {
      shotMove = null
      applyShot()
      return
    }
    shotMove = { from: camera.position.clone(), fromAt: camAt.clone(), t: 0, seconds }
  }

  return {
    viewerAnchor,
    screen,
    turntable,
    room,
    tabletop,
    furnishings,
    books,
    piano,
    addPanel(panel, pick) {
      pickable.push({ panel, pick })
    },
    lookAt(name, seconds) {
      goTo(name, seconds)
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
        shotMove.t = Math.min(1, shotMove.t + deltaSec / shotMove.seconds)
        // 부드럽게 들어가고 부드럽게 멈춘다.
        const e = shotMove.t < 0.5
          ? 4 * shotMove.t ** 3
          : 1 - (-2 * shotMove.t + 2) ** 3 / 2
        placeFor(shot, TARGET_POS)
        camera.position.lerpVectors(shotMove.from, TARGET_POS, e)
        screen.fitWidth(visibleWidthAt(BACK_Z))
        TARGET_AT.copy(SHOTS[shot].at).setY(aimHeightFor(shot))
        camAt.lerpVectors(shotMove.fromAt, TARGET_AT, e)
        camera.lookAt(camAt)
        if (shotMove.t >= 1) shotMove = null
      }
      // 촛불의 미세한 흔들림. 모션 줄이기에서는 고정한다.
      candle.intensity = reduceMotion ? 2.2 : 2.2 + Math.sin(nowMs / 240) * 0.18
      // 가리키는 것이 없으면 정면(보는 사람)을 본다. 카메라가 움직이면 함께 따라온다.
      if (!pointerSeen) wanted.copy(homeFromCamera())
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
