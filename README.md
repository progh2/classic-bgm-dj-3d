# 🎼 세바스티안의 음악 응접실 (Classic BGM DJ 3D)

고급스러운 응접실에 들어서면 VRM 집사 세바스티안이 인사를 건넵니다.
취향을 몇 가지 고르거나 “맡길게”를 누르면 **권리가 확인된 클래식 음원**을 골라 틀어 줍니다.
테이블 위의 축음기, 펼쳐진 공연 프로그램북, 두꺼운 출처 안내서를 직접 만지며 감상합니다.

> 2D 버전은 [classic-bgm-dj](https://github.com/progh2/classic-bgm-dj)에서 계속 서비스합니다.
> 이 저장소는 3D 응접실 버전이며, 두 서비스는 카탈로그와 재생 방식이 다릅니다.

## 상태

**단계 0 완료** — 저장소 골격, 재생 어댑터, 음원 출처 조사와 33곡 카탈로그까지 마쳤습니다.
아직 집사·책자·방명록은 구현 전입니다. 자세한 계획은 [PRD](docs/PRD-3D-CLASSIC-SALON.md) 9장을 보세요.

| 단계 | 내용 | 상태 |
|---|---|---|
| 0 | 저장소·소재 검증 | 완료 |
| 1 | 재생 기반 | — |
| 2 | 응접실과 집사 (VRM·TTS) | — |
| 3 | 프로그램북 · 출처 안내서 | — |
| 4 | “맡길게” 자동 감상 | — |
| 5 | 곡 추가 절차 | — |
| 6 | 공개 전 검증 → 초기 공개 | — |
| 7 | 공유 손글씨 방명록 (Firebase) | 후속 |

## 음원

Wikimedia Commons의 [Musopen Kickstarter Project](https://commons.wikimedia.org/wiki/Category:Musopen_Kickstarter_Project)
녹음을 사용합니다. 144개 파일 전부 작품과 녹음이 모두 퍼블릭 도메인이며 표기 의무가 없습니다.
그래도 출처 안내서에 연주자·출처·라이선스를 모두 표시합니다.

**음원 파일은 이 저장소에 담지 않습니다.** 카탈로그에는 원 출처의 주소만 기록하고,
브라우저가 `upload.wikimedia.org`에서 직접 받아 재생합니다.
곡마다 라이선스 근거와 출처 주소를 `data/catalog.json`에 남기고, 기록이 없는 곡은 재생 목록에 넣지 않습니다.

초기 카탈로그는 **33곡 3.2시간** — 바로크 5 · 고전 9 · 낭만 19, 관현악 16 · 현악 4중주 9 · 피아노 8.
조사 결과와 곡 목록은 [docs/AUDIO-SOURCES.md](docs/AUDIO-SOURCES.md)에 있습니다.

YouTube 임베드는 사용하지 않습니다. 오디오만 재생하므로 책자를 읽거나
필기하는 동안에도 음악이 끊기지 않습니다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # 타입 검사 + 프로덕션 빌드
```

곡을 추가할 때:

```bash
node tools/survey-commons.mjs "Musopen Kickstarter Project"   # 후보 조사
# data/selection.ko.json 에 곡과 한국어 해설을 추가한 뒤
node tools/build-catalog.mjs                                  # 스트리밍 주소 확인·카탈로그 생성
```

## 구성

```
src/
  core/      앱 상태와 이벤트
  catalog/   곡·권리·해설 타입과 카탈로그 로딩
  playback/  PlaybackAdapter 와 AudioFileAdapter
  scene/     Three.js 응접실
  butler/    VRM 집사와 TTS        (단계 2)
  books/     프로그램북 · 출처 안내서 (단계 3)
  ui/        HUD · 스타일
tools/       음원 조사·카탈로그 생성 스크립트
data/        후보 목록 · 곡 선정과 해설 · 카탈로그
public/      모델·소품 (음원은 넣지 않음)
docs/        PRD 와 조사 문서
```

## 기술

TypeScript · Vite · Three.js · `@pixiv/three-vrm` · Web Speech API ·
Canvas 2D + Pointer Events (방명록) · Vitest · GitHub Pages

방명록 단계까지는 서버 없이 정적 배포만으로 동작합니다.

## 기기

PC · 태블릿 · 휴대폰 · 전자칠판에서 같은 음악과 기록을 이용하되 카메라와 책자 배치를 바꿉니다.
WebGL을 쓸 수 없는 기기에는 같은 기능의 2D 화면을 제공할 예정입니다(단계 6).

## 라이선스

코드는 이 저장소의 라이선스를 따릅니다. 음원·모델·폰트는 각 출처의 조건을 따르며
`data/catalog.json`과 출처 안내서에 개별 표기합니다.
