import { RepeatWrapping, SRGBColorSpace, TextureLoader, type MeshStandardMaterial } from 'three'

/**
 * Poly Haven 텍스처 한 벌(diff / nor_gl / arm)을 재질에 물린다.
 *
 * ARM 은 한 이미지에 R=차폐, G=거칠기, B=금속을 담고 있다. 세 채널을 같은
 * 이미지로 주되 금속은 나무·천에 필요 없으므로 metalness 를 0 으로 못 박는다.
 * 처음에 바닥을 금속으로 물렸다가 마루가 거울처럼 번들거렸다.
 */
export interface TextureSetOptions {
  /** 가로·세로로 몇 번 반복할지 */
  repeat: [number, number]
  /** 베이스 컬러에 곱할 색. 텍스처가 밝으면 여기서 눌러 준다. */
  tint?: number
  /** 거칠기 하한. 1 에 가까울수록 덜 번들거린다. */
  roughness?: number
  /** 이 재질이 환경광을 얼마나 받을지 */
  envMapIntensity?: number
}

const loader = new TextureLoader()

export async function applyTextureSet(
  material: MeshStandardMaterial,
  baseUrl: string,
  name: string,
  options: TextureSetOptions,
): Promise<void> {
  const load = async (suffix: string, srgb: boolean) => {
    const t = await loader.loadAsync(`${baseUrl}${name}_${suffix}_1k.jpg`)
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
    t.repeat.set(options.repeat[0], options.repeat[1])
    if (srgb) t.colorSpace = SRGBColorSpace
    return t
  }

  const [diff, normal, arm] = await Promise.all([
    load('diff', true),
    load('nor_gl', false),
    load('arm', false),
  ])

  material.map = diff
  material.normalMap = normal
  material.aoMap = arm
  material.roughnessMap = arm
  material.roughness = options.roughness ?? 1
  material.metalness = 0
  material.color.setHex(options.tint ?? 0xffffff)
  if (options.envMapIntensity !== undefined) material.envMapIntensity = options.envMapIntensity
  material.needsUpdate = true
}
