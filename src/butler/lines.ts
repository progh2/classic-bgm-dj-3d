/** 집사의 대사. 곡 해설은 단계 3 의 프로그램북에서 따로 다룬다. */

export const LINES = {
  greetVoice: '어서 오세요. 세실리아라고 합니다. 오늘은 어떤 음악을 들려 드릴까요.',
  greetQuiet: '어서 오세요. 세실리아라고 합니다.',
  noVoice: '이 기기에는 한국어 음성이 없어 자막으로 안내드릴게요.',
  offerChoices: '취향을 몇 가지 여쭤볼까요, 아니면 제게 맡기시겠어요.',
  paused: '잠시 멈추어 둘게요.',
  resumed: '이어서 틀어 드릴게요.',
  stopped: '멈추었습니다.',
  sleepCleared: '종료 예약을 풀었어요. 계속 틀어 드릴게요.',
  sleepDone: '예약하신 시각이 되어 여기서 마치겠습니다. 편히 쉬세요.',
} as const

/** 몇 분 뒤에 마칠지 알리는 말 */
export function sleepIn(minutes: number): string {
  return `${minutes}분 뒤에 마치겠습니다. 그때까지 조용히 틀어 둘게요.`
}

/** 곡을 소개하는 말. 해설이 없으면 편성과 시대만 알린다. */
export function introduce(track: {
  title: string
  composer: string
  performer: string
}, shortNote?: string): string {
  const head = `${track.composer}의 ${track.title}. 연주는 ${track.performer}예요.`
  return shortNote ? `${head} ${shortNote}` : head
}
