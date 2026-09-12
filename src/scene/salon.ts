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
import { createHud3D, type Hud3D } from './hud3d'
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
  dispose(): void
}

/** WebGL 초기화 실패를 호출부에서 구분할 수 있게 던지는 오류. */
/** 상판 높이(m). 집사의 손이 이 뒤로 가려지도록 원래 콘솔보다 높게 잡는다. */
export const TABLE_TOP = 1.14

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
  renderer.toneMappingExposure = 0.92
  renderer.outputColorSpace = SRGBColorSpace
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(0x17110c)
  scene.fog = new Fog(0x17110c, 6, 16)

  const camera = new PerspectiveCamera(38, 1, 0.1, 60)
  // 상판 높이쯤에서 살짝 올려다본다. 눈높이가 상판보다 높으면 집사의 배와
  // 손이 상판 위로 비어져 나온다.
  camera.position.set(0, 1.3, 2.45)
  camera.lookAt(0, 1.46, -0.95)

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

  scene.add(new AmbientLight(0xffd9a8, 0.12))

  // 키 — 왼쪽 위에서 내려오는 따뜻한 빛. 그림자를 만드는 주광원이다.
  const key = new SpotLight(0xffd2a1, 13, 8, Math.PI / 5, 0.5, 1.6)
  key.position.set(-1.15, 2.6, 1.35)
  key.target.position.set(0, 1.0, -0.4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0012
  key.shadow.normalBias = 0.02
  scene.add(key, key.target)

  // 림 — 뒤 오른쪽에서 오는 서늘한 빛. 집사의 윤곽을 배경에서 떼어낸다.
  const rim = new SpotLight(0xbcd2ff, 7, 8, Math.PI / 4.5, 0.7, 1.5)
  rim.position.set(1.9, 2.5, -2.1)
  rim.target.position.set(0, 1.35, -1.05)
  scene.add(rim, rim.target)

  // 필 — 정면 아래에서 아주 약하게. 얼굴 그늘이 까맣게 막히지 않도록.
  const fill = new PointLight(0xffe6c8, 1.5, 6, 2)
  fill.position.set(0.4, 1.5, 2.2)
  scene.add(fill)

  const candle = new PointLight(0xffb469, 2.2, 3.2, 2)
  candle.position.set(0.78, TABLE_TOP + 0.12, 0.28)
  scene.add(candle)



  // 집사가 이쪽을 보게 할 기준점. 카메라보다 살짝 아래에 둬야 눈이 마주친다.
  const viewerAnchor = new Object3D()
  const HOME = new Vector3(0, 1.42, 2.05)
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
  const pickAt = (clientX: number, clientY: number): { panel: (typeof hud.panels)[number]; id: string } | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const meshes = hud.panels.filter((p) => p.visible).map((p) => p.mesh)
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const panel = hud.panels.find((p) => p.mesh === hit.object)
      if (!panel || !hit.uv) continue
      const id = panel.hitTest(hit.uv)
      if (id) return { panel, id }
    }
    return null
  }

  const clearHover = (): void => {
    for (const p of hud.panels) p.setHover(null)
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
    if (found) hud.pick(found.id)
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
  turntable.root.position.set(-0.42, 0, -0.02)
  turntable.root.rotation.y = 0.22

  const tabletop = createTabletop()

  const hud = createHud3D()

  const onTable = new Group()
  onTable.position.y = TABLE_TOP
  onTable.add(turntable.root, tabletop.root, hud.root)
  scene.add(onTable)

  const resize = (): void => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return {
    viewerAnchor,
    screen,
    turntable,
    room,
    tabletop,
    hud,
    furnishings,
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
      scene.environmentIntensity = 0.3
      pmrem.dispose()
      texture.dispose()
    },
    tick(nowMs, deltaSec) {
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
