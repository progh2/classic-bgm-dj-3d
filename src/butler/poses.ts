import { Quaternion, Vector3 } from 'three'

/**
 * VRM 휴머노이드의 정규화 자세는 T 포즈다. 오일러 각으로 "팔을 내린 뒤 앞뒤로
 * 흔든다"를 쓰면 순서가 모호해지므로, 자세를 값으로 적고 쿼터니언으로 합성한다.
 *
 *   armDown  T 포즈에서 팔을 얼마나 내렸는가 (π/2 ≈ 옆으로 나란히, 1.4 ≈ 몸에 붙음)
 *   armSwing 내린 팔을 앞(−)/뒤(+)로 흔든 정도
 *   armTwist 팔을 제 축으로 비튼 정도. 팔꿈치가 굽는 방향을 정한다
 *            (0 이면 앞으로, 음수면 몸 안쪽으로)
 *   elbow    팔꿈치 굽힘, torso/head 앞으로(+) 숙임
 */
export interface Pose {
  armDown: number
  armSwing: number
  armTwist: number
  elbow: number
  torso: number
  head: number
  /** 좌우를 따로 줄 때만 사용한다. */
  armDownR?: number
  armSwingR?: number
  armTwistR?: number
  elbowR?: number
}

const AX_X = new Vector3(1, 0, 0)
const AX_Z = new Vector3(0, 0, 1)
const qA = new Quaternion()
const qB = new Quaternion()
const qC = new Quaternion()

/**
 * side: +1 = 왼팔, -1 = 오른팔
 *
 * swing 은 부모 좌표에서 앞뒤로 흔들고(선곱), twist 는 팔이 놓인 뒤 제 축을
 * 도는 회전이라 뒤에 곱한다. 팔의 뼈 축은 X 이고 팔꿈치는 Y 를 돈다.
 */
export function armQuat(
  out: Quaternion,
  side: 1 | -1,
  down: number,
  swing: number,
  twist: number,
): Quaternion {
  qA.setFromAxisAngle(AX_Z, down * side)
  qB.setFromAxisAngle(AX_X, swing)
  qC.setFromAxisAngle(AX_X, twist * side)
  return out.copy(qB).multiply(qA).multiply(qC)
}

/** 집사의 기본 자세. 한 손을 배 앞에 두는 정중한 대기 자세를 기본으로 한다. */
export const POSES = {
  /** 대기 — 두 손을 배 앞에 모은 정중한 자세 */
  idle: { armDown: 1.26, armSwing: -0.12, armTwist: -1.35, elbow: 1.05, torso: 0.0, head: 0.0 },
  /** 목례 — 허리를 숙이고 손은 모은 채 */
  bow: { armDown: 1.24, armSwing: -0.06, armTwist: -1.35, elbow: 1.1, torso: 0.42, head: 0.16 },
  /** 말하는 중 — 대기보다 조금 열린 자세 */
  speak: { armDown: 1.28, armSwing: -0.14, armTwist: -1.3, elbow: 0.95, torso: -0.02, head: -0.03 },
  /** 권함 — 오른손을 테이블 쪽으로 내밀어 안내 */
  present: { armDown: 1.26, armSwing: -0.12, armTwist: -1.35, elbow: 1.05, torso: 0.04, head: 0.04,
             armDownR: 1.0, armSwingR: -0.5, armTwistR: -0.7, elbowR: 0.5 },
  /** 감상 중 — 두 손을 모으고 조용히 서 있음 */
  listen: { armDown: 1.3, armSwing: -0.1, armTwist: -1.4, elbow: 1.2, torso: 0.03, head: 0.05 },
} satisfies Record<string, Pose>

export type PoseName = keyof typeof POSES
