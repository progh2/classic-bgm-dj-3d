import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'

/**
 * 벽에 붙여 놓는 업라이트 피아노와 의자.
 *
 * 그랜드를 세워 봤지만 이 방에는 너무 컸다. 몸통이 바닥의 3분의 1을 먹고,
 * 열린 뚜껑이 연주자를 가렸다. 업라이트는 벽에 붙어 자리를 거의 먹지 않고,
 * 연주자가 벽을 보고 앉으므로 옆모습이 그대로 보인다.
 *
 * 앞면(건반 쪽)이 local +Z 를 본다. 의자는 그 앞에 놓고, 연주자는 피아노를
 * 마주 보므로 몸은 local -Z 를 향한다.
 */

export interface Piano {
  readonly root: Group
  /** 연주자가 앉을 자리(세계 좌표) */
  readonly seat: Vector3
  /** 의자 뒤, 걸어와 서는 자리(세계 좌표) */
  readonly approach: Vector3
  /** 앉았을 때 몸이 향할 방향(라디안) */
  readonly facing: number
  /** 의자 앉는 면의 높이 */
  readonly seatHeight: number
}

const SEAT_H = 0.58
const W = 1.42
const H = 1.22
const D = 0.34

export function createPiano(position: Vector3, rotationY: number): Piano {
  const root = new Group()
  root.position.copy(position)
  root.rotation.y = rotationY

  const lacquer = new MeshStandardMaterial({ color: 0x140f0c, roughness: 0.2, metalness: 0.1 })
  const lacquerDim = new MeshStandardMaterial({ color: 0x1b1512, roughness: 0.34, metalness: 0.06 })
  const brass = new MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.32, metalness: 0.82 })
  const ivory = new MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.34, metalness: 0.02 })
  const ebony = new MeshStandardMaterial({ color: 0x14110f, roughness: 0.3, metalness: 0.05 })
  const felt = new MeshStandardMaterial({ color: 0x5d1f28, roughness: 0.96 })

  // 몸통 — 벽에 붙는 큰 판
  const body = new Mesh(new BoxGeometry(W, H, D), lacquer)
  body.position.set(0, H / 2, 0)
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  // 윗판과 그 위의 작은 턱
  const top = new Mesh(new BoxGeometry(W + 0.05, 0.045, D + 0.05), lacquerDim)
  top.position.set(0, H + 0.02, 0)
  root.add(top)

  // 앞판 — 무늬를 주어 한 덩어리로 보이지 않게 한다
  const upperPanel = new Mesh(new BoxGeometry(W - 0.12, 0.46, 0.02), lacquerDim)
  upperPanel.position.set(0, 0.92, D / 2 + 0.011)
  root.add(upperPanel)
  for (const y of [0.92 - 0.24, 0.92 + 0.24] as const) {
    const bead = new Mesh(new BoxGeometry(W - 0.1, 0.014, 0.026), brass)
    bead.position.set(0, y, D / 2 + 0.014)
    root.add(bead)
  }

  // 건반 선반
  const KEYS_W = W - 0.2
  const shelf = new Mesh(new BoxGeometry(W, 0.06, 0.3), lacquerDim)
  shelf.position.set(0, 0.69, D / 2 + 0.07)
  shelf.castShadow = true
  root.add(shelf)

  const whites = new Mesh(new BoxGeometry(KEYS_W, 0.02, 0.17), ivory)
  whites.position.set(0, 0.725, D / 2 + 0.1)
  root.add(whites)
  for (let i = 1; i < 26; i++) {
    const gap = new Mesh(new BoxGeometry(0.0035, 0.022, 0.17), ebony)
    gap.position.set(-KEYS_W / 2 + (KEYS_W * i) / 26, 0.726, D / 2 + 0.1)
    root.add(gap)
  }
  const PATTERN = [0, 1, 3, 4, 5]
  for (let octave = 0; octave < 3; octave++) {
    for (const p of PATTERN) {
      const x = -KEYS_W / 2 + (KEYS_W * (octave * 7 + p + 0.72)) / 26
      const black = new Mesh(new BoxGeometry(0.018, 0.016, 0.1), ebony)
      black.position.set(x, 0.739, D / 2 + 0.07)
      root.add(black)
    }
  }
  // 건반 위를 덮는 판
  const fallboard = new Mesh(new BoxGeometry(W - 0.04, 0.14, 0.05), lacquer)
  fallboard.position.set(0, 0.8, D / 2 + 0.03)
  fallboard.rotation.x = -0.18
  root.add(fallboard)

  // 보면대와 악보
  const desk = new Mesh(new BoxGeometry(W - 0.3, 0.3, 0.014), lacquerDim)
  desk.position.set(0, H + 0.16, 0.02)
  desk.rotation.x = 0.2
  root.add(desk)
  const sheet = new Mesh(new BoxGeometry(0.5, 0.24, 0.004), ivory)
  sheet.position.set(0, H + 0.16, 0.03)
  sheet.rotation.x = 0.2
  root.add(sheet)

  // 촛대 — 업라이트 앞판에 흔히 달린다
  for (const cx of [-0.42, 0.42] as const) {
    const arm = new Mesh(new CylinderGeometry(0.008, 0.008, 0.12, 8), brass)
    arm.position.set(cx, 1.06, D / 2 + 0.06)
    arm.rotation.x = Math.PI / 2
    root.add(arm)
    const candle = new Mesh(new CylinderGeometry(0.011, 0.012, 0.09, 10), ivory)
    candle.position.set(cx, 1.11, D / 2 + 0.11)
    root.add(candle)
  }

  // 다리와 페달
  for (const lx of [-W / 2 + 0.1, W / 2 - 0.1] as const) {
    const leg = new Mesh(new BoxGeometry(0.08, 0.66, 0.1), lacquer)
    leg.position.set(lx, 0.33, D / 2 + 0.08)
    root.add(leg)
  }
  const pedalBox = new Mesh(new BoxGeometry(0.2, 0.1, 0.06), lacquer)
  pedalBox.position.set(0, 0.07, D / 2 + 0.08)
  root.add(pedalBox)
  for (const px of [-0.05, 0.05] as const) {
    const pedal = new Mesh(new BoxGeometry(0.026, 0.01, 0.1), brass)
    pedal.position.set(px, 0.06, D / 2 + 0.13)
    pedal.rotation.x = 0.2
    root.add(pedal)
  }

  // 의자 — 피아노 앞
  const BENCH_Z = D / 2 + 0.62
  const bench = new Group()
  bench.position.set(0, 0, BENCH_Z)
  const seatTop = new Mesh(new BoxGeometry(0.6, 0.055, 0.28), felt)
  seatTop.position.y = SEAT_H
  seatTop.castShadow = true
  bench.add(seatTop)
  const seatFrame = new Mesh(new BoxGeometry(0.62, 0.035, 0.3), lacquer)
  seatFrame.position.y = SEAT_H - 0.042
  bench.add(seatFrame)
  for (const [bx, bz] of [
    [-0.25, -0.09],
    [0.25, -0.09],
    [-0.25, 0.09],
    [0.25, 0.09],
  ] as const) {
    const leg = new Mesh(new CylinderGeometry(0.016, 0.02, SEAT_H - 0.06, 10), lacquer)
    leg.position.set(bx, (SEAT_H - 0.06) / 2, bz)
    bench.add(leg)
  }
  root.add(bench)

  // 윗판에 얹어 둔 바이올린과 활 — 소품이다. 연주하지는 않는다.
  root.add(createViolin(0.34, H + 0.06, -0.02))

  const place = (localZ: number): Vector3 =>
    new Vector3(0, 0, localZ).applyAxisAngle(UP, rotationY).add(position)

  return {
    root,
    seat: place(BENCH_Z),
    approach: place(BENCH_Z + 0.52),
    // 연주자는 피아노를 마주 본다. 피아노가 보는 쪽의 반대다.
    facing: rotationY + Math.PI,
    seatHeight: SEAT_H,
  }
}

