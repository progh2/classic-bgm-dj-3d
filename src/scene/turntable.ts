import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  BoxGeometry,
} from 'three'

/**
 * 테이블 위의 레코드 재생기. 재생 상태를 눈으로 보여 주는 것이 목적이다.
 *
 * CC0 로 쓸 만한 재생기 모델을 찾지 못했고(찾은 것은 모두 CC-BY), 판이 돌고
 * 톤암이 오르내려야 하므로 정적인 모델로는 어차피 부족하다. 그래서 직접 세운다.
 * 재질과 색은 응접실의 마호가니·황동에 맞춘다.
 */

export interface TurntableState {
  /** 판이 도는가 */
  spinning: boolean
  /** 톤암을 판 위에 올릴 것인가. 곡이 걸려 있으면 참 */
  armDown: boolean
  /** 0~1. 톤암이 안쪽으로 들어가는 정도. 모르면 0 */
  progress: number
}

export interface Turntable {
  readonly root: Object3D
  set(state: TurntableState): void
  tick(deltaSec: number): void
}

/** 33⅓ 회전/분 */
const RPM = 100 / 3
const SPIN_RAD_PER_SEC = (RPM / 60) * Math.PI * 2

/** 톤암이 쉬는 자리와, 판의 바깥/안쪽 홈에 놓이는 자리 */
const ARM_REST = -0.38
const ARM_OUTER = 0.18
const ARM_INNER = 0.52

export function createTurntable(): Turntable {
  const root = new Group()

  const walnut = new MeshStandardMaterial({ color: 0x3a2015, roughness: 0.38, metalness: 0.06 })
  const brass = new MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.3, metalness: 0.85 })
  const vinyl = new MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.32, metalness: 0.05 })
  const label = new MeshStandardMaterial({ color: 0x7a1f24, roughness: 0.7 })

  const plinth = new Mesh(new BoxGeometry(0.44, 0.07, 0.36), walnut)
  plinth.position.y = 0.035
  plinth.castShadow = true
  plinth.receiveShadow = true
  root.add(plinth)

  // 상판 가장자리를 황동으로 둘러 장식한다
  const trim = new Mesh(new BoxGeometry(0.46, 0.012, 0.38), brass)
  trim.position.y = 0.071
  root.add(trim)

  const platter = new Mesh(new CylinderGeometry(0.145, 0.145, 0.014, 48), brass)
  platter.position.set(-0.04, 0.084, 0)
  platter.castShadow = true
  root.add(platter)

  // 판만 따로 돌린다. 턴테이블 몸체는 가만히 있는다.
  const record = new Group()
  record.position.copy(platter.position)
  record.position.y += 0.009
  root.add(record)

  const disc = new Mesh(new CylinderGeometry(0.14, 0.14, 0.003, 64), vinyl)
  record.add(disc)
  const centreLabel = new Mesh(new CylinderGeometry(0.048, 0.048, 0.004, 32), label)
  centreLabel.position.y = 0.001
  record.add(centreLabel)
  // 판이 도는 것이 보이도록 한쪽에 표식을 둔다. 없으면 매끈한 원판이라 멈춘 듯 보인다.
  const marker = new Mesh(new BoxGeometry(0.055, 0.0035, 0.006), brass)
  marker.position.set(0.088, 0.002, 0)
  record.add(marker)

  const spindle = new Mesh(new CylinderGeometry(0.004, 0.004, 0.03, 12), brass)
  spindle.position.copy(record.position)
  spindle.position.y += 0.014
  root.add(spindle)

  // 톤암 — 받침 기둥에 매달아 통째로 돌린다
  const armPivot = new Group()
  armPivot.position.set(0.16, 0.09, -0.12)
  root.add(armPivot)

  const post = new Mesh(new CylinderGeometry(0.016, 0.019, 0.035, 16), brass)
  post.position.y = 0.017
  root.add(post.clone())
  post.position.copy(armPivot.position)
  post.position.y = 0.088
  root.add(post)

  const arm = new Mesh(new BoxGeometry(0.23, 0.006, 0.008), brass)
  arm.position.set(-0.105, 0.026, 0.055)
  arm.castShadow = true
  armPivot.add(arm)
  const head = new Mesh(new BoxGeometry(0.028, 0.012, 0.016), walnut)
  head.position.set(-0.215, 0.02, 0.055)
  armPivot.add(head)

  // 받침대 고리
  const rest = new Mesh(new TorusGeometry(0.018, 0.004, 8, 20), brass)
  rest.rotation.x = Math.PI / 2
  rest.position.set(0.1, 0.08, 0.14)
  root.add(rest)

  let target: TurntableState = { spinning: false, armDown: false, progress: 0 }
  let spin = 0
  let armAngle = ARM_REST
  let armLift = 0.012

  return {
    root,

    set(state) {
      target = state
    },

    tick(deltaSec) {
      if (target.spinning) {
        spin += SPIN_RAD_PER_SEC * deltaSec
        record.rotation.y = spin
      }

      // 톤암은 곡이 진행될수록 판 안쪽으로 들어간다.
      const wanted = target.armDown
        ? ARM_OUTER + (ARM_INNER - ARM_OUTER) * Math.min(1, Math.max(0, target.progress))
        : ARM_REST
      armAngle += (wanted - armAngle) * Math.min(1, deltaSec * 3)
      armPivot.rotation.y = armAngle

      // 멈추면 바늘을 살짝 든다.
      const wantedLift = target.armDown && target.spinning ? 0 : 0.012
      armLift += (wantedLift - armLift) * Math.min(1, deltaSec * 5)
      armPivot.position.y = 0.09 + armLift
    },
  }
}
