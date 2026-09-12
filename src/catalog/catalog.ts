import raw from '../../data/catalog.json'
import type { CatalogEntry } from './types'

/**
 * 곡 카탈로그. 빌드에 함께 실린다(메타데이터만, 음원은 원 출처에서 받는다).
 *
 * 권리 기록이 확인되지 않았거나 스트리밍 주소가 끊긴 곡은 재생 목록에 넣지 않는다.
 */
const all = raw.entries as unknown as CatalogEntry[]

export const CATALOG: readonly CatalogEntry[] = Object.freeze(
  all.filter((e) => e.rights.reviewStatus === 'confirmed' && e.source.availability === 'ok'),
)

export const CATALOG_SOURCE = raw.source

const byId = new Map(CATALOG.map((e) => [e.track.id, e]))

export function entryOf(trackId: string): CatalogEntry | undefined {
  return byId.get(trackId)
}

/** 초 → "4:07" */
export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--'
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
