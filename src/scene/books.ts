import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import type { CatalogEntry } from '../catalog/types'
import { createPanel, PLATE, roundRect, type Panel, type Region } from './panel'

/**
 * 테이블 위의 두 권 — 펼쳐진 공연 프로그램북과 두꺼운 출처 안내서.
 *
 * 종이는 3D 로 세우고 글은 캔버스에 그린다. 그래야 활자가 선명하고 글자
 * 크기를 화면에 맞게 키울 수 있다. 바깥 출처는 눌러서 새 탭으로 연다.
 */

const F = PLATE.font
const PAPER = '#f2e8d5'
const INK = '#2b2118'
const INK_DIM = '#6b5a48'
const GOLD = '#9a7b2a'

export interface ProgramBookContent {
  /** 재생 목록 */
  queue: CatalogEntry[]
  /** 실제로 재생 중인 곡 */
  currentId: string | null
  /** 지금 펼쳐 보고 있는 곡. 현재 곡과 다르면 되돌아가는 리본을 띄운다 */
  browsedId: string | null
  /** 목록의 첫 줄 번호 */
  listOffset: number
}

export interface Books {
  readonly root: Group
  readonly panels: Panel[]
  setProgram(c: ProgramBookContent): void
  /** 출처 안내서를 펼치거나 덮는다 */
  setSourceOpen(open: boolean): void
  readonly sourceOpen: boolean
}

const ROWS = 7

