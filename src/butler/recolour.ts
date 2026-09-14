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

/** 이 문자열이 재질 이름에 들어가면 옷으로 보고 텍스처를 다시 그린다. */
const TARGET = /CLOTH|Tops|Bottoms|Onepice|Shoes|Accessory/i
/** 머리 재질 */
const HAIR = /HAIR/i
/**
 * 살결 재질.
 *
 * 얼굴과 몸통이 서로 다른 재질이라 한쪽만 손대면 목에서 색이 갈라진다.
 * 둘을 늘 같이 다룬다. 몸통 쪽에는 살결과 스타킹이 한 이미지에 들어 있어
 * 그대로 두면 어두운 피아노 앞에서 스타킹이 흰 덩어리처럼 뜬다.
 */
const SKIN = /_00_SKIN/i
/** 눈썹·눈매·속눈썹·입·눈은 건드리지 않는다. */
const PROTECTED = /FACE|EYE/i

/** 옷은 짙은 톤으로, 살결은 아주 조금만 낮춰 하얗게 날아가지 않게 한다. */
const FILTERS = {
  cloth: 'saturate(0.18) brightness(0.34) contrast(1.12)',
  skin: 'sepia(0.14) saturate(0.96) brightness(0.88)',
} as const

type Filtered = Map<Texture, Texture>

/**
 * 머리색.
 *
 * 이 모델의 머리는 텍스처가 아니라 재질의 색 값에 들어 있다(거의 흰색에
 * 가까운 백금발). 텍스처를 다시 그리는 방식이 반만 먹혔던 이유가 이것이다.
 * 밝은 텍스처에 색을 곱하는 편이 확실하다.
 */
const HAIR_COLOUR = 0x5e3d23
const HAIR_SHADE = 0x33210f
/** 머리에 달린 리본. 모델 기본은 민트색이라 응접실과 겉돈다. */
const RIBBON_COLOUR = 0x5d1f28
const RIBBON_SHADE = 0x35121a

export function dressAsButler(root: Object3D): void {
  const protectedImages = new Set<unknown>()
  const targets: { material: Material; kind: keyof typeof FILTERS }[] = []

  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    for (const material of toArray(mesh.material)) {
      const name = material.name ?? ''
      // 살결을 먼저 가린다. 얼굴 살결의 재질 이름에도 FACE 가 들어 있어
      // 순서를 바꾸면 얼굴만 빠져 목에서 색이 갈라진다.
      if (SKIN.test(name)) {
        targets.push({ material, kind: 'skin' })
        continue
      }
      if (PROTECTED.test(name)) {
        for (const tex of texturesOf(material)) if (tex.image) protectedImages.add(tex.image)
        continue
      }
      if (HAIR.test(name)) {
        tintHair(material)
        continue
      }
      if (!TARGET.test(name)) continue
      targets.push({ material, kind: 'cloth' })
    }
  })

  // 같은 이미지를 두 번 그리지 않도록 결과를 재사용한다.
  const done: Filtered = new Map()

  for (const { material, kind } of targets) {
    for (const slot of TEXTURE_SLOTS) {
      const tex = (material as unknown as Record<string, Texture | null>)[slot]
      if (!tex?.image || protectedImages.has(tex.image)) continue
      const replaced = done.get(tex) ?? filterTexture(tex, FILTERS[kind])
      if (!replaced) continue
      done.set(tex, replaced)
      ;(material as unknown as Record<string, Texture>)[slot] = replaced
    }
    material.needsUpdate = true
  }
}

/** MToon 과 표준 재질에서 색을 담고 있는 슬롯. */
const TEXTURE_SLOTS = ['map', 'shadeMultiplyTexture', 'emissiveMap'] as const

/**
 * 머리 재질의 색을 갈색으로 돌린다. 머리에 달린 리본이 같은 이름을 달고
 * 있는데 기본이 민트색이라 응접실과 겉돈다. 초록빛이 도는 재질은 리본으로
 * 보고 짙은 포도줏빛으로 돌린다.
 */
function tintHair(material: Material): void {
  const m = material as unknown as { color?: Color; shadeColorFactor?: Color }
  const c = m.color
  if (!c) return
  const ribbon = c.g > c.r + 0.08 && c.g > c.b + 0.04
  c.setHex(ribbon ? RIBBON_COLOUR : HAIR_COLOUR)
  m.shadeColorFactor?.setHex(ribbon ? RIBBON_SHADE : HAIR_SHADE)
  material.needsUpdate = true
}

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