/**
 * 바이올린 한 대와 활. 가까이서 뜯어볼 물건이 아니라 실루엣만 맞춘다.
 * 몸통 두 덩이에 잘록한 허리, 목과 소용돌이 머리, 네 줄, 그리고 활.
 */
function createViolin(x: number, y: number, z: number): Group {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.set(0, 0.4, 0)

  const varnish = new MeshStandardMaterial({ color: 0x6b2f16, roughness: 0.28, metalness: 0.06 })
  const dark = new MeshStandardMaterial({ color: 0x1a120c, roughness: 0.4 })
  const hair = new MeshStandardMaterial({ color: 0xe8e0cd, roughness: 0.8 })

  // 몸통 — 위아래 두 덩이를 겹쳐 잘록한 허리를 만든다
  for (const [bz, r] of [
    [-0.075, 0.058],
    [0.055, 0.07],
  ] as const) {
    const lobe = new Mesh(new CylinderGeometry(r, r, 0.032, 20), varnish)
    lobe.rotation.x = Math.PI / 2
    lobe.position.set(0, 0, bz)
    g.add(lobe)
  }
  const waist = new Mesh(new BoxGeometry(0.07, 0.03, 0.08), varnish)
  g.add(waist)

  const neck = new Mesh(new BoxGeometry(0.018, 0.016, 0.13), dark)
  neck.position.set(0, 0.006, -0.185)
  g.add(neck)
  const scroll = new Mesh(new CylinderGeometry(0.014, 0.011, 0.03, 10), dark)
  scroll.rotation.x = Math.PI / 2
  scroll.position.set(0, 0.008, -0.262)
  g.add(scroll)

  for (const sx of [-0.008, -0.003, 0.003, 0.008] as const) {
    const string = new Mesh(new BoxGeometry(0.0016, 0.0016, 0.3), hair)
    string.position.set(sx, 0.021, -0.09)
    g.add(string)
  }

  // 활 — 몸통 옆에 나란히 눕힌다
  const bow = new Group()
  bow.position.set(0.085, 0.004, -0.02)
  bow.rotation.y = 0.06
  const stick = new Mesh(new BoxGeometry(0.008, 0.008, 0.44), dark)
  bow.add(stick)
  const ribbon = new Mesh(new BoxGeometry(0.004, 0.006, 0.4), hair)
  ribbon.position.set(0, 0.011, 0.01)
  bow.add(ribbon)
  const frog = new Mesh(new BoxGeometry(0.016, 0.018, 0.03), dark)
  frog.position.set(0, 0.006, 0.2)
  bow.add(frog)
  g.add(bow)

  return g
}

const UP = new Vector3(0, 1, 0)
