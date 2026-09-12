import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'

/**
 * 테이블 위의 정물 — 악보집 더미, 테이블 러너, 찻잔, 황동 호출벨.
 *
 * 재생기 하나만 놓인 상판은 비어 보인다. 책자(단계 3)가 놓일 자리는 비워 두고
 * 그 둘레를 채운다.
 */

export interface Tabletop {
  readonly root: Group
}

const GOLD = 0x8a6a1e
const UP = new Vector3(0, 1, 0)

export function createTabletop(): Tabletop {
  const root = new Group()

  const brass = new MeshStandardMaterial({ color: GOLD, roughness: 0.34, metalness: 0.82 })
  const porcelain = new MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.22, metalness: 0.02 })

  // 악보집 더미 — 아래로 갈수록 조금씩 크다. 책등에 금박 띠를 두른다.
  const spineColours = [0x3c2418, 0x2a3626, 0x412028, 0x2b2a3c]
  let stackY = 0
  const stack = new Group()
  stack.position.set(-0.72, 0, -0.06)
  stack.rotation.y = -0.12
  for (let i = 0; i < 4; i++) {
    const h = 0.032
    const w = 0.3 - i * 0.012
    const d = 0.21 - i * 0.008
    const book = new Mesh(
      new BoxGeometry(w, h, d),
      new MeshStandardMaterial({ color: spineColours[3 - i] ?? 0x2a1a12, roughness: 0.78, metalness: 0.02 }),
    )
    book.position.y = stackY + h / 2
    book.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.03
    book.castShadow = true
    stack.add(book)

    // 금박 띠 — 책등 위아래
    for (const off of [h * 0.28, -h * 0.28]) {
      const band = new Mesh(new BoxGeometry(w * 0.82, 0.0025, 0.002), brass)
      band.position.set(0, stackY + h / 2 + off, d / 2 + 0.0015)
      band.rotation.y = book.rotation.y
      band.position.applyAxisAngle(UP, book.rotation.y)
      stack.add(band)
    }
    stackY += h
  }
  root.add(stack)

  // 황동 호출벨 — 눌러 집사를 부르는 종. 단계 4에서 손이 닿는다.
  const bell = new Group()
  bell.position.set(0.42, 0, 0.16)
  const dome = new Mesh(
    new LatheGeometry(
      [
        new Vector2(0.001, 0.052),
        new Vector2(0.022, 0.05),
        new Vector2(0.038, 0.038),
        new Vector2(0.045, 0.016),
        new Vector2(0.046, 0.006),
      ],
      24,
    ),
    brass,
  )
  dome.castShadow = true
  bell.add(dome)
  const base = new Mesh(new CylinderGeometry(0.052, 0.056, 0.008, 24), brass)
  base.position.y = 0.004
  bell.add(base)
  const knob = new Mesh(new CylinderGeometry(0.006, 0.006, 0.012, 12), brass)
  knob.position.y = 0.057
  bell.add(knob)
  root.add(bell)

  // 찻잔과 받침
  const tea = new Group()
  tea.position.set(-0.5, 0, 0.17)
  const saucer = new Mesh(new CylinderGeometry(0.058, 0.052, 0.006, 28), porcelain)
  saucer.position.y = 0.003
  saucer.castShadow = true
  tea.add(saucer)
  const cup = new Mesh(new CylinderGeometry(0.037, 0.028, 0.044, 28, 1, true), porcelain)
  cup.position.y = 0.028
  tea.add(cup)
  const cupFloor = new Mesh(new CylinderGeometry(0.028, 0.028, 0.004, 24), porcelain)
  cupFloor.position.y = 0.008
  tea.add(cupFloor)
  const brew = new Mesh(
    new CylinderGeometry(0.034, 0.034, 0.002, 24),
    new MeshStandardMaterial({ color: 0x3a2110, roughness: 0.24 }),
  )
  brew.position.y = 0.04
  tea.add(brew)
  const handle = new Mesh(new TorusGeometry(0.017, 0.004, 8, 20), porcelain)
  handle.position.set(0.045, 0.03, 0)
  handle.rotation.y = Math.PI / 2
  tea.add(handle)
  // 잔 가장자리의 금테
  const rim = new Mesh(new TorusGeometry(0.037, 0.0015, 6, 32), brass)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.05
  tea.add(rim)
  root.add(tea)

  return {
    root,
  }
}
