import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { Box3, Group, Object3D, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { armQuat, POSES, type Pose, type PoseName } from './poses'
import { dressAsButler } from './recolour'

/** 집사 키를 이 값으로 맞춘다. 모델을 바꿔도 테이블과의 비례가 유지된다. */
const TARGET_HEIGHT = 1.72

/** 고개가 돌아가는 한계. 이보다 크면 몸까지 돌아야 자연스럽다. */
/** 걷는 속도(m/s)와 한 걸음의 보폭(m). 집사는 서두르지 않는다. */
const WALK_SPEED = 0.78
const STRIDE = 0.72

const HEAD_YAW_LIMIT = 0.42
const HEAD_PITCH_LIMIT = 0.22

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** VRM 표준 표정 이름. 0.x 의 joy/sorrow/fun 은 three-vrm 이 이 이름으로 넘겨준다. */
const EXPRESSION_KEYS = ['happy', 'sad', 'angry', 'relaxed', 'surprised', 'aa', 'oh', 'ih', 'ee', 'ou'] as const

const EXPRESSIONS = {
  neutral: {},
  warm: { happy: 0.42, relaxed: 0.25 },
  attentive: { relaxed: 0.3 },
  sorry: { sad: 0.55 },
} satisfies Record<string, Partial<Record<(typeof EXPRESSION_KEYS)[number], number>>>

export type ExpressionName = keyof typeof EXPRESSIONS

export interface Butler {
  readonly root: Object3D
  /** 자세를 눈으로 맞춰 보기 위한 통로. 화면에서 직접 값을 바꿔 확인한다. */
  readonly debug: { joints: Record<string, Object3D | null>; pose(): Pose }
  setPose(name: PoseName): void
  setExpression(name: ExpressionName): void
  /** 말하는 동안 입을 움직인다. 정밀 립싱크가 아니라 발화 시작/종료에 맞춘 움직임이다. */
  setTalking(on: boolean): void
  /** 목례하고 돌아온다. */
  bow(): void
  /**
   * 지금 자리에서 목표 지점까지 걸어간다. 도착하면 정면을 향해 선다.
   * 발이 바닥에 닿을 때마다 onFootstep 을 부른다.
   */
  walkTo(x: number, z: number, onFootstep?: () => void): Promise<void>
  lookAt(target: Object3D): void
  tick(nowMs: number, deltaSec: number): void
  dispose(): void
}

export async function loadButler(url: string, onProgress?: (frac: number) => void): Promise<Butler> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  const gltf = await loader.loadAsync(url, (e) => {
    if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
  })
  const vrm = gltf.userData.vrm as VRM | undefined
  if (!vrm) throw new Error('VRM 데이터가 없는 파일입니다')

  // 보이지 않는 정점·뼈를 정리하고, VRM 0.x 가 -Z 를 보는 문제를 바로잡는다.
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(vrm)

  const root = new Group()
  root.add(vrm.scene)

  const box = new Box3().setFromObject(vrm.scene)
  const height = box.max.y - box.min.y
  if (height > 0.1) vrm.scene.scale.setScalar(TARGET_HEIGHT / height)

  vrm.scene.traverse((obj) => {
    obj.castShadow = true
    obj.frustumCulled = false
  })

  // 임시 모델은 교복 차림이라 옷과 머리색을 정장 톤으로 낮춰 둔다.
  // 전용 집사 모델로 갈아 끼우면 이 호출을 지운다.
  dressAsButler(vrm.scene)

  const bone = (n: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) =>
    vrm.humanoid?.getNormalizedBoneNode(n) ?? null
  const joints = {
    spine: bone('spine'),
    chest: bone('chest') ?? bone('upperChest'),
    head: bone('head'),
    neck: bone('neck'),
    upperArmL: bone('leftUpperArm'),
    upperArmR: bone('rightUpperArm'),
    lowerArmL: bone('leftLowerArm'),
    lowerArmR: bone('rightLowerArm'),
    upperLegL: bone('leftUpperLeg'),
    upperLegR: bone('rightUpperLeg'),
    lowerLegL: bone('leftLowerLeg'),
    lowerLegR: bone('rightLowerLeg'),
    footL: bone('leftFoot'),
    footR: bone('rightFoot'),
  }

  let pose: Pose = POSES.idle
  let talking = false
  let bowUntil = 0
  let poseBeforeBow: Pose = POSES.idle
  /** 다음 눈 깜빡임까지 남은 시간(초). */
  let nextBlink = 1 + Math.random() * 3
  let blinkT = -1
  /** 눈이 좇는 대상. 고개도 여기를 향해 조금 돌린다. */
  let gazeTarget: Object3D | null = null
  /** 걷는 중일 때의 목표와 진행. 걷지 않으면 null. */
  let walk: {
    to: Vector3
    onFootstep: (() => void) | undefined
    resolve: () => void
    phase: number
    lastStepSign: number
  } | null = null
  let facing = 0
  let headYaw = 0
  let headPitch = 0

  const qArmL = new Quaternion()
  const qArmR = new Quaternion()
  const qElbowL = new Quaternion()
  const qElbowR = new Quaternion()
  const qTorso = new Quaternion()
  const qHead = new Quaternion()
  const qHeadYaw = new Quaternion()
  const qLeg = new Quaternion()
  const walkDir = new Vector3()
  const gazeWorld = new Vector3()
  const headWorld = new Vector3()
  const headNode = vrm.humanoid?.getRawBoneNode('head') ?? joints.head
  const AX_X = new Vector3(1, 0, 0)
  // 팔을 내린 뒤의 국소 좌표에서 팔꿈치 굽힘은 Y축 회전이고, 좌우가 서로 반대다.
  const AX_Y = new Vector3(0, 1, 0)
  const AX_Y_WORLD = new Vector3(0, 1, 0)

  const setExpressionValues = (name: ExpressionName): void => {
    const m = vrm.expressionManager
    if (!m) return
    for (const k of EXPRESSION_KEYS) m.setValue(k, 0)
    for (const [k, v] of Object.entries(EXPRESSIONS[name])) m.setValue(k, v as number)
  }
  setExpressionValues('warm')

  const slerp = (node: Object3D | null, target: Quaternion, k: number): void => {
    if (node) node.quaternion.slerp(target, k)
  }

  return {
    root,
    debug: { joints, pose: () => pose },

    setPose(name) {
      pose = POSES[name]
    },

    setExpression(name) {
      setExpressionValues(name)
    },

    setTalking(on) {
      talking = on
      if (!on) {
        const m = vrm.expressionManager
        m?.setValue('aa', 0)
        m?.setValue('ih', 0)
      }
    },

    bow() {
      // 돌아갈 자세를 기억해 두고 잠시 목례한다.
      poseBeforeBow = pose === POSES.bow ? poseBeforeBow : pose
      pose = POSES.bow
      bowUntil = performance.now() + 2400
    },

    walkTo(x, z, onFootstep) {
      return new Promise<void>((resolve) => {
        // 걷는 도중 다시 부르면 앞의 약속을 먼저 매듭짓는다.
        walk?.resolve()
        walk = {
          to: new Vector3(x, 0, z),
          onFootstep,
          resolve,
          phase: 0,
          lastStepSign: 0,
        }
      })
    },

    lookAt(target) {
      gazeTarget = target
      if (vrm.lookAt) vrm.lookAt.target = target
    },

    tick(nowMs, deltaSec) {
      if (walk) {
        walkDir.copy(walk.to).sub(root.position)
        walkDir.y = 0
        const distance = walkDir.length()

        if (distance < 0.04) {
          // 도착 — 다리를 모으고 정면으로 돌아선다.
          root.position.set(walk.to.x, 0, walk.to.z)
          const done = walk
          walk = null
          done.resolve()
        } else {
          const step = Math.min(distance, WALK_SPEED * deltaSec)
          root.position.addScaledVector(walkDir.normalize(), step)
          walk.phase += (WALK_SPEED / STRIDE) * Math.PI * 2 * deltaSec
          facing = Math.atan2(walkDir.x, walkDir.z)

          // 발이 가장 뒤로 갔다가 바닥을 짚는 순간에 소리를 낸다.
          const sign = Math.sign(Math.sin(walk.phase))
          if (sign !== 0 && sign !== walk.lastStepSign) {
            walk.lastStepSign = sign
            walk.onFootstep?.()
          }
        }
      } else {
        facing += (0 - facing) * Math.min(1, deltaSec * 3)
      }
      root.rotation.y = facing

      // 다리 — 걸을 때만 움직이고, 서 있으면 곧게 편다.
      const swing = walk ? Math.sin(walk.phase) : 0
      const lift = walk ? Math.max(0, -Math.cos(walk.phase)) : 0
      const legK = Math.min(1, deltaSec * 12)
      slerp(joints.upperLegL, qLeg.setFromAxisAngle(AX_X, swing * 0.42), legK)
      slerp(joints.upperLegR, qLeg.setFromAxisAngle(AX_X, -swing * 0.42), legK)
      slerp(joints.lowerLegL, qLeg.setFromAxisAngle(AX_X, -Math.max(0, -swing) * 0.75), legK)
      slerp(joints.lowerLegR, qLeg.setFromAxisAngle(AX_X, -Math.max(0, swing) * 0.75), legK)
      slerp(joints.footL, qLeg.setFromAxisAngle(AX_X, lift * 0.2), legK)
      slerp(joints.footR, qLeg.setFromAxisAngle(AX_X, lift * 0.2), legK)
      // 걸을 때 몸이 조금 오르내린다.
      root.position.y = walk ? Math.abs(Math.sin(walk.phase)) * 0.018 : 0

      if (bowUntil > 0 && nowMs > bowUntil) {
        bowUntil = 0
        pose = poseBeforeBow
      }

      // 숨쉬기 — 가슴을 아주 조금 올렸다 내린다.
      const breath = Math.sin(nowMs / 2600) * 0.012

      const k = Math.min(1, deltaSec * 9)
      const downR = pose.armDownR ?? pose.armDown
      const swingR = pose.armSwingR ?? pose.armSwing
      const twistR = pose.armTwistR ?? pose.armTwist
      const elbowR = pose.elbowR ?? pose.elbow

      // 걸을 때는 모은 손을 풀고 팔을 조금 흔든다.
      const gaitL = walk ? Math.sin(walk.phase) * 0.26 : 0
      slerp(joints.upperArmL, armQuat(qArmL, 1, pose.armDown, pose.armSwing - gaitL, pose.armTwist), k)
      slerp(joints.upperArmR, armQuat(qArmR, -1, downR, swingR + gaitL, twistR), k)
      slerp(joints.lowerArmL, qElbowL.setFromAxisAngle(AX_Y, -pose.elbow), k)
      slerp(joints.lowerArmR, qElbowR.setFromAxisAngle(AX_Y, elbowR), k)
      slerp(joints.spine, qTorso.setFromAxisAngle(AX_X, pose.torso + breath), k)

      // 눈만 굴리면 노려보는 것처럼 보인다. 고개도 조금 따라 돌린다.
      // 눈이 먼저 가고 고개가 뒤따르도록 고개 쪽 추종은 더 느리게 둔다.
      if (gazeTarget) {
        gazeTarget.getWorldPosition(gazeWorld)
        headNode?.getWorldPosition(headWorld)
        gazeWorld.sub(headWorld)
        // 집사는 +Z 를 보고 서 있다. 그 기준으로 좌우·상하 각을 잰다.
        const wantYaw = clamp(Math.atan2(gazeWorld.x, gazeWorld.z), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT)
        const flat = Math.hypot(gazeWorld.x, gazeWorld.z)
        const wantPitch = clamp(-Math.atan2(gazeWorld.y, flat), -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT)
        headYaw += (wantYaw - headYaw) * Math.min(1, deltaSec * 2.6)
        headPitch += (wantPitch - headPitch) * Math.min(1, deltaSec * 2.6)
      }
      qHead.setFromAxisAngle(AX_X, pose.head - breath * 0.5 + headPitch)
      qHeadYaw.setFromAxisAngle(AX_Y_WORLD, headYaw)
      slerp(joints.head, qHead.multiply(qHeadYaw), k)

      // 눈 깜빡임 — 불규칙한 간격으로 짧게.
      const m = vrm.expressionManager
      if (m) {
        if (blinkT >= 0) {
          blinkT += deltaSec
          m.setValue('blink', blinkT < 0.09 ? blinkT / 0.09 : Math.max(0, 1 - (blinkT - 0.09) / 0.09))
          if (blinkT > 0.18) {
            blinkT = -1
            m.setValue('blink', 0)
            nextBlink = 1.5 + Math.random() * 4
          }
        } else {
          nextBlink -= deltaSec
          if (nextBlink <= 0) blinkT = 0
        }

        if (talking) {
          // 두 개의 모음 셰이프를 다른 주기로 겹쳐 기계적으로 보이지 않게 한다.
          m.setValue('aa', Math.abs(Math.sin(nowMs / 168)) * 0.3)
          m.setValue('ih', Math.abs(Math.sin(nowMs / 247)) * 0.12)
        }
      }

      vrm.update(deltaSec)
    },

    dispose() {
      VRMUtils.deepDispose(vrm.scene)
      root.clear()
    },
  }
}
