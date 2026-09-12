import { Quaternion, Vector3 } from 'three'

/**
 * VRM 휴머노이드의 정규화 자세는 T 포즈다. 오일러 각으로 "팔을 내린 뒤 앞뒤로
 * 흔든다"를 쓰면 순서가 모호해지므로, 자세를 값으로 적고 쿼터니언으로 합성한다.
 *
 *   armDown  T 포즈에서 팔을 얼마나 내렸는가 (π/2 ≈ 옆으로 나란히, 1.4 ≈ 몸에 붙음)
 *   armSwing 내린 팔을 앞(−)/뒤(+)로 흔든 정도
 *   armTwist 팔을 제 축으로 비튼 정도. 팔꿈치가 굽는 방향을 정한다
 *            (0 이면 카메라 쪽으로, −1.3 쯤이면 몸 안쪽으로 모인다)
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
  // 비틀기는 좌우를 뒤집지 않는다. 팔꿈치 회전이 이미 좌우 반대 부호라
  // 여기서 또 뒤집으면 한쪽 팔만 바깥으로 벌어진다. 화면에서 확인한 값이다.
  qC.setFromAxisAngle(AX_X, twist)
  return out.copy(qB).multiply(qA).multiply(qC)
}

/** 집사의 기본 자세. 한 손을 배 앞에 두는 정중한 대기 자세를 기본으로 한다. */
export const POSES = {
  // 팔꿈치를 너무 굽히면 두 손이 서로를 지나쳐 팔짱을 낀 것처럼 보인다.
  // 한쪽 손이 다른 손 위에 가볍게 얹히도록 좌우를 조금 어긋나게 둔다.

  /** 대기 — 오른손을 왼손 위에 얹은 정중한 자세 */
  idle: { armDown: 1.26, armSwing: 0.3, armTwist: -1.24, elbow: 1.06, torso: 0.0, head: 0.0,
          armDownR: 1.22, armSwingR: 0.34, armTwistR: -1.34, elbowR: 0.98 },
  /** 목례 — 손은 모은 채 허리를 숙인다 */
  bow: { armDown: 1.28, armSwing: 0.28, armTwist: -1.24, elbow: 1.1, torso: 0.42, head: 0.16,
         armDownR: 1.24, armSwingR: 0.32, armTwistR: -1.34, elbowR: 1.02 },
  /** 말하는 중 — 손을 조금 풀고 몸을 살짝 편다 */
  speak: { armDown: 1.28, armSwing: 0.26, armTwist: -1.2, elbow: 0.94, torso: -0.02, head: -0.03,
           armDownR: 1.24, armSwingR: 0.3, armTwistR: -1.3, elbowR: 0.88 },
  /** 권함 — 오른손을 테이블 쪽으로 내밀어 안내한다 */
  present: { armDown: 1.26, armSwing: 0.3, armTwist: -1.24, elbow: 1.06, torso: 0.04, head: 0.04,
             armDownR: 0.95, armSwingR: 0.12, armTwistR: -0.5, elbowR: 0.5 },
  /** 감상 중 — 손을 모으고 조용히 선다 */
  listen: { armDown: 1.26, armSwing: 0.32, armTwist: -1.26, elbow: 1.1, torso: 0.03, head: 0.05,
            armDownR: 1.22, armSwingR: 0.36, armTwistR: -1.36, elbowR: 1.02 },
} satisfies Record<string, Pose>

export type PoseName = keyof typeof POSES
