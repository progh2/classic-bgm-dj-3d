import { CanvasTexture, Color, Material, Mesh, Object3D, Texture } from 'three'

/**
 * 집사가 입은 옷과 머리색을 정장 톤으로 바꾼다.
 *
 * MToon 은 `텍스처 × 색상` 으로 그리므로 재질 색만 낮추면 원래 밝은 부분만
 * 어두워지고 주황색 넥타이 같은 건 그대로 남는다. 그래서 텍스처 자체를
 * 캔버스에 다시 그리면서 채도와 밝기를 떨어뜨린 새 텍스처로 갈아 끼운다.
 *
 * 피부·얼굴·눈 재질과 그 재질이 쓰는 이미지는 건드리지 않는다. VRoid 모델이
 * 여러 부위를 한 이미지에 담는 경우가 있어 이미지 단위로 한 번 더 거른다.
 */

/** 이 문자열이 재질 이름에 들어가면 대상. */
const TARGET = /CLOTH|Tops|Bottoms|Onepice|Shoes|Accessory|HAIR/i
/** 얼굴과 눈은 절대 건드리지 않는다. */
const PROTECTED = /FACE|EYE/i
/**
 * 몸통 피부 재질에는 살결과 스타킹이 한 이미지에 들어 있다. 그대로 두면
 * 어두운 피아노 앞에서 스타킹이 흰 덩어리처럼 떠 보인다. 아주 조금만 낮춘다.
 */
const BODY = /Body_00_SKIN/i

/** 옷: 짙은 정장 톤. 머리: 따뜻한 갈색. 배경에 검정이 많아 머리까지 검으면 묻힌다. */
const FILTERS = {
  cloth: 'saturate(0.18) brightness(0.34) contrast(1.12)',
  hair: 'sepia(0.92) saturate(1.7) hue-rotate(-10deg) brightness(0.72)',
  body: 'sepia(0.22) saturate(0.92) brightness(0.76)',
} as const

type Filtered = Map<Texture, Texture>

export function dressAsButler(root: Object3D): void {
  const protectedImages = new Set<unknown>()
  const targets: { material: Material; kind: keyof typeof FILTERS }[] = []

  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    for (const material of toArray(mesh.material)) {
      const name = material.name ?? ''
      if (PROTECTED.test(name)) {
        for (const tex of texturesOf(material)) if (tex.image) protectedImages.add(tex.image)
        continue
      }
      if (BODY.test(name)) {
        targets.push({ material, kind: 'body' })
        continue
      }
      if (!TARGET.test(name)) continue
      targets.push({ material, kind: /HAIR/i.test(name) ? 'hair' : 'cloth' })
    }
  })

  // 같은 이미지를 두 번 그리지 않도록 결과를 재사용한다.
  const done: Filtered = new Map()

  for (const { material, kind } of targets) {
    let touched = false
    for (const slot of TEXTURE_SLOTS) {
      const tex = (material as unknown as Record<string, Texture | null>)[slot]
      if (!tex?.image || protectedImages.has(tex.image)) continue
      const replaced = done.get(tex) ?? filterTexture(tex, FILTERS[kind])
      if (!replaced) continue
      done.set(tex, replaced)
      ;(material as unknown as Record<string, Texture>)[slot] = replaced
      touched = true
    }

    // MToon 은 그늘 색을 따로 들고 있다. 겉면만 바꾸면 그늘이 원래 색으로 남아
    // 뒷머리처럼 그늘이 넓은 곳은 그대로 검게 보인다.
    if (kind === 'hair') {
      const shade = (material as unknown as { shadeColorFactor?: Color }).shadeColorFactor
      shade?.setHex(0x3a2415)
      if (!touched) {
        // 텍스처를 못 바꾼 재질은 색으로라도 맞춘다.
        const color = (material as unknown as { color?: Color }).color
        color?.setHex(0x8a5f3a)
      }
    }
    material.needsUpdate = true
  }
}

/** MToon 과 표준 재질에서 색을 담고 있는 슬롯. */
const TEXTURE_SLOTS = ['map', 'shadeMultiplyTexture', 'emissiveMap'] as const

function toArray(m: Material | Material[]): Material[] {
  return Array.isArray(m) ? m : [m]
}

function texturesOf(material: Material): Texture[] {
  const out: Texture[] = []
  for (const slot of TEXTURE_SLOTS) {
    const tex = (material as unknown as Record<string, Texture | null>)[slot]
    if (tex) out.push(tex)
  }
  return out
}

function filterTexture(source: Texture, filter: string): Texture | null {
  const image = source.image as CanvasImageSource & { width?: number; height?: number }
  const w = image.width ?? 0
  const h = image.height ?? 0
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.filter = filter
  ctx.drawImage(image, 0, 0, w, h)

  const out = new CanvasTexture(canvas)
  // glTF 텍스처는 flipY 가 false 다. 새 텍스처가 기본값을 쓰면 옷이 뒤집힌다.
  out.flipY = source.flipY
  out.colorSpace = source.colorSpace
  out.wrapS = source.wrapS
  out.wrapT = source.wrapT
  out.magFilter = source.magFilter
  out.minFilter = source.minFilter
  out.generateMipmaps = source.generateMipmaps
  out.needsUpdate = true
  return out
}
