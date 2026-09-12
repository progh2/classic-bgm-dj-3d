#!/usr/bin/env node
/**
 * Wikimedia Commons 의 한 카테고리에 있는 오디오 파일을 조사해
 * 곡 후보 목록과 권리 증적을 data/candidates.json 으로 남긴다.
 *
 *   node tools/survey-commons.mjs "Musopen Kickstarter Project"
 *
 * 다운로드는 하지 않는다. 라이선스가 파일마다 다를 수 있으므로
 * 카테고리 단위로 일괄 허가 처리하지 않고 파일별 필드를 그대로 기록한다.
 */
import { writeFile } from 'node:fs/promises'

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'classic-bgm-dj-3d/0.1 (audio rights survey; https://github.com/progh2)'
const category = process.argv[2] ?? 'Musopen Kickstarter Project'
const out = process.argv[3] ?? 'data/candidates.json'

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Commons API ${res.status} ${res.statusText}`)
  const json = await res.json()
  if (json.error) throw new Error(`Commons API: ${json.error.info}`)
  return json
}

/** 카테고리의 파일 제목을 모두 모은다 (500개 단위 이어받기). */
async function listFiles(cat) {
  const titles = []
  let cont
  do {
    const json = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${cat}`,
      cmtype: 'file',
      cmlimit: '500',
      ...(cont ? { cmcontinue: cont } : {}),
    })
    titles.push(...json.query.categorymembers.map((m) => m.title))
    cont = json.continue?.cmcontinue
  } while (cont)
  return titles
}

/** 파일 정보를 50개씩 묶어 가져온다. */
async function fileInfo(titles) {
  const rows = []
  for (let i = 0; i < titles.length; i += 50) {
    const json = await api({
      action: 'query',
      titles: titles.slice(i, i + 50).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|metadata|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|UsageTerms|LicenseUrl|Artist|Credit|ImageDescription|Copyrighted|AttributionRequired',
    })
    for (const page of json.query.pages) {
      const ii = page.imageinfo?.[0]
      if (!ii) continue
      const em = ii.extmetadata ?? {}
      const md = Object.fromEntries((ii.metadata ?? []).map((m) => [m.name, m.value]))
      rows.push({
        commonsTitle: page.title,
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
        // url 뒤에 붙는 utm 추적 파라미터는 떼고 저장한다.
        fileUrl: ii.url.split('?')[0],
        mimeType: ii.mime,
        byteSize: ii.size,
        durationSec: md.playtime_seconds ? Math.round(Number(md.playtime_seconds)) : null,
        bitrate: md.bitrate ? Math.round(Number(md.bitrate)) : null,
        license: text(em.LicenseShortName),
        usageTerms: text(em.UsageTerms),
        licenseUrl: text(em.LicenseUrl),
        composerField: text(em.Artist),
        copyrighted: text(em.Copyrighted),
        attributionRequired: text(em.AttributionRequired),
        description: text(em.ImageDescription),
      })
    }
  }
  return rows
}

function text(field) {
  if (!field?.value) return null
  return String(field.value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const titles = await listFiles(category)
const files = await fileInfo(titles)
files.sort((a, b) => a.commonsTitle.localeCompare(b.commonsTitle))

const report = {
  surveyedAt: new Date().toISOString(),
  source: 'Wikimedia Commons',
  category,
  categoryUrl: `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(category.replace(/ /g, '_'))}`,
  fileCount: files.length,
  licenseCounts: files.reduce((acc, f) => {
    const k = f.license ?? '(없음)'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {}),
  totalBytes: files.reduce((n, f) => n + (f.byteSize ?? 0), 0),
  totalDurationSec: files.reduce((n, f) => n + (f.durationSec ?? 0), 0),
  files,
}

await writeFile(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(`${files.length} files → ${out}`)
console.log('licenses:', report.licenseCounts)
console.log(
  `total ${(report.totalBytes / 1e9).toFixed(2)} GB, ${(report.totalDurationSec / 3600).toFixed(1)} h`,
)
