#!/usr/bin/env node
/**
 * data/selection.ko.json 에서 고른 곡의 스트리밍 주소와 권리 증적을 확인해
 * data/catalog.json 을 만든다.
 *
 *   node tools/build-catalog.mjs
 *
 * 음원 파일은 저장소에 담지 않는다. Wikimedia Commons 가 만들어 둔 MP3/OGG
 * 변환본을 브라우저가 직접 받아 재생한다. 그래서 이 도구는 주소·형식·길이·
 * 라이선스만 기록하고 내려받지 않는다.
 */
import { readFile, writeFile } from 'node:fs/promises'

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'classic-bgm-dj-3d-catalog-bot/0.1 (https://github.com/progh2/classic-bgm-dj-3d)'
const SELECTION = 'data/selection.ko.json'
const CANDIDATES = 'data/candidates.json'
const OUT = 'data/catalog.json'

const COMPOSERS = {
  'Bach, J S': { ko: '바흐', full: 'Johann Sebastian Bach', era: 'baroque' },
  Beethoven: { ko: '베토벤', full: 'Ludwig van Beethoven', era: 'classical' },
  Brahms: { ko: '브람스', full: 'Johannes Brahms', era: 'romantic' },
  Borodin: { ko: '보로딘', full: 'Alexander Borodin', era: 'romantic' },
  Schubert: { ko: '슈베르트', full: 'Franz Schubert', era: 'romantic' },
  Mozart: { ko: '모차르트', full: 'Wolfgang Amadeus Mozart', era: 'classical' },
  Mendelssohn: { ko: '멘델스존', full: 'Felix Mendelssohn', era: 'romantic' },
  Haydn: { ko: '하이든', full: 'Joseph Haydn', era: 'classical' },
  Grieg: { ko: '그리그', full: 'Edvard Grieg', era: 'romantic' },
  Tchaikovsky: { ko: '차이코프스키', full: 'Pyotr Ilyich Tchaikovsky', era: 'romantic' },
  'Dvořák': { ko: '드보르작', full: 'Antonín Dvořák', era: 'romantic' },
  Smetana: { ko: '스메타나', full: 'Bedřich Smetana', era: 'romantic' },
  Suk: { ko: '수크', full: 'Josef Suk', era: 'romantic' },
  'Rimsky Korsakov': { ko: '림스키코르사코프', full: 'Nikolai Rimsky-Korsakov', era: 'romantic' },
}

