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
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  WebGLRenderer,
} from 'three'

export interface Salon {
  /** 한 프레임 갱신. deltaSec 는 마지막 프레임과의 간격. */
  tick(nowMs: number, deltaSec: number): void
  resize(): void
  /** 응접실에 물건이나 사람을 놓는다. */
  add(object: Object3D): void
  /** 콘솔 테이블 모델이 도착하면 임시 상판을 치운다. */
  removePlaceholderTable(): void
  /** 집사가 바라볼 대상. 카메라 앞에 둔 빈 오브젝트다. */
  readonly viewerAnchor: Object3D
  dispose(): void
}

/** WebGL 초기화 실패를 호출부에서 구분할 수 있게 던지는 오류. */
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
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  scene.background = new Color(0x17110c)
  scene.fog = new Fog(0x17110c, 4.5, 11)

  const camera = new PerspectiveCamera(38, 1, 0.1, 60)
  // 아래쪽 절반은 자막과 조작부가 덮는다. 조금 내려다보게 두어 테이블 상판과
  // 그 위에 놓을 물건이 화면 위쪽에 남도록 한다.
  camera.position.set(0, 2.05, 2.95)
  camera.lookAt(0, 1.02, -0.45)

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

  // 바닥 가장자리가 화면에 보이지 않도록 안개가 걷히는 거리보다 넓게 깐다.
  const floor = new Mesh(
    new BoxGeometry(24, 0.1, 24),
    new MeshStandardMaterial({ color: 0x241711, roughness: 0.9 }),
  )
  floor.position.y = -0.05
  floor.receiveShadow = true
  scene.add(floor)

  scene.add(new AmbientLight(0xffd9a8, 0.32))

  const lamp = new SpotLight(0xffd2a1, 14, 7, Math.PI / 5, 0.45, 1.6)
  lamp.position.set(-0.9, 2.5, 1.1)
  lamp.target.position.set(0, 0.8, 0)
  lamp.castShadow = true
  lamp.shadow.mapSize.set(1024, 1024)
  scene.add(lamp, lamp.target)

  const candle = new PointLight(0xffb469, 2.2, 3.2, 2)
  candle.position.set(0.78, 1.02, 0.28)
  scene.add(candle)

  // 테이블 너머에 선 집사의 얼굴이 어둠에 묻히지 않도록 한 단계 더.
  const butlerKey = new SpotLight(0xffe0bb, 9, 6, Math.PI / 5.5, 0.6, 1.5)
  butlerKey.position.set(0.5, 2.7, 0.9)
  butlerKey.target.position.set(0, 1.35, -1.05)
  scene.add(butlerKey, butlerKey.target)

  // 집사가 이쪽을 보게 할 기준점. 카메라보다 살짝 아래에 둬야 눈이 마주친다.
  const viewerAnchor = new Object3D()
  viewerAnchor.position.set(0, 1.5, 2.9)
  scene.add(viewerAnchor)

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
    add(object) {
      scene.add(object)
    },
    removePlaceholderTable() {
      scene.remove(table)
    },
    tick(nowMs) {
      // 촛불의 미세한 흔들림. 모션 줄이기에서는 고정한다.
      candle.intensity = reduceMotion ? 2.2 : 2.2 + Math.sin(nowMs / 240) * 0.18
      renderer.render(scene, camera)
    },
    resize,
    dispose() {
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