export function createBooks(): Books {
  const root = new Group()
  let program: ProgramBookContent = {
    queue: [],
    currentId: null,
    browsedId: null,
    listOffset: 0,
  }
  let sourceOpen = false

  const leather = new MeshStandardMaterial({ color: 0x27333a, roughness: 0.78, metalness: 0.03 })
  const leatherRed = new MeshStandardMaterial({ color: 0x4a1f22, roughness: 0.8, metalness: 0.03 })
  const edge = new MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.9 })
  const gilt = new MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.36, metalness: 0.8 })

  // ---- 펼쳐진 프로그램북 ----
  const open = new Group()
  open.position.set(0.06, 0, 0.08)
  open.rotation.y = 0.04

  const openCover = new Mesh(new BoxGeometry(0.62, 0.022, 0.4), leather)
  openCover.position.y = 0.011
  openCover.castShadow = true
  openCover.receiveShadow = true
  open.add(openCover)
  const openPages = new Mesh(new BoxGeometry(0.59, 0.014, 0.37), edge)
  openPages.position.y = 0.028
  open.add(openPages)
  const spineBand = new Mesh(new BoxGeometry(0.02, 0.026, 0.4), gilt)
  spineBand.position.y = 0.016
  open.add(spineBand)

  const pages = createPanel({ width: 0.58, height: 0.36, canvasWidth: 1740 })
  pages.mesh.rotation.x = -Math.PI / 2
  pages.mesh.position.set(0, 0.036, 0)
  open.add(pages.mesh)
  root.add(open)

  // ---- 두꺼운 출처 안내서 ----
  const thick = new Group()
  thick.position.set(0.66, 0, -0.02)
  thick.rotation.y = -0.22

  const thickCover = new Mesh(new BoxGeometry(0.26, 0.085, 0.34), leatherRed)
  thickCover.position.y = 0.0425
  thickCover.castShadow = true
  thick.add(thickCover)
  const thickEdge = new Mesh(new BoxGeometry(0.243, 0.07, 0.325), edge)
  thickEdge.position.set(0.006, 0.0425, 0)
  thick.add(thickEdge)
  for (const z of [-0.09, 0, 0.09] as const) {
    const band = new Mesh(new BoxGeometry(0.266, 0.012, 0.02), gilt)
    band.position.set(-0.126, 0.0425, z)
    thick.add(band)
  }
  const thickLabel = createPanel({ width: 0.24, height: 0.32, canvasWidth: 480 })
  thickLabel.mesh.rotation.x = -Math.PI / 2
  thickLabel.mesh.position.set(0, 0.0865, 0)
  thick.add(thickLabel.mesh)
  root.add(thick)

  // ---- 펼친 안내서 (공중에 띄운 큰 판) ----
  const sourceView = createPanel({ width: 2.3, height: 1.3, canvasWidth: 1840 })
  sourceView.mesh.position.set(0, 0.86, -0.2)
  sourceView.setVisible(false)
  root.add(sourceView.mesh)

  // ---- 그리기 ----

  const drawProgram = (): void => {
    pages.draw((ctx, { w, h }, hovered) => {
      const regions: Region[] = []
      // 종이
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, w, h)
      // 가운데 접힌 골
      const gutter = ctx.createLinearGradient(w / 2 - 26, 0, w / 2 + 26, 0)
      gutter.addColorStop(0, 'rgba(0,0,0,0)')
      gutter.addColorStop(0.5, 'rgba(90, 70, 45, .22)')
      gutter.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gutter
      ctx.fillRect(w / 2 - 26, 0, 52, h)

      const half = w / 2
      const pad = 54

      // --- 왼쪽: 곡목 ---
      ctx.fillStyle = GOLD
      ctx.font = `500 26px ${F}`
      ctx.fillText('PROGRAMME', pad, 56)
      ctx.strokeStyle = 'rgba(154, 123, 42, .5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pad, 72)
      ctx.lineTo(half - pad, 72)
      ctx.stroke()

      const rows = program.queue.slice(program.listOffset, program.listOffset + ROWS)
      rows.forEach((entry, i) => {
        const y = 104 + i * 44
        const id = `track:${entry.track.id}`
        const on = hovered === id
        if (on) {
          ctx.fillStyle = 'rgba(154, 123, 42, .16)'
          roundRect(ctx, pad - 10, y - 26, half - pad * 2 + 20, 38, 5)
          ctx.fill()
        }
        const playing = entry.track.id === program.currentId
        ctx.fillStyle = playing ? GOLD : INK_DIM
        ctx.font = `400 22px ${F}`
        ctx.fillText(String(program.listOffset + i + 1).padStart(2, '0'), pad, y)
        ctx.fillStyle = playing ? GOLD : INK
        ctx.font = `${playing ? 600 : 400} 24px ${F}`
        ctx.fillText(clip(ctx, entry.track.title, half - pad * 2 - 120), pad + 42, y)
        ctx.fillStyle = INK_DIM
        ctx.font = `400 20px ${F}`
        ctx.textAlign = 'right'
        ctx.fillText(mmss(entry.track.durationSec), half - pad, y)
        ctx.textAlign = 'left'
        regions.push({ id, x: pad - 10, y: y - 26, w: half - pad * 2 + 20, h: 38 })
      })

      if (program.queue.length === 0) {
        ctx.fillStyle = INK_DIM
        ctx.font = `400 24px ${F}`
        ctx.fillText('아직 곡목이 없습니다.', pad, 118)
        ctx.fillText('취향을 고르시거나 맡겨 주십시오.', pad, 152)
      }

      // 목록 넘기기
      const navY = h - 56
      if (program.listOffset > 0) {
        pageButton(ctx, '◀ 앞', pad, navY, hovered === 'list:prev')
        regions.push({ id: 'list:prev', x: pad, y: navY - 24, w: 92, h: 36 })
      }
      if (program.listOffset + ROWS < program.queue.length) {
        pageButton(ctx, '뒤 ▶', half - pad - 92, navY, hovered === 'list:next')
        regions.push({ id: 'list:next', x: half - pad - 92, y: navY - 24, w: 92, h: 36 })
      }

      // --- 오른쪽: 펼친 곡 ---
      const shown =
        program.queue.find((e) => e.track.id === (program.browsedId ?? program.currentId)) ?? null
      const x = half + pad

      if (!shown) {
        ctx.fillStyle = INK_DIM
        ctx.font = `400 24px ${F}`
        ctx.fillText('곡이 시작되면 이 자리에', x, 118)
        ctx.fillText('해설과 출처를 펼쳐 두겠습니다.', x, 152)
        return regions
      }

      const t = shown.track
      ctx.fillStyle = GOLD
      ctx.font = `500 22px ${F}`
      ctx.fillText(`${t.composer}${t.composerOriginal ? ` · ${t.composerOriginal}` : ''}`, x, 52)

      ctx.fillStyle = INK
      ctx.font = `600 32px ${F}`
      let y = wrapText(ctx, t.title, x, 84, w - x - pad, 38, 2)

      if (t.originalTitle) {
        ctx.fillStyle = INK_DIM
        ctx.font = `italic 400 20px ${F}`
        y = wrapText(ctx, t.originalTitle, x, y + 24, w - x - pad, 26, 2)
      }

      ctx.fillStyle = INK_DIM
      ctx.font = `400 21px ${F}`
      const facts = [t.performer, eraWord(t.era), t.instruments.join(' · '), mmss(t.durationSec)]
      ctx.fillText(facts.filter(Boolean).join('  ·  '), x, y + 30)
      y += 30

      ctx.strokeStyle = 'rgba(154, 123, 42, .4)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, y + 20)
      ctx.lineTo(w - pad, y + 20)
      ctx.stroke()

      ctx.fillStyle = INK
      ctx.font = `400 22px ${F}`
      const note = shown.note?.fullNote ?? shown.note?.shortNote ?? '해설 준비 중입니다.'
      y = wrapText(ctx, note, x, y + 54, w - x - pad, 32, 5)

      // 권리 요약과 출처 링크
      ctx.fillStyle = INK_DIM
      ctx.font = `400 19px ${F}`
      y = wrapText(
        ctx,
        `${shown.rights.licenseId} · ${shown.rights.rightsHolder} · 확인 ${shown.rights.checkedAt}`,
        x,
        y + 26,
        w - x - pad,
        24,
        2,
      )

      const linkY = y + 14
      const on = hovered === 'source:track'
      ctx.fillStyle = on ? GOLD : 'rgba(154, 123, 42, .85)'
      ctx.font = `500 21px ${F}`
      const label = '출처와 라이선스 보기 ↗'
      ctx.fillText(label, x, linkY + 22)
      const lw = ctx.measureText(label).width
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, linkY + 28)
      ctx.lineTo(x + lw, linkY + 28)
      ctx.stroke()
      regions.push({ id: 'source:track', x, y: linkY - 4, w: lw, h: 38 })

      // 다른 곡을 보고 있으면 되돌아가는 리본
      if (program.browsedId && program.browsedId !== program.currentId && program.currentId) {
        const rw = 232
        const rx = w - pad - rw
        const ry = h - 66
        const ribbonOn = hovered === 'follow'
        roundRect(ctx, rx, ry, rw, 42, 6)
        ctx.fillStyle = ribbonOn ? '#9a7b2a' : 'rgba(154, 123, 42, .82)'
        ctx.fill()
        ctx.fillStyle = PAPER
        ctx.font = `500 21px ${F}`
        ctx.textAlign = 'center'
        ctx.fillText('지금 흐르는 곡으로', rx + rw / 2, ry + 27)
        ctx.textAlign = 'left'
        regions.push({ id: 'follow', x: rx, y: ry, w: rw, h: 42 })
      }

      return regions
    })
  }

  const drawThickLabel = (): void => {
    thickLabel.draw((ctx, { w, h }, hovered) => {
      const on = hovered === 'source:open'
      ctx.fillStyle = on ? 'rgba(154, 123, 42, .22)' : 'rgba(0,0,0,0)'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = on ? '#e0c76a' : 'rgba(224, 199, 106, .5)'
      ctx.lineWidth = 3
      roundRect(ctx, 22, 34, w - 44, h - 68, 6)
      ctx.stroke()
      ctx.fillStyle = '#e0c76a'
      ctx.font = `600 30px ${F}`
      ctx.textAlign = 'center'
      ctx.fillText('출처와', w / 2, h / 2 - 8)
      ctx.fillText('라이선스', w / 2, h / 2 + 30)
      ctx.font = `400 20px ${F}`
      ctx.fillText('눌러서 펼치기', w / 2, h - 54)
      ctx.textAlign = 'left'
      return [{ id: 'source:open', x: 0, y: 0, w, h }]
    })
  }

  const drawSourceView = (sections: SourceSection[]): void => {
    sourceView.draw((ctx, { w, h }, hovered) => {
      const regions: Region[] = []
      ctx.fillStyle = PAPER
      roundRect(ctx, 0, 0, w, h, 10)
      ctx.fill()
      ctx.strokeStyle = 'rgba(154, 123, 42, .55)'
      ctx.lineWidth = 4
      ctx.stroke()

      ctx.fillStyle = GOLD
      ctx.font = `500 26px ${F}`
      ctx.fillText('SOURCES & LICENCES', 56, 60)
      ctx.fillStyle = INK
      ctx.font = `600 40px ${F}`
      ctx.fillText('출처와 라이선스 안내', 56, 110)

      // 닫기
      const closeOn = hovered === 'source:close'
      ctx.fillStyle = closeOn ? GOLD : INK_DIM
      ctx.font = `400 30px ${F}`
      ctx.textAlign = 'right'
      ctx.fillText('덮기 ✕', w - 56, 66)
      ctx.textAlign = 'left'
      regions.push({ id: 'source:close', x: w - 200, y: 34, w: 150, h: 44 })

      ctx.strokeStyle = 'rgba(154, 123, 42, .4)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(56, 132)
      ctx.lineTo(w - 56, 132)
      ctx.stroke()

      // 두 단으로 흘린다
      const colW = (w - 56 * 2 - 60) / 2
      let x = 56
      let y = 176
      for (const section of sections) {
        if (y > h - 120) {
          x += colW + 60
          y = 176
        }
        ctx.fillStyle = INK
        ctx.font = `600 25px ${F}`
        ctx.fillText(section.title, x, y)
        y += 32
        ctx.fillStyle = INK_DIM
        ctx.font = `400 20px ${F}`
        y = wrapText(ctx, section.body, x, y, colW, 26, 4) + 6

        if (section.link) {
          const id = `link:${section.link.url}`
          const on = hovered === id
          ctx.fillStyle = on ? GOLD : 'rgba(154, 123, 42, .9)'
          ctx.font = `500 20px ${F}`
          ctx.fillText(`${section.link.label} ↗`, x, y + 18)
          const lw = ctx.measureText(`${section.link.label} ↗`).width
          ctx.strokeStyle = ctx.fillStyle
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(x, y + 24)
          ctx.lineTo(x + lw, y + 24)
          ctx.stroke()
          regions.push({ id, x, y: y - 4, w: lw, h: 32 })
          y += 34
        }
        y += 22
      }
      return regions
    })
  }

  drawProgram()
  drawThickLabel()
  drawSourceView(SOURCE_SECTIONS)

  return {
    root,
    panels: [pages, thickLabel, sourceView],

    setProgram(c) {
      program = c
      drawProgram()
    },

    setSourceOpen(o) {
      sourceOpen = o
      sourceView.setVisible(o)
      // 펼친 안내서가 프로그램북을 덮으므로 그동안은 목록을 누를 수 없게 한다.
      pages.setVisible(!o)
      drawSourceView(SOURCE_SECTIONS)
    },

    get sourceOpen() {
      return sourceOpen
    },
  }

  function pageButton(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    on: boolean,
  ): void {
    ctx.fillStyle = on ? GOLD : INK_DIM
    ctx.font = `400 21px ${F}`
    ctx.fillText(label, x, y)
  }
}