/** Commons 가 연주 단체를 표기하는 이름과 실제 연주자. */
const PERFORMERS = {
  'Musopen Symphony': 'Musopen Symphony (체코 국립 교향악단)',
  'Musopen String Quartet': 'Musopen String Quartet',
  'Shelley Katz': 'Shelley Katz (피아노)',
  'Paul Pitman': 'Paul Pitman (피아노)',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const selection = JSON.parse(await readFile(SELECTION, 'utf8'))
const candidates = JSON.parse(await readFile(CANDIDATES, 'utf8'))
const byTitle = new Map(candidates.files.map((f) => [f.commonsTitle, f]))

const titles = selection.tracks.map((t) => t.commonsTitle)
const derivatives = await fetchDerivatives(titles)

const entries = []
const problems = []

for (const pick of selection.tracks) {
  const file = byTitle.get(pick.commonsTitle)
  if (!file) {
    problems.push(`후보 목록에 없음: ${pick.commonsTitle}`)
    continue
  }
  // 라이선스는 파일마다 다시 확인한다. 카테고리 단위로 일괄 처리하지 않는다.
  if (file.copyrighted !== 'False') {
    problems.push(`퍼블릭 도메인이 아님: ${pick.commonsTitle}`)
    continue
  }
  const derived = derivatives.get(pick.commonsTitle)
  const mp3 = derived?.find((d) => d.transcodekey === 'mp3')
  const ogg = derived?.find((d) => d.transcodekey === 'ogg')
  if (!mp3) {
    // 변환본이 없으면 원본 FLAC 뿐인데 용량이 커서 스트리밍에 맞지 않는다.
    problems.push(`MP3 변환본 없음: ${pick.commonsTitle}`)
    continue
  }

  const parsed = parseTitle(pick.commonsTitle)
  const id = slug(pick.commonsTitle.replace(/^File:/, '').replace(/\.flac$/i, ''))

  await sleep(500) // upload.wikimedia.org 에 몰아 보내지 않는다
  const head = await probe(clean(mp3.src))
  if (!head.ok) problems.push(`스트리밍 주소 확인 실패(${head.status}): ${pick.commonsTitle}`)

  entries.push({
    track: {
      id,
      workId: slug(`${parsed.composerKey}-${workTitleOf(parsed.title)}`),
      recordingId: id,
      title: pick.titleKo,
      originalTitle: parsed.title,
      composer: parsed.ko,
      composerOriginal: parsed.full,
      performer: parsed.performer,
      era: parsed.era,
      instruments: pick.instruments,
      moods: pick.moods,
      focus: pick.focus,
      durationSec: file.durationSec,
    },
    source: {
      trackId: id,
      provider: 'file',
      audioUrl: clean(mp3.src),
      altUrls: ogg ? [clean(ogg.src)] : [],
      mimeType: 'audio/mpeg',
      byteSize: head.byteSize,
      /** Range 요청을 받아야 탐색(seek)이 동작한다. */
      acceptsRange: head.acceptsRange,
      availability: head.ok ? 'ok' : 'broken',
      lastCheckedAt: today(),
    },
    rights: {
      targetId: id,
      targetKind: 'track',
      workRights: `작곡: ${parsed.full}. 저작권 보호기간 만료로 퍼블릭 도메인.`,
      recordingRights: `연주: ${parsed.performer}. Musopen 이 이 녹음을 퍼블릭 도메인으로 공개.`,
      licenseId: file.license,
      licenseUrl: file.licenseUrl ?? null,
      sourceUrl: file.pageUrl,
      rightsHolder: 'Musopen',
      attribution: null,
      modifications: 'Wikimedia Commons 가 만든 MP3 변환본을 그대로 재생. 이 서비스는 음원을 저장하거나 변형하지 않음.',
      evidenceUrl: file.pageUrl,
      originalFormat: `${file.mimeType}, ${(file.byteSize / 1e6).toFixed(1)}MB`,
      checkedAt: today(),
      reviewStatus: file.attributionRequired === 'false' ? 'confirmed' : 'draft',
    },
    note: {
      trackId: id,
      language: 'ko',
      shortNote: pick.shortNote,
      fullNote: pick.fullNote,
      references: [file.pageUrl],
      reviewStatus: 'draft',
    },
  })
}

entries.sort((a, b) => a.track.id.localeCompare(b.track.id))

const catalog = {
  updatedAt: new Date().toISOString(),
  source: {
    name: 'Wikimedia Commons — Musopen Kickstarter Project',
    url: candidates.categoryUrl,
    playback: '브라우저가 upload.wikimedia.org 에서 직접 스트리밍한다. 저장소에 음원을 담지 않는다.',
  },
  trackCount: entries.length,
  totalDurationSec: entries.reduce((n, e) => n + (e.track.durationSec ?? 0), 0),
  entries,
}

await writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`)
const totalBytes = entries.reduce((n, e) => n + (e.source.byteSize ?? 0), 0)
console.log(
  `${entries.length}곡 → ${OUT} ` +
    `(${(catalog.totalDurationSec / 3600).toFixed(1)}시간, 전곡 1회 재생 시 ${(totalBytes / 1e6).toFixed(0)}MB 수신)`,
)
if (problems.length > 0) {
  console.error('\n제외된 곡:')
  for (const p of problems) console.error(` - ${p}`)
  process.exitCode = 1
}

/** videoinfo 로 파일마다 변환본(MP3/OGG) 주소를 받는다. */
async function fetchDerivatives(allTitles) {
  const out = new Map()
  for (let i = 0; i < allTitles.length; i += 20) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      titles: allTitles.slice(i, i + 20).join('|'),
      prop: 'videoinfo',
      viprop: 'url|derivatives',
    })
    const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Commons API ${res.status}`)
    const json = await res.json()
    for (const page of json.query.pages) {
      out.set(page.title, page.videoinfo?.[0]?.derivatives ?? [])
    }
  }
  return out
}

/**
 * 스트리밍 주소가 살아 있는지, 용량과 Range 지원은 어떤지 확인한다.
 * 짧은 간격으로 몰아 보내면 429 가 오므로 간격을 두고 물러서며 재시도한다.
 */
async function probe(url, attempt = 0) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } })
    if (res.status === 429 && attempt < 4) {
      await sleep(2000 * (attempt + 1))
      return probe(url, attempt + 1)
    }
    return {
      ok: res.ok,
      status: res.status,
      byteSize: Number(res.headers.get('content-length')) || null,
      acceptsRange: res.headers.get('accept-ranges') === 'bytes',
    }
  } catch (err) {
    if (attempt < 2) {
      await sleep(2000)
      return probe(url, attempt + 1)
    }
    return { ok: false, status: String(err), byteSize: null, acceptsRange: false }
  }
}

/** API 응답 주소에 붙는 utm 추적 파라미터를 뗀다. */
function clean(url) {
  return url.split('?')[0]
}

function parseTitle(commonsTitle) {
  const name = commonsTitle.replace(/^File:/, '').replace(/\.flac$/i, '')
  const m = name.match(/\(([^()]+)\)\s*$/)
  const performerRaw = m?.[1]?.trim() ?? null
  const body = m ? name.slice(0, m.index).trim() : name
  const composerKey = Object.keys(COMPOSERS).find((k) => body.startsWith(`${k} -`))
  if (!composerKey) throw new Error(`작곡가를 알 수 없음: ${commonsTitle}`)
  const c = COMPOSERS[composerKey]
  return {
    composerKey,
    ko: c.ko,
    full: c.full,
    era: c.era,
    title: body.slice(composerKey.length + 3).trim(),
    performer: (performerRaw && PERFORMERS[performerRaw]) ?? performerRaw ?? '미확인',
  }
}

function slug(s) {
  return s
    .toLowerCase()
    // 라틴 문자의 발음 부호만 떼고 한글은 다시 합쳐 둔다 (NFKD 는 한글도 자모로 쪼갠다).
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90)
}

/** "Symphony No. 40 in G minor, K550 - III. Menuetto" → 악장을 뗀 작품 이름 */
function workTitleOf(originalTitle) {
  const cut = originalTitle.split(' - ')[0]
  return cut.replace(/\s+/g, ' ').trim()
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
