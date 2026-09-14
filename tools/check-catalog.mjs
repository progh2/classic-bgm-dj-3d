#!/usr/bin/env node
/**
 * 카탈로그를 점검한다.
 *
 *   node tools/check-catalog.mjs            선정·카탈로그의 내용만 본다(빠름)
 *   node tools/check-catalog.mjs --links    스트리밍 주소가 살아 있는지 확인
 *   node tools/check-catalog.mjs --links --update
 *                                           확인 결과를 카탈로그에 적는다
 *
 * 곡을 추가한 뒤와, 한 달에 한 번쯤 링크 점검에 쓴다. 원 출처에서 파일이
 * 사라지면 재생이 끊기는데, 그 사실을 이용자보다 먼저 알아야 한다.
 */
import { readFile, writeFile } from 'node:fs/promises'

const UA = 'classic-bgm-dj-3d-check-bot/0.1 (https://github.com/progh2/classic-bgm-dj-3d)'
const args = new Set(process.argv.slice(2))
const checkLinks = args.has('--links')
const update = args.has('--update')

/** 곡 분류에 쓸 수 있는 말. 여기 없는 값은 오타로 본다. */
const VOCAB = {
  era: ['baroque', 'classical', 'romantic', 'modern', 'renaissance'],
  mood: ['calm', 'bright', 'melancholy', 'grand', 'playful', 'tense'],
  focus: ['background', 'foreground'],
  instrument: ['piano', 'string quartet', 'orchestra', 'organ', 'violin', 'cello', 'voice'],
}

const problems = []
const warnings = []
const fail = (m) => problems.push(m)
const warn = (m) => warnings.push(m)

const selection = JSON.parse(await readFile('data/selection.ko.json', 'utf8'))
const catalog = JSON.parse(await readFile('data/catalog.json', 'utf8'))

// ---- 선정 목록 ----
const seenTitles = new Set()
for (const t of selection.tracks) {
  const where = t.titleKo || t.commonsTitle
  if (!t.commonsTitle?.startsWith('File:')) fail(`${where}: commonsTitle 이 File: 로 시작하지 않는다`)
  if (seenTitles.has(t.commonsTitle)) fail(`${where}: 같은 파일이 두 번 들어 있다`)
  seenTitles.add(t.commonsTitle)

  for (const field of ['titleKo', 'workKo', 'shortNote', 'fullNote']) {
    if (!t[field]?.trim()) fail(`${where}: ${field} 가 비어 있다`)
  }
  if (t.shortNote && t.shortNote.length > 60) {
    warn(`${where}: shortNote 가 ${t.shortNote.length}자다. 말로 읽어 주므로 60자 안쪽이 좋다`)
  }
  if (!Array.isArray(t.moods) || t.moods.length === 0) fail(`${where}: moods 가 비어 있다`)
  for (const m of t.moods ?? []) {
    if (!VOCAB.mood.includes(m)) fail(`${where}: 모르는 결 '${m}'`)
  }
  for (const f of t.focus ?? []) {
    if (!VOCAB.focus.includes(f)) fail(`${where}: 모르는 존재감 '${f}'`)
  }
  for (const i of t.instruments ?? []) {
    if (!VOCAB.instrument.includes(i)) fail(`${where}: 모르는 편성 '${i}'`)
  }
}

// ---- 카탈로그 ----
const ids = new Set()
for (const e of catalog.entries) {
  const where = e.track.title
  if (ids.has(e.track.id)) fail(`${where}: id 가 겹친다 (${e.track.id})`)
  ids.add(e.track.id)

  if (!VOCAB.era.includes(e.track.era)) fail(`${where}: 모르는 시대 '${e.track.era}'`)
  if (e.rights.reviewStatus !== 'confirmed') {
    fail(`${where}: 권리 기록이 확인되지 않았다. 재생 목록에 넣지 않는다`)
  }
  if (!e.rights.sourceUrl) fail(`${where}: 출처 주소가 없다`)
  if (!e.source.audioUrl?.startsWith('https://')) fail(`${where}: 음원 주소가 https 가 아니다`)
  if (e.source.acceptsRange === false) warn(`${where}: Range 요청을 받지 않아 탐색이 안 될 수 있다`)
  if (e.note?.reviewStatus !== 'confirmed') {
    warn(`${where}: 해설이 아직 초안이다`)
  }
}

// 선정에는 있는데 카탈로그에 빠진 곡
const titles = new Set(catalog.entries.map((e) => e.rights.sourceUrl))
for (const t of selection.tracks) {
  const slug = encodeURIComponent(t.commonsTitle.replace(/^File:/, '').replace(/ /g, '_'))
  const found = [...titles].some((u) => u.includes(slug.slice(0, 30)))
  if (!found) warn(`${t.titleKo}: 선정 목록에 있으나 카탈로그에 없다. build-catalog 를 다시 돌려라`)
}

// ---- 주소 확인 ----
if (checkLinks) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let checked = 0
  for (const e of catalog.entries) {
    await sleep(400)
    let ok = false
    let status = 0
    try {
      const res = await fetch(e.source.audioUrl, { method: 'HEAD', headers: { 'User-Agent': UA } })
      ok = res.ok
      status = res.status
      if (ok) {
        e.source.byteSize = Number(res.headers.get('content-length')) || e.source.byteSize
        e.source.acceptsRange = res.headers.get('accept-ranges') === 'bytes'
      }
    } catch (err) {
      status = String(err)
    }
    e.source.availability = ok ? 'ok' : 'broken'
    e.source.lastCheckedAt = new Date().toISOString().slice(0, 10)
    if (!ok) fail(`${e.track.title}: 음원 주소가 응답하지 않는다 (${status})`)
    checked += 1
  }
  console.log(`주소 ${checked}개 확인`)

  if (update) {
    catalog.updatedAt = new Date().toISOString()
    await writeFile('data/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`)
    console.log('확인 결과를 data/catalog.json 에 적었다')
  }
}

// ---- 결과 ----
console.log(`\n곡 ${catalog.entries.length}개 · 선정 ${selection.tracks.length}개`)
for (const w of warnings) console.warn(`  경고  ${w}`)
for (const p of problems) console.error(`  문제  ${p}`)
if (problems.length > 0) {
  console.error(`\n문제 ${problems.length}건. 고치기 전에는 배포하지 않는다.`)
  process.exitCode = 1
} else {
  console.log(`\n문제 없음${warnings.length > 0 ? ` (경고 ${warnings.length}건)` : ''}`)
}
