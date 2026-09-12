/**
 * 시각에 따른 창밖의 빛.
 *
 * 2D 판의 daylight.js 를 옮겨 왔다. 원칙도 함께 옮긴다 —
 * **글자와 가구는 어둡게 하지 않는다.** 새벽에 켜 두는 사람이 많고,
 * 분위기를 내겠다고 읽기 어렵게 만들면 본말이 뒤집힌다.
 * 어두워지는 것은 창밖과 방 가장자리뿐이다.
 */

export interface Phase {
  id: string
  label: string
  from: number
  /** 0(한낮) ~ 1(한밤) */
  night: number
  /** 창으로 드는 빛의 빛깔 */
  colour: number
}

export const PHASES: readonly Phase[] = [
  { id: 'deep_night', label: '깊은 밤', from: 0, night: 1.0, colour: 0x2a3a6b },
  { id: 'dawn', label: '새벽', from: 5, night: 0.62, colour: 0x5f6ba0 },
  { id: 'morning', label: '아침', from: 8, night: 0.18, colour: 0xffe7c2 },
  { id: 'day', label: '한낮', from: 11, night: 0.0, colour: 0xfff2dc },
  { id: 'afternoon', label: '늦은 오후', from: 16, night: 0.22, colour: 0xffd9a0 },
  { id: 'dusk', label: '해질녘', from: 18, night: 0.66, colour: 0xe89b63 },
  { id: 'night', label: '밤', from: 20, night: 0.88, colour: 0x3b4a86 },
]

/** 지금이 어느 때인가. 기기의 지역 시각을 그대로 쓴다. */
export function phaseNow(date = new Date()): Phase {
  const h = date.getHours()
  let found = PHASES[0] as Phase
  for (const p of PHASES) if (h >= p.from) found = p
  return found
}
