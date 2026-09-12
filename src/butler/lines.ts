/** 집사의 대사. 곡 해설은 단계 3 의 프로그램북에서 따로 다룬다. */

export const LINES = {
  greetVoice: '어서 오십시오. 세바스티안이라 합니다. 오늘은 어떤 음악을 들려 드릴까요.',
  greetQuiet: '어서 오십시오. 세바스티안이라 합니다.',
  noVoice: '이 기기에는 한국어 음성이 없어 자막으로 안내드리겠습니다.',
  offerChoices: '취향을 몇 가지 여쭤볼까요, 아니면 제게 맡기시겠습니까.',
  paused: '잠시 멈추어 두겠습니다.',
  resumed: '이어서 틀어 드리겠습니다.',
  stopped: '멈추었습니다.',
} as const

/** 곡을 소개하는 말. 해설이 없으면 편성과 시대만 알린다. */
export function introduce(track: {
  title: string
  composer: string
  performer: string
}, shortNote?: string): string {
  const head = `${track.composer}의 ${track.title}. 연주는 ${track.performer}입니다.`
  return shortNote ? `${head} ${shortNote}` : head
}
