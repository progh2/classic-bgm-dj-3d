/** 카탈로그·권리 기록의 타입. PRD 7.2 데이터 모델을 따른다. */

export type Era = 'baroque' | 'classical' | 'romantic' | 'modern' | 'renaissance'
export type Mood = 'calm' | 'bright' | 'melancholy' | 'grand' | 'playful' | 'tense'
export type Focus = 'background' | 'foreground'

/** 하나의 녹음. 같은 작품이라도 연주가 다르면 다른 Track 이다. */
export interface Track {
  id: string
  workId: string
  recordingId: string
  title: string
  originalTitle?: string
  composer: string
  composerOriginal?: string
  performer: string
  era: Era
  form?: string
  instruments: string[]
  moods: Mood[]
  focus: Focus[]
  /** 초. 파일 메타데이터로 확인한 값만 넣는다. */
  durationSec?: number
  /** 2D 서비스의 같은 녹음을 대조하기 위한 참고 값. 재생에는 쓰지 않는다. */
  legacyVideoId?: string
}

export interface PlaybackSource {
  trackId: string
  provider: 'file'
  /** base 기준 상대 경로 또는 허용이 확인된 절대 URL */
  audioUrl: string
  altUrls?: string[]
  mimeType: string
  byteSize?: number
  availability: 'ok' | 'unchecked' | 'broken'
  lastCheckedAt?: string
}

/** 권리 증적. 이 기록이 없는 곡은 재생 목록에 넣지 않는다. */
export interface RightsRecord {
  targetId: string
  targetKind: 'track' | 'asset'
  /** 작품(작곡) 자체의 권리 상태 */
  workRights: string
  /** 이 녹음·음반의 권리 상태 */
  recordingRights: string
  licenseId: string
  licenseVersion?: string
  licenseUrl: string
  sourceUrl: string
  rightsHolder: string
  /** 라이선스가 요구하는 표기문 그대로 */
  attribution?: string
  modifications: string
  territoryNotes?: string
  evidenceUrl?: string
  fileHash?: string
  checkedAt: string
  reviewStatus: 'draft' | 'confirmed'
}

export interface ProgramNote {
  trackId: string
  language: 'ko'
  shortNote?: string
  fullNote?: string
  references?: string[]
  reviewStatus: 'draft' | 'confirmed'
}

export interface CatalogEntry {
  track: Track
  source: PlaybackSource
  rights: RightsRecord
  note?: ProgramNote
}
