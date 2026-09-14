import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { Box3, Group, Object3D, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { armQuat, POSES, type Pose, type PoseName } from './poses'
import { dressAsButler } from './recolour'

/** 집사 키를 이 값으로 맞춘다. 모델을 바꿔도 테이블과의 비례가 유지된다. */
const TARGET_HEIGHT = 1.72

/** 고개가 돌아가는 한계. 이보다 크면 몸까지 돌아야 자연스럽다. */
/**
 * 걷는 속도(m/s)와 한 걸음의 보폭(m).
 *
 * 성큼성큼 걷지 않도록 보폭과 속도를 낮춘다. 다만 무릎 굽힘까지 같이 줄이면
 * 다리가 뻣뻣한 채로 앞뒤로 흔들리는 인형처럼 보인다. 보폭은 좁게 두고
 * 무릎은 제대로 굽힌다.
 */
const WALK_SPEED = 0.42
const STRIDE = 0.34

/**
 * 앉았을 때 몸을 띄우는 값.
 *
 * 엉덩이 뼈를 앉는 면에 정확히 맞추면 주저앉은 것처럼 보이고, 손이 건반보다
 * 아래로 내려가 건반 속에 파묻힌다. 의자를 높이는 대신 앉은 몸을 올린다.
 */
const SEAT_LIFT = 0.18

const HEAD_YAW_LIMIT = 0.42
const HEAD_PITCH_LIMIT = 0.22

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * 체형을 한 단계 줄인다.
 *
 * 본체 메시에는 체형 모프가 없어서 뼈 크기로만 줄일 수 있다. VRoid 모델에는
 * 가슴에 전용 뼈(J_Sec_*_Bust)가 있어 그쪽은 따로 줄인다. 엉덩이는 전용 뼈가
 * 없고 Hips 는 온몸의 뿌리라, 가로로만 아주 조금 줄여 전체를 갸름하게 한다.
 * 세로는 건드리지 않아 키는 그대로다.
 */
function slimFigure(vrm: VRM): void {
  vrm.scene.traverse((node) => {
    if (/Bust/i.test(node.name)) node.scale.setScalar(0.8)
    if (/J_Bip_C_Hips$/i.test(node.name)) node.scale.set(0.94, 1, 0.94)
  })
}

/** from 에서 to 까지 가까운 쪽으로 도는 각도 */
function shortestTurn(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

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
  /** 음악에 맞춰 고개를 아주 조금 흔든다. 재생 중에만 켠다. */
  setGroove(on: boolean): void
  /**
   * 의자에 앉힌다. 앉으면 걷지 않고 다리를 굽힌 채로 있는다.
   * seatY 는 앉는 면의 높이, facing 은 몸이 향할 방향이다.
   */
  sit(on: boolean, seatY?: number, facing?: number): void
  /** 걷지 않고 그 자리로 옮겨 놓는다. 의자에 앉힐 때처럼 짧은 거리에 쓴다. */
  placeAt(x: number, z: number, faceY?: number): void
  /** 앉은 채로 건반을 친다. */
  setPlaying(on: boolean): void
  /** 말이 끝난 뒤 등 지금 처지에 맞는 자세로 돌아간다. */
  restPose(): void
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

  // 임시 모델이라 옷과 머리색을 응접실에 맞게 낮춰 둔다.
  // 전용 모델로 갈아 끼우면 이 호출을 지운다.
  dressAsButler(vrm.scene)
  slimFigure(vrm)

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
  let groove = false
  let seated = false
  let seatY = 0
  /** 서 있을 때 몸이 향할 방향. 걷지 않을 때 이쪽으로 돌아온다. */
  let standFacing = 0
  let playingKeys = false
  /** 건반을 치는 정도. 갑자기 팔을 뻗지 않도록 천천히 오른다. */
  let playAmount = 0
  /** 리듬을 타는 정도. 갑자기 흔들지 않도록 천천히 오르내린다. */
  let grooveAmount = 0
  let bowUntil = 0
  let poseBeforeBow: Pose = POSES.idle
  /** 다음 눈 깜빡임까지 남은 시간(초). */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

  // 서 있을 때 엉덩이 뼈가 발밑에서 얼마나 높은가. 앉힐 때 이만큼 내린다.
  const hipRestY = (() => {
    const hips = vrm.humanoid?.getRawBoneNode('hips')
    if (!hips) return TARGET_HEIGHT * 0.53
    // 장면에 넣기 전이라 행렬이 낡아 있다. 재기 전에 갱신한다.
    root.updateWorldMatrix(true, true)
    const world = new Vector3()
    hips.getWorldPosition(world)
    const y = world.y - root.position.y
    return y > 0.3 && y < TARGET_HEIGHT ? y : TARGET_HEIGHT * 0.53
  })()
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

    setGroove(on) {
      groove = on
    },

    placeAt(x, z, faceY) {
      root.position.x = x
      root.position.z = z
      if (faceY !== undefined) {
        standFacing = faceY
        facing = faceY
        root.rotation.y = faceY
      }
      // 한 번에 옮기면 치마와 머리카락을 흔드는 물리 뼈가 제자리를 잃고
      // 크게 펄럭인다. 옮긴 자리에서 다시 재운다.
      root.updateWorldMatrix(true, true)
      vrm.springBoneManager?.reset()
    },

    sit(on, y = 0, facing = 0) {
      seated = on
      if (on) {
        seatY = y
        standFacing = facing
        pose = POSES.sit
      } else {
        standFacing = 0
        playingKeys = false
        pose = POSES.idle
      }
    },

    setPlaying(on) {
      playingKeys = on
      pose = on ? POSES.keys : seated ? POSES.sit : POSES.idle
    },

    restPose() {
      pose = seated ? (playingKeys ? POSES.keys : POSES.sit) : POSES.idle
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
      // 걸으려면 먼저 일어서야 한다.
      if (seated) {
        seated = false
        playingKeys = false
        standFacing = 0
        pose = POSES.idle
      }
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
        // 각도를 그냥 빼면 먼 쪽으로 돌아 여러 바퀴를 도는 것처럼 보인다.
        // 늘 가까운 쪽으로 돌아서게 -π~π 로 접어서 더한다.
        facing += shortestTurn(facing, standFacing) * Math.min(1, deltaSec * 3)
      }
      root.rotation.y = facing

      // 앉아 있으면 어떤 자세를 짓든 다리는 접은 채로 둔다. 말을 하거나
      // 인사를 하느라 자세가 바뀌어도 다리가 펴지면 의자에서 일어난 꼴이 된다.
      const legPose = seated ? (playingKeys ? POSES.keys : POSES.sit) : pose

      // 다리 — 걸을 때는 번갈아 내딛고, 앉으면 굽힌 채로, 서면 곧게 편다.
      //
      // 무릎을 발이 뒤에 있을 때 굽히면 뒷발을 차올리는 것처럼 보인다.
      // 사람은 다리를 앞으로 옮기는 동안에만 무릎을 굽혀 발끝을 띄운다.
      // 그래서 굽힘을 각도(sin)가 아니라 각도의 변화(cos)에 물린다.
      const swing = walk ? Math.sin(walk.phase) : 0
      const carryL = walk ? Math.max(0, Math.cos(walk.phase)) : 0
      const carryR = walk ? Math.max(0, -Math.cos(walk.phase)) : 0
      const legK = Math.min(1, deltaSec * 12)
      const sitHip = legPose.hip ?? 0
      const sitKnee = legPose.knee ?? 0
      const sitFoot = legPose.foot ?? 0
      // 앉은 다리는 좌우를 조금 어긋나게 둔다. 딱 붙이면 인형처럼 보인다.
      slerp(joints.upperLegL, qLeg.setFromAxisAngle(AX_X, sitHip + swing * 0.28), legK)
      slerp(joints.upperLegR, qLeg.setFromAxisAngle(AX_X, sitHip * 0.94 - swing * 0.28), legK)
      slerp(joints.lowerLegL, qLeg.setFromAxisAngle(AX_X, sitKnee - carryL * 0.52), legK)
      slerp(joints.lowerLegR, qLeg.setFromAxisAngle(AX_X, sitKnee * 0.96 - carryR * 0.52), legK)
      slerp(joints.footL, qLeg.setFromAxisAngle(AX_X, sitFoot + carryL * 0.12), legK)
      slerp(joints.footR, qLeg.setFromAxisAngle(AX_X, sitFoot + carryR * 0.12), legK)

      // 뿌리는 발밑이다. 앉는 면 높이를 그대로 주면 엉덩이가 그만큼 더 올라가
      // 공중에 뜬다. 서 있을 때의 엉덩이 높이만큼 내려 앉혀야 한다.
      // 앉고 서는 높이를 한 번에 바꾸면 치맛자락을 흔드는 물리 뼈가 크게 튄다.
      // 목표 높이로 천천히 옮긴다.
      const wantY = seated && !walk
        ? seatY - hipRestY + SEAT_LIFT
        : walk
          ? Math.abs(Math.sin(walk.phase * 2)) * 0.009
          : 0
      root.position.y += (wantY - root.position.y) * Math.min(1, deltaSec * 4)

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

      // 건반을 치는 동안 두 팔이 번갈아 오르내린다.
      playAmount += ((playingKeys ? 1 : 0) - playAmount) * Math.min(1, deltaSec * 2)
      const keysL = reduceMotion ? 0 : Math.sin(nowMs / 430) * 0.09 * playAmount
      const keysR = reduceMotion ? 0 : Math.sin(nowMs / 430 + 1.7) * 0.09 * playAmount

      // 걸을 때는 모은 손을 풀고 팔을 조금 흔든다.
      const gaitL = walk ? Math.sin(walk.phase) * 0.08 : 0
      slerp(
        joints.upperArmL,
        armQuat(qArmL, 1, pose.armDown + keysL, pose.armSwing - gaitL, pose.armTwist),
        k,
      )
      slerp(joints.upperArmR, armQuat(qArmR, -1, downR + keysR, swingR + gaitL, twistR), k)
      slerp(joints.lowerArmL, qElbowL.setFromAxisAngle(AX_Y, -(pose.elbow + keysL * 0.6)), k)
      slerp(joints.lowerArmR, qElbowR.setFromAxisAngle(AX_Y, elbowR + keysR * 0.6), k)
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
      // 이 모델은 VRM 0.x 라 rotateVRM0 으로 180° 돌려 세운다. 그래서 머리 뼈의
      // +X 회전은 고개를 드는 쪽이 된다. 자세 값은 "앞으로(+) 숙임"으로 읽히도록
      // 적어 두고, 적용할 때 한 번에 뒤집는다.
      // 리듬 타기 — 고개를 좌우로 아주 조금, 위아래로는 그보다 더 조금.
      grooveAmount += ((groove ? 1 : 0) - grooveAmount) * Math.min(1, deltaSec * 1.4)
      const swayYaw = reduceMotion ? 0 : Math.sin(nowMs / 940) * 0.055 * grooveAmount
      const swayPitch = reduceMotion ? 0 : Math.sin(nowMs / 1490) * 0.03 * grooveAmount

      qHead.setFromAxisAngle(AX_X, -(pose.head - breath * 0.5 + headPitch + swayPitch))
      qHeadYaw.setFromAxisAngle(AX_Y_WORLD, headYaw + swayYaw)
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
