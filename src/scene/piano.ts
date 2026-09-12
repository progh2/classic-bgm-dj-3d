import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector3,
} from 'three'

/**
 * 응접실의 그랜드 피아노와 의자.
 *
 * 전에 한 번 세웠다가 뺐다. 멀리서는 검은 덩어리로만 보였기 때문이다.
 * 이번에는 카메라가 가깝고 집사가 앞에 앉으므로 크기를 견줄 대상이 생긴다.
 * 뚜껑을 열고, 보면대를 세우고, 건반의 검은 건까지 넣어 무엇인지 읽히게 한다.
 */

export interface Piano {
  readonly root: Group
  /** 집사가 앉을 자리(세계 좌표) */
  readonly seat: Vector3
  /** 의자 뒤쪽, 걸어와 서는 자리(세계 좌표) */
  readonly approach: Vector3
  /** 앉았을 때 몸이 향할 방향(라디안) */
  readonly facing: number
  /** 의자 앉는 면의 높이 */
  readonly seatHeight: number
}

const SEAT_H = 0.52

export function createPiano(position: Vector3, rotationY: number): Piano {
  const root = new Group()
  root.position.copy(position)
  root.rotation.y = rotationY

  const lacquer = new MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.16, metalness: 0.12 })
  const lacquerSide = new MeshStandardMaterial({ color: 0x110e0c, roughness: 0.24, metalness: 0.1 })
  const brass = new MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.32, metalness: 0.82 })
  const ivory = new MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.34, metalness: 0.02 })
  const ebony = new MeshStandardMaterial({ color: 0x14110f, roughness: 0.3, metalness: 0.05 })
  const felt = new MeshStandardMaterial({ color: 0x5d1f28, roughness: 0.96 })

  // 위에서 본 몸통 — 건반 쪽은 곧고 반대쪽만 둥글게 부푼다.
  const body = new Shape()
  body.moveTo(-0.74, -0.6)
  body.lineTo(0.74, -0.6)
  body.lineTo(0.74, 0.28)
  body.bezierCurveTo(0.74, 0.95, 0.3, 1.26, -0.24, 1.26)
  body.lineTo(-0.74, 1.26)
  body.closePath()

  const CASE_H = 0.24
  const caseMesh = new Mesh(
    new ExtrudeGeometry(body, {
      depth: CASE_H,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.01,
      bevelSegments: 2,
    }),
    lacquerSide,
  )
  caseMesh.rotation.x = -Math.PI / 2
  caseMesh.position.y = 0.72 + CASE_H
  caseMesh.castShadow = true
  caseMesh.receiveShadow = true
  root.add(caseMesh)

  // 열린 뚜껑 — 낮은음 쪽(local -X, 바깥 벽 쪽) 모서리를 축으로 들어 올린다.
  // 반대쪽으로 열면 연주자와 이쪽 사이에 큰 검은 판이 서서 얼굴을 가린다.
  const lidPivot = new Group()
  lidPivot.position.set(0.74, 0.72 + CASE_H, 0)
  const lid = new Mesh(
    new ExtrudeGeometry(body, { depth: 0.022, bevelEnabled: false }),
    lacquer,
  )
  lid.rotation.x = -Math.PI / 2
  lid.position.set(-0.74, 0, 0)
  lidPivot.add(lid)
  lidPivot.rotation.z = -0.6
  root.add(lidPivot)

  // 뚜껑 버팀목 — 열린 쪽을 받친다. 뚜껑이 서는 각도와 자리를 맞춘다.
  const prop = new Mesh(new CylinderGeometry(0.012, 0.012, 0.74, 10), lacquer)
  prop.position.set(-0.34, 0.72 + CASE_H + 0.35, 0.42)
  prop.rotation.z = -0.3
  root.add(prop)

  // 건반 — 흰 건 위에 검은 건을 얹는다
  const KEYS_W = 1.24
  const keybed = new Mesh(new BoxGeometry(KEYS_W + 0.08, 0.05, 0.2), lacquerSide)
  keybed.position.set(0, 0.955, -0.68)
  root.add(keybed)
  const whites = new Mesh(new BoxGeometry(KEYS_W, 0.022, 0.16), ivory)
  whites.position.set(0, 0.99, -0.69)
  root.add(whites)
  // 흰 건 사이의 틈
  for (let i = 1; i < 28; i++) {
    const gap = new Mesh(new BoxGeometry(0.0035, 0.024, 0.16), ebony)
    gap.position.set(-KEYS_W / 2 + (KEYS_W * i) / 28, 0.991, -0.69)
    root.add(gap)
  }
  // 검은 건 — 두 개·세 개 묶음을 되풀이한다
  const PATTERN = [0, 1, 3, 4, 5]
  for (let octave = 0; octave < 4; octave++) {
    for (const p of PATTERN) {
      const x = -KEYS_W / 2 + (KEYS_W * (octave * 7 + p + 0.72)) / 28
      const black = new Mesh(new BoxGeometry(0.019, 0.018, 0.1), ebony)
      black.position.set(x, 1.006, -0.72)
      root.add(black)
    }
  }

  // 보면대와 악보
  const desk = new Mesh(new BoxGeometry(0.9, 0.34, 0.016), lacquer)
  desk.position.set(0, 1.16, -0.5)
  desk.rotation.x = -0.24
  root.add(desk)
  const sheet = new Mesh(new BoxGeometry(0.56, 0.26, 0.004), ivory)
  sheet.position.set(0, 1.17, -0.49)
  sheet.rotation.x = -0.24
  root.add(sheet)

  // 다리와 페달
  for (const [lx, lz] of [
    [-0.6, -0.44],
    [0.6, -0.44],
    [0.1, 1.0],
  ] as const) {
    const leg = new Mesh(new CylinderGeometry(0.052, 0.062, 0.72, 12), lacquer)
    leg.position.set(lx, 0.36, lz)
    leg.castShadow = true
    root.add(leg)
  }
  const pedalBox = new Mesh(new BoxGeometry(0.16, 0.14, 0.06), lacquer)
  pedalBox.position.set(0, 0.12, -0.5)
  root.add(pedalBox)
  for (const px of [-0.045, 0, 0.045] as const) {
    const pedal = new Mesh(new BoxGeometry(0.024, 0.012, 0.12), brass)
    pedal.position.set(px, 0.07, -0.55)
    pedal.rotation.x = 0.18
    root.add(pedal)
  }

  // 의자
  const bench = new Group()
  bench.position.set(0, 0, -1.12)
  const seatTop = new Mesh(new BoxGeometry(0.62, 0.06, 0.3), felt)
  seatTop.position.y = SEAT_H
  seatTop.castShadow = true
  bench.add(seatTop)
  const seatFrame = new Mesh(new BoxGeometry(0.64, 0.04, 0.32), lacquer)
  seatFrame.position.y = SEAT_H - 0.045
  bench.add(seatFrame)
  for (const [bx, bz] of [
    [-0.26, -0.1],
    [0.26, -0.1],
    [-0.26, 0.1],
    [0.26, 0.1],
  ] as const) {
    const leg = new Mesh(new CylinderGeometry(0.018, 0.022, SEAT_H - 0.07, 10), lacquer)
    leg.position.set(bx, (SEAT_H - 0.07) / 2, bz)
    bench.add(leg)
  }
  root.add(bench)

  // 앉는 자리와, 그 뒤로 물러선 자리를 세계 좌표로 돌려준다.
  // 세계 좌표로 z 를 더하면 피아노를 돌려 놓았을 때 엉뚱한 곳이 나온다.
  // 반드시 피아노의 방향을 태워서 옮겨야 한다.
  const seat = new Vector3(0, 0, -1.12).applyAxisAngle(UP, rotationY).add(position)
  const approach = new Vector3(0, 0, -1.62).applyAxisAngle(UP, rotationY).add(position)

  return {
    root,
    seat,
    approach,
    // 의자에 앉으면 건반 쪽, 곧 피아노의 +Z 를 바라본다.
    facing: rotationY,
    seatHeight: SEAT_H,
  }
}

const UP = new Vector3(0, 1, 0)
