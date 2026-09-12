import {
  BackSide,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three'

/**
 * 응접실의 방 자체 — 바닥, 벽 세 면, 허리 높이 목재 판벽, 상부 몰딩, 러그.
 *
 * 가구만 검은 허공에 떠 있으면 "응접실"이 아니라 "무대 위 소품"으로 읽힌다.
 * 벽이 있어야 안내판이 걸릴 자리가 생기고, 빛이 허공으로 새지 않는다.
 */

/** 방의 크기(m). 카메라가 들어앉는 쪽(+Z)은 열어 둔다. */
const W = 7.2
const D = 7.0
const H = 3.2
/** 판벽(웨인스코팅) 높이 */
const DADO = 1.05

export interface Room {
  readonly root: Group
  /** 바닥 텍스처를 입힌다. 실패해도 단색으로 보인다. */
  applyFloorTexture(base: string): Promise<void>
}

export function createRoom(): Room {
  const root = new Group()

  const plaster = new MeshStandardMaterial({ color: 0x3d3226, roughness: 0.92 })
  const panelWood = new MeshStandardMaterial({ color: 0x33200f, roughness: 0.45, metalness: 0.05 })
  const trimWood = new MeshStandardMaterial({ color: 0x5a3a1d, roughness: 0.38, metalness: 0.08 })
  const floorMat = new MeshStandardMaterial({ color: 0x4a3323, roughness: 0.55, metalness: 0.02 })

  const floor = new Mesh(new PlaneGeometry(W, D), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.z = -D / 2 + 2.6
  floor.receiveShadow = true
  root.add(floor)

  // 벽 — 안쪽 면만 보이면 되므로 평면을 뒤집어 쓴다.
  const wall = (w: number, x: number, z: number, rotY: number): void => {
    const m = new Mesh(new PlaneGeometry(w, H), plaster)
    m.position.set(x, H / 2, z)
    m.rotation.y = rotY
    m.receiveShadow = true
    root.add(m)

    // 판벽 — 벽 앞에 살짝 띄운 판
    const dado = new Mesh(new BoxGeometry(w, DADO, 0.05), panelWood)
    dado.position.set(x, DADO / 2, z)
    dado.rotation.y = rotY
    dado.translateZ(0.028)
    dado.receiveShadow = true
    root.add(dado)

    // 판벽 윗단 몰딩
    const rail = new Mesh(new BoxGeometry(w, 0.055, 0.075), trimWood)
    rail.position.set(x, DADO + 0.02, z)
    rail.rotation.y = rotY
    rail.translateZ(0.04)
    root.add(rail)

    // 천장 몰딩
    const cornice = new Mesh(new BoxGeometry(w, 0.12, 0.09), trimWood)
    cornice.position.set(x, H - 0.1, z)
    cornice.rotation.y = rotY
    cornice.translateZ(0.045)
    root.add(cornice)
  }

  const back = floor.position.z - D / 2
  wall(W, 0, back, 0)
  wall(D, -W / 2, floor.position.z, Math.PI / 2)
  wall(D, W / 2, floor.position.z, -Math.PI / 2)

  // 천장 — 보이지는 않지만 빛이 새지 않도록 덮는다.
  const ceiling = new Mesh(new PlaneGeometry(W, D), new MeshStandardMaterial({ color: 0x2a241c, roughness: 1, side: BackSide }))
  ceiling.rotation.x = -Math.PI / 2
  ceiling.position.set(0, H, floor.position.z)
  root.add(ceiling)

  // 러그 — 테이블 아래. 바닥이 온통 같은 무늬면 눈이 쉴 데가 없다.
  const rug = new Mesh(
    new PlaneGeometry(3.6, 2.6),
    new MeshStandardMaterial({ color: 0x2c1c22, roughness: 0.95 }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.004, -0.2)
  rug.receiveShadow = true
  root.add(rug)

  const rugTrim = new Mesh(
    new PlaneGeometry(3.32, 2.32),
    new MeshStandardMaterial({ color: 0x4a2c33, roughness: 0.95 }),
  )
  rugTrim.rotation.x = -Math.PI / 2
  rugTrim.position.set(0, 0.006, -0.2)
  root.add(rugTrim)

  return {
    root,

    async applyFloorTexture(base) {
      const loader = new TextureLoader()
      const load = async (suffix: string, srgb: boolean): Promise<Texture> => {
        const t = await loader.loadAsync(`${base}herringbone_parquet_${suffix}_1k.jpg`)
        t.wrapS = RepeatWrapping
        t.wrapT = RepeatWrapping
        // 1m 에 한 장씩. 헤링본 무늬가 잘게 반복되어야 마루로 읽힌다.
        t.repeat.set(W / 1.6, D / 1.6)
        if (srgb) t.colorSpace = SRGBColorSpace
        return t
      }
      const [diff, normal, arm] = await Promise.all([
        load('diff', true),
        load('nor_gl', false),
        load('arm', false),
      ])
      floorMat.map = diff
      floorMat.normalMap = normal
      // Poly Haven 의 arm 은 R=AO, G=거칠기, B=금속이다. 세 채널을 같은 이미지로 준다.
      floorMat.aoMap = arm
      floorMat.roughnessMap = arm
      floorMat.metalnessMap = arm
      floorMat.metalness = 1
      floorMat.roughness = 1
      floorMat.color.set(0xffffff)
      floorMat.needsUpdate = true
    },
  }
}
