import { Quaternion, Vector3 } from 'three'

/**
 * VRM 휴머노이드의 정규화 자세는 T 포즈다. 오일러 각으로 "팔을 내린 뒤 앞뒤로
 * 흔든다"를 쓰면 순서가 모호해지므로, 자세를 값으로 적고 쿼터니언으로 합성한다.
 *
 *   armDown  T 포즈에서 팔을 얼마나 내렸는가 (π/2 ≈ 옆으로 나란히, 1.4 ≈ 몸에 붙음)
 *   armSwing 내린 팔을 앞(−)/뒤(+)로 흔든 정도
 *   elbow    팔꿈치 굽힘, torso/head 앞으로(+) 숙임
 */
export interface Pose {
  armDown: number
  armSwing: number
  elbow: number
  torso: number
  head: number
  /** 좌우를 따로 줄 때만 사용한다. */
  armDownR?: number
  armSwingR?: number
  elbowR?: number
}

const AX_X = new Vector3(1, 0, 0)
const AX_Z = new Vector3(0, 0, 1)
const qA = new Quaternion()
const qB = new Quaternion()

/** side: +1 = 왼팔, -1 = 오른팔 */
export function armQuat(out: Quaternion, side: 1 | -1, down: number, swing: number): Quaternion {
  qA.setFromAxisAngle(AX_Z, down * side)
  qB.setFromAxisAngle(AX_X, swing)
  return out.copy(qB).multiply(qA)
}

/** 집사의 기본 자세. 한 손을 배 앞에 두는 정중한 대기 자세를 기본으로 한다. */
export const POSES = {
  /** 대기 — 오른손을 배 앞에, 왼팔은 몸에 붙임 */
  idle: { armDown: 1.34, armSwing: 0.02, elbow: 0.22, torso: 0.0, head: 0.0,
          armDownR: 1.16, armSwingR: -0.26, elbowR: 1.24 },
  /** 목례 — 허리를 숙이고 오른손을 가슴께로 */
  bow: { armDown: 1.3, armSwing: 0.06, elbow: 0.3, torso: 0.42, head: 0.16,
         armDownR: 1.0, armSwingR: -0.44, elbowR: 1.52 },
  /** 말하는 중 — 대기보다 조금 열린 자세 */
  speak: { armDown: 1.3, armSwing: -0.02, elbow: 0.3, torso: -0.02, head: -0.03,
           armDownR: 1.1, armSwingR: -0.3, elbowR: 1.16 },
  /** 권함 — 한 손을 테이블 쪽으로 내밀어 안내 */
  present: { armDown: 1.34, armSwing: 0.02, elbow: 0.2, torso: 0.04, head: 0.04,
             armDownR: 0.82, armSwingR: -0.62, elbowR: 0.44 },
  /** 감상 중 — 두 손을 앞으로 모으고 조용히 서 있음 */
  listen: { armDown: 1.2, armSwing: -0.2, elbow: 1.16, torso: 0.04, head: 0.06,
            armDownR: 1.2, armSwingR: -0.22, elbowR: 1.2 },
} satisfies Record<string, Pose>

export type PoseName = keyof typeof POSES