export interface SourceSection {
  title: string
  body: string
  link?: { label: string; url: string }
}

/** 안내서의 목차. 곡별 권리는 프로그램북의 각 곡 면에 있다. */
export const SOURCE_SECTIONS: SourceSection[] = [
  {
    title: '이 응접실에 대하여',
    body: '권리가 확인된 클래식 녹음만 골라 두었습니다. 음원 파일은 이곳에 저장하지 않고 원 출처에서 바로 받아 재생합니다.',
    link: { label: '2D 버전', url: 'https://progh2.github.io/classic-bgm-dj/' },
  },
  {
    title: '음원 출처',
    body: 'Wikimedia Commons 의 Musopen Kickstarter Project. 144개 파일 전부 작품과 녹음이 모두 퍼블릭 도메인이며 표기 의무가 없습니다.',
    link: {
      label: 'Category:Musopen Kickstarter Project',
      url: 'https://commons.wikimedia.org/wiki/Category:Musopen_Kickstarter_Project',
    },
  },
  {
    title: '작품과 녹음의 권리',
    body: '작품은 작곡가 사망 후 보호기간이 끝나 퍼블릭 도메인입니다. 녹음은 Musopen 이 퍼블릭 도메인으로 공개했습니다. 연주는 Musopen Symphony(체코 국립 교향악단), Musopen String Quartet, 피아니스트 Shelley Katz·Paul Pitman 입니다.',
  },
  {
    title: '집사 모델',
    body: 'VRoid Studio 샘플 모델(VRoid 프로젝트, pixiv Inc.). 재배포·수정·상업적 이용이 허용되고 크레딧 표기는 의무가 아닙니다. 정장 차림 전용 모델을 마련하기 전까지 쓰는 임시 모델입니다.',
    link: {
      label: 'VRoid 샘플 모델 이용 조건',
      url: 'https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use',
    },
  },
  {
    title: '가구와 결',
    body: '콘솔 테이블, 마루·벽·판벽의 결, 환경광 HDRI 는 모두 Poly Haven 의 CC0 자료입니다. 표기 의무는 없지만 밝혀 둡니다.',
    link: { label: 'Poly Haven 라이선스', url: 'https://polyhaven.com/license' },
  },
  {
    title: '벽에 걸린 그림',
    body: '메트로폴리탄 미술관 오픈 액세스의 퍼블릭 도메인 회화입니다. 이미지는 CC0 이며 저장소에 담지 않고 원 출처에서 바로 받아 겁니다. 올 때마다 다른 그림이 걸립니다.',
    link: { label: 'The Met 이미지 이용 안내', url: 'https://www.metmuseum.org/policies/image-resources' },
  },
  {
    title: '소리',
    body: '집사의 발걸음은 OpenGameArt 의 CC0 효과음입니다. 집사의 말은 기기에 설치된 음성합성을 씁니다.',
    link: { label: '100 CC0 SFX #2', url: 'https://opengameart.org/content/100-cc0-sfx-2' },
  },
  {
    title: '소프트웨어',
    body: 'Three.js, @pixiv/three-vrm, Vite, TypeScript 로 만들었습니다. 코드는 저장소에서 볼 수 있습니다.',
    link: { label: 'progh2/classic-bgm-dj-3d', url: 'https://github.com/progh2/classic-bgm-dj-3d' },
  },
  {
    title: '삭제와 문의',
    body: '권리자의 요청이나 잘못된 표기를 알려주시면 확인 후 바로 조치하겠습니다. 저장소의 이슈로 받습니다.',
    link: { label: '문의 열기', url: 'https://github.com/progh2/classic-bgm-dj-3d/issues' },
  },
]

const ERA_WORD: Record<string, string> = {
  baroque: '바로크',
  classical: '고전',
  romantic: '낭만',
  modern: '근현대',
  renaissance: '르네상스',
}

function eraWord(era: string): string {
  return ERA_WORD[era] ?? era
}

function mmss(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 폭을 넘으면 말줄임을 붙인다. */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

/** 여러 줄로 흘리고 마지막 줄의 y 를 돌려준다. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = candidate
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  lines.forEach((l, i) => {
    const last = i === lines.length - 1 && lines.length === maxLines
    ctx.fillText(last ? clip(ctx, l, maxWidth) : l, x, y + i * lineHeight)
  })
  return y + (lines.length - 1) * lineHeight
}
