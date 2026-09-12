#!/usr/bin/env node
/**
 * 벽에 걸 그림을 고른다.
 *
 * The Met 오픈 액세스 — 퍼블릭 도메인 작품의 이미지는 CC0 다. 응접실에 어울리는
 * 유럽 회화 가운데 실제로 받아지는 것만 골라 data/artworks.json 에 적는다.
 *
 * 음원과 같은 원칙이다. 이미지 파일은 이 저장소에 담지 않고 주소만 적어 둔다.
 */
import { writeFile } from 'node:fs/promises'

const API = 'https://collectionapi.metmuseum.org/public/collection/v1'
const UA = 'classic-bgm-dj-3d-artwork-bot/0.1 (https://github.com/progh2/classic-bgm-dj-3d)'
const OUT = 'data/artworks.json'
/** 응접실 벽에 어울릴 만한 갈래 */
const QUERIES = ['portrait', 'still life', 'landscape', 'interior', 'musician']
const WANT = 18

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Met API ${res.status} ${path}`)
  return res.json()
}

/** 그림이 실제로 받아지는지, 브라우저가 텍스처로 쓸 수 있는지 본다. */
async function probe(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } })
    return {
      ok: res.ok,
      bytes: Number(res.headers.get('content-length')) || null,
      // 다른 출처의 이미지를 텍스처로 쓰려면 CORS 가 열려 있어야 한다.
      cors: res.headers.get('access-control-allow-origin') === '*',
    }
  } catch {
    return { ok: false, bytes: null, cors: false }
  }
}

const picked = []
const seen = new Set()

for (const q of QUERIES) {
  const params = new URLSearchParams({
    q,
    hasImages: 'true',
    medium: 'Paintings',
    departmentId: '11', // European Paintings
  })
  const found = await api(`/search?${params}`)
  const ids = (found.objectIDs ?? []).slice(0, 40)

  for (const id of ids) {
    if (picked.length >= WANT) break
    if (seen.has(id)) continue
    seen.add(id)
    await sleep(120)

    let o
    try {
      o = await api(`/objects/${id}`)
    } catch {
      continue
    }
    if (!o.isPublicDomain) continue
    const image = o.primaryImageSmall || o.primaryImage
    if (!image) continue

    const head = await probe(image)
    if (!head.ok || !head.cors) continue

    picked.push({
      id: o.objectID,
      title: o.title,
      artist: o.artistDisplayName || '작가 미상',
      date: o.objectDate || '',
      medium: o.medium || '',
      imageUrl: image,
      byteSize: head.bytes,
      pageUrl: o.objectURL,
      licence: 'CC0',
      source: 'The Metropolitan Museum of Art — Open Access',
      checkedAt: new Date().toISOString().slice(0, 10),
      theme: q,
    })
    console.log(`+ ${o.artistDisplayName || '미상'} — ${o.title}`)
  }
  if (picked.length >= WANT) break
}

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      surveyedAt: new Date().toISOString(),
      source: 'The Metropolitan Museum of Art — Open Access',
      licence: 'CC0',
      licenceUrl: 'https://www.metmuseum.org/policies/image-resources',
      note: '이미지 파일은 저장소에 담지 않는다. 주소만 적어 두고 브라우저가 원 출처에서 받는다.',
      count: picked.length,
      artworks: picked,
    },
    null,
    2,
  )}\n`,
)
console.log(`${picked.length}점 → ${OUT}`)
