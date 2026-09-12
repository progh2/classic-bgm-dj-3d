# 음원 출처 조사 (단계 0)

조사일: 2026-09-12 · 조사 도구: `tools/survey-commons.mjs` · 원자료: `data/candidates.json`

## 채택 출처: Musopen Kickstarter Project (Wikimedia Commons)

[Category:Musopen Kickstarter Project](https://commons.wikimedia.org/wiki/Category:Musopen_Kickstarter_Project)

API로 확인한 실측값:

| 항목 | 값 |
|---|---|
| 파일 수 | 144 |
| 형식 | 전부 `audio/flac` |
| 총 길이 | 16.6시간 |
| 총 용량 | 7.66GB (FLAC 원본) |
| `LicenseShortName` | 144/144 `Public domain` |
| `Copyrighted` | 144/144 `False` |
| `AttributionRequired` | 144/144 `false` |
| 길이 | 최소 54초 · 중간값 6분38초 · 최대 17분31초 |

작곡가별 파일 수: 바흐 32, 슈베르트 26, 브람스 17, 모차르트 14, 멘델스존 13, 베토벤 10, 보로딘 9, 드보르작 8, 그리그 4, 하이든 4, 차이코프스키 4, 림스키코르사코프 1, 스메타나 1, 수크 1.

### 권리 확인 근거

파일 설명 페이지에서 작품과 녹음의 권리를 각각 확인했다. 두 건을 직접 열어 확인한 문구:

- 녹음: “This work has been released into the public domain by its author, **Musopen**.” (CC Public Domain Mark 1.0 병기)
- 작품: 작곡가 사망 후 저작권 보호기간 만료
- 연주: 관현악은 Musopen Symphony(체코 국립 교향악단), 골트베르크 변주곡은 피아니스트 Shelley Katz

확인한 파일: [Beethoven — Coriolan Overture](https://commons.wikimedia.org/wiki/File:Beethoven_-_Coriolan_Overture,_Op._62_(Musopen_Symphony).flac), [Bach — Goldberg Variations Var. 4](https://commons.wikimedia.org/wiki/File:Bach,_J_S_-_Goldberg_Variations,_BWV988_-_05._Variation_4_(Shelley_Katz).flac)

표기 의무는 없지만 출처 안내서에 연주자·출처·라이선스를 모두 표시한다. 카테고리 단위로 일괄 처리하지 않고, 곡을 추가할 때마다 `RightsRecord`에 그 파일의 API 응답값을 그대로 기록한다.

## 검토했으나 채택하지 않은 출처

| 출처 | 판단 |
|---|---|
| YouTube (기존 2D 카탈로그) | 임베드 최소 크기·가시성 요구와 광고·지역 제한이 응접실 경험과 맞지 않음. 결정 2에 따라 제외 |
| Musopen 웹사이트 직접 | 다운로드에 계정이 필요한 항목이 있고 curl 접근이 403. Commons 사본이 라이선스 검증도 더 쉬움 |
| Incompetech (Kevin MacLeod) | CC BY 라이선스 라이브러리 음악. 표기 의무가 있고 대부분 클래식 녹음이 아니라 창작 배경음악 |
| IMSLP · Internet Archive | 항목마다 라이선스가 달라 곡 단위 검수 비용이 큼. 필요해지면 개별 추가 |

## 재생 방식: 저장하지 않고 원 출처에서 스트리밍

음원 파일은 이 저장소에 담지 않는다. Commons 가 FLAC 원본마다 만들어 둔 변환본 주소를
카탈로그에 기록하고, 브라우저가 `upload.wikimedia.org` 에서 직접 받아 재생한다.

실측으로 확인한 조건 (베토벤 코리올란 서곡 기준):

| 항목 | 결과 |
|---|---|
| MP3 변환본 | `.../transcoded/<경로>/<파일>.flac.mp3` · 약 211kbps · 13.1MB |
| OGG 변환본 | 같은 경로의 `.flac.ogg` · 약 104kbps · 6.5MB |
| CORS | `access-control-allow-origin: *` |
| Range 요청 | `accept-ranges: bytes`, `-r 0-99` 요청에 `206` 응답 |
| robots.txt | `/wikipedia/commons/archive/` 만 차단. 변환본 경로는 허용 |

기본은 MP3, OGG 는 대체 주소로 기록한다(Safari 는 Ogg Vorbis 지원이 확실하지 않다).
선정한 33곡 전부 MP3 변환본 존재와 Range 지원을 HEAD 요청으로 개별 확인했다.

### 이 방식의 대가

원 출처에서 파일이 삭제·이동되면 재생이 끊기고, 접속 속도도 우리가 통제할 수 없다.
그래서 `availability` 와 `lastCheckedAt` 를 카탈로그에 남기고 링크 상태를 정기 점검하며,
재생 실패는 조용히 넘기지 않고 이용자에게 이유를 알린다.

조사·점검 도구는 Wikimedia [User-Agent 정책](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy)에
맞춰 연락처가 담긴 UA 를 보내고, 요청 사이에 간격을 둔다(몰아 보내면 `429` 가 온다).

## 초기 카탈로그 33곡

전체 3.2시간. 전곡을 한 번씩 들으면 이용자 기기가 약 278MB 를 내려받는다 (우리 전송량이 아니다).

| 구분 | 구성 |
|---|---|
| 시대 | 낭만 19 · 고전 9 · 바로크 5 |
| 편성 | 관현악 16 · 현악 4중주 9 · 피아노 8 |
| 분위기 | 차분 14 · 쓸쓸 11 · 경쾌 10 · 밝음 9 · 장대 6 · 긴장 4 |
| 작곡가 | 바흐 5 · 그리그 3 · 모차르트 4 · 슈베르트 3 · 멘델스존 3 · 베토벤 3 · 브람스 2 · 드보르작 2 · 보로딘 2 · 하이든 2 · 차이코프스키 1 · 스메타나 1 · 수크 1 · 림스키코르사코프 1 |

선정과 한국어 해설은 `data/selection.ko.json` 에 있다. 해설은 초안(`reviewStatus: "draft"`)이며 검수 후 올린다.

## 도구와 절차

```bash
# 1. 후보 조사 — 카테고리의 파일·길이·라이선스를 data/candidates.json 에 기록
node tools/survey-commons.mjs "Musopen Kickstarter Project" data/candidates.json

# 2. 카탈로그 생성 — 선정 곡의 스트리밍 주소를 확인해 data/catalog.json 생성
node tools/build-catalog.mjs
```

곡을 추가하려면 `data/selection.ko.json` 의 `tracks` 에 항목을 넣고 2번을 다시 돌린다.
한 항목에 필요한 것: `commonsTitle`, `titleKo`, `workKo`, `instruments`, `moods`, `focus`,
`shortNote`, `fullNote`.

`build-catalog.mjs` 가 곡마다 하는 일:

1. 후보 목록에서 그 파일의 라이선스 필드를 다시 확인 (`Copyrighted !== "False"` 면 제외)
2. Commons API 로 MP3·OGG 변환본 주소를 받음 (변환본이 없으면 제외)
3. 그 주소에 HEAD 요청으로 생존·용량·Range 지원 확인
4. `track` / `source` / `rights` / `note` 를 `data/catalog.json` 에 기록

음원을 내려받거나 변형하지 않으므로 파일 해시와 변환 기록은 남기지 않는다.

## 확인한 것과 남은 것

확인: 라이선스 상태(API 실측 144/144), 파일별 길이·용량, MP3·OGG 변환본 제공, CORS·Range 지원,
33곡 선정과 분위기·시대·악기 분류, 한국어 해설 초안.

남은 것: 해설 검수, 실제 기기(특히 iOS Safari)에서의 스트리밍 재생 확인, 링크 상태 정기 점검 자동화,
원 출처가 끊겼을 때의 대체 동작.
