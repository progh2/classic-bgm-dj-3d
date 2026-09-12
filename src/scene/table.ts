import { Box3, Group, Mesh, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface Table {
  readonly root: Object3D
  /** 물건을 올릴 상판의 높이(m). */
  readonly topY: number
  /** 상판의 가로·세로(m). 소품 배치에 쓴다. */
  readonly topSize: { width: number; depth: number }
}

/** 응접실 콘솔 테이블(Poly Haven, CC0)을 불러온다. */
export async function loadTable(url: string): Promise<Table> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const root = new Group()
  root.add(gltf.scene)

  gltf.scene.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  // 모델의 실제 크기를 재서 상판 높이를 알아낸다. 모델을 바꿔도 소품 배치가 따라온다.
  const box = new Box3().setFromObject(gltf.scene)
  const size = box.getSize(new Vector3())

  // 바닥에 닿게 내려놓는다.
  gltf.scene.position.y -= box.min.y

  return {
    root,
    topY: size.y,
    topSize: { width: size.x, depth: size.z },
  }
}
