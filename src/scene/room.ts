import { applyTextureSet } from './textures'
import {
  BackSide,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three'

/**
 * 응접실의 방 자체 — 바닥, 벽 세 면, 허리 높이 목재 판벽, 상부 몰딩, 러그.
 *
 * 가구만 검은 허공에 떠 있으면 "응접실"이 아니라 "무대 위 소품"으로 읽힌다.
 * 벽이 있어야 안내판이 걸릴 자리가 생기고, 빛이 허공으로 새지 않는다.
 */

/**
 * 방의 크기(m). 카메라가 들어앉는 쪽(+Z)은 열어 두되, 바닥과 옆벽은 카메라
 * 뒤까지 이어져야 한다. 그러지 않으면 화면 아래에 바닥 끝 모서리와 허공이 보인다.
 */
/** 뒷벽의 z. 안내판이 여기 걸린다. */
export const BACK_Z = -2.6
/** 옆벽의 x. 가구를 벽에 붙일 때 쓴다. */
export const WALL_X = 2.9
/** 바닥·옆벽이 끝나는 z. 카메라보다 뒤여야 한다. */
const FRONT_Z = 3.2
const W = WALL_X * 2
const D = FRONT_Z - BACK_Z
const H = 2.85
/** 판벽(웨인스코팅) 높이 */
const DADO = 1.05

export interface Room {
  readonly root: Group
  /** 바닥·벽·판벽에 결을 입힌다. 실패해도 단색으로 보인다. */
  applyTextures(base: string): Promise<void>
}

export function createRoom(): Room {
  const root = new Group()

  // 시작값은 전부 무광이다. 번들거림은 텍스처의 거칠기 맵이 정한다.
  // 뒷벽과 옆벽은 너비가 달라 텍스처 반복도 달라야 한다. 재질을 나눠 둔다.
  const wallMat = new MeshStandardMaterial({ color: 0x3a1c1e, roughness: 1, metalness: 0 })
  const sideWallMat = wallMat.clone()
  const panelWood = new MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.95, metalness: 0 })
  const trimWood = new MeshStandardMaterial({ color: 0x30200f, roughness: 0.9, metalness: 0 })
  const floorMat = new MeshStandardMaterial({ color: 0x3a281b, roughness: 0.95, metalness: 0 })

  const centreZ = (BACK_Z + FRONT_Z) / 2

  const floor = new Mesh(new PlaneGeometry(W, D), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.z = centreZ
  floor.receiveShadow = true
  root.add(floor)

  // 벽 — 안쪽 면만 보이면 되므로 평면을 뒤집어 쓴다.
  const wall = (w: number, x: number, z: number, rotY: number): void => {
    const m = new Mesh(new PlaneGeometry(w, H), rotY === 0 ? wallMat : sideWallMat)
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

  wall(W, 0, BACK_Z, 0)
  wall(D, -W / 2, centreZ, Math.PI / 2)
  wall(D, W / 2, centreZ, -Math.PI / 2)

  // 천장 — 보이지는 않지만 빛이 새지 않도록 덮는다.
  const ceiling = new Mesh(
    new PlaneGeometry(W, D),
    new MeshStandardMaterial({ color: 0x1e1811, roughness: 1, metalness: 0, side: BackSide }),
  )
  ceiling.rotation.x = -Math.PI / 2
  ceiling.position.set(0, H, centreZ)
  root.add(ceiling)

  // 러그 — 테이블 아래. 바닥이 온통 같은 무늬면 눈이 쉴 데가 없다.
  const rug = new Mesh(
    new PlaneGeometry(3.2, 2.3),
    new MeshStandardMaterial({ color: 0x241318, roughness: 1, metalness: 0 }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.004, -0.35)
  rug.receiveShadow = true
  root.add(rug)

  const rugTrim = new Mesh(
    new PlaneGeometry(2.94, 2.04),
    new MeshStandardMaterial({ color: 0x3a2028, roughness: 1, metalness: 0 }),
  )
  rugTrim.rotation.x = -Math.PI / 2
  rugTrim.position.set(0, 0.006, -0.35)
  root.add(rugTrim)

  return {
    root,

    async applyTextures(base) {
      await Promise.all([
        // 마루는 0.9m 에 한 장. 헤링본 무늬가 잘게 반복되어야 마루로 읽힌다.
        applyTextureSet(floorMat, `${base}herringbone-parquet/`, 'herringbone_parquet', {
          repeat: [W / 0.9, D / 0.9],
          tint: 0x9c7a55,
          envMapIntensity: 0.35,
        }),
        // 벽은 붉은 자카드 천. 응접실 윗벽에 바르는 직물 벽지다.
        applyTextureSet(wallMat, `${base}quatrefoil-jacquard-fabric/`, 'quatrefoil_jacquard_fabric', {
          repeat: [W / 1.1, H / 1.1],
          tint: 0x7a4a4f,
          envMapIntensity: 0.25,
        }),
        applyTextureSet(sideWallMat, `${base}quatrefoil-jacquard-fabric/`, 'quatrefoil_jacquard_fabric', {
          repeat: [D / 1.1, H / 1.1],
          tint: 0x7a4a4f,
          envMapIntensity: 0.25,
        }),
        applyTextureSet(panelWood, `${base}dark-wooden-planks/`, 'dark_wooden_planks', {
          repeat: [W / 1.4, DADO / 1.4],
          tint: 0x8a6b4c,
          envMapIntensity: 0.3,
        }),
        applyTextureSet(trimWood, `${base}dark-wooden-planks/`, 'dark_wooden_planks', {
          repeat: [W / 0.7, 1],
          tint: 0x9a7a55,
          envMapIntensity: 0.35,
        }),
      ])
    },
  }
}
