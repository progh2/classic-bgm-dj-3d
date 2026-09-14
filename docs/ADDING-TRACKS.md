# 곡을 추가하는 법

곡 하나를 늘리는 데 필요한 것은 **파일이 아니라 기록**입니다. 이 서비스는 음원을
저장하지 않고 원 출처에서 바로 받아 재생하므로, 추가한다는 것은 "어떤 녹음이
어디에 있고, 권리 상태가 무엇이며, 어떤 곡인지"를 적는 일입니다.

전부 합쳐 곡당 10분쯤 걸립니다.

## 한눈에

```bash
npm run catalog:survey    # 1. 후보 조사 (한 번만, 또는 출처를 늘릴 때)
#                           2. data/selection.ko.json 에 곡을 적는다 (손으로)
npm run catalog:build     # 3. 주소 확인 후 data/catalog.json 생성
npm run catalog:check     # 4. 점검
npm test && npm run build # 5. 확인하고 배포
```

## 1. 후보 조사

```bash
npm run catalog:survey
```

Wikimedia Commons 의 [Musopen Kickstarter Project](https://commons.wikimedia.org/wiki/Category:Musopen_Kickstarter_Project)
카테고리를 훑어 `data/candidates.json` 을 만듭니다. 파일마다 길이·용량·라이선스
필드가 들어 있습니다. 144곡 전부 퍼블릭 도메인이고 표기 의무가 없다는 것을
이 파일로 확인할 수 있습니다.

다른 카테고리를 보려면 이름을 넘깁니다.

```bash
node tools/survey-commons.mjs "Category 이름" data/candidates.json
```

**다른 출처를 쓸 때는 반드시 곡 단위로 권리를 확인하십시오.** 카테고리나
사이트 전체를 일괄 허가로 처리하지 않습니다. 자세한 기준은
[AUDIO-SOURCES.md](AUDIO-SOURCES.md) 를 보세요.

## 2. 곡을 고르고 적는다

`data/selection.ko.json` 의 `tracks` 에 항목을 더합니다.

```json
{
  "commonsTitle": "File:Grieg - Peer Gynt Suite No. 1, Op. 46 - I. Morning Mood (Musopen Symphony).flac",
  "titleKo": "페르 귄트 모음곡 1번 Op.46 — 아침 기분",
  "workKo": "페르 귄트 모음곡 1번",
  "instruments": ["orchestra"],
  "moods": ["calm", "bright"],
  "focus": ["background"],
  "shortNote": "플루트가 먼저, 오보에가 뒤따르는 아침.",
  "fullNote": "입센의 희곡을 위해 쓴 음악에서 뽑은 모음곡의 첫 곡입니다. …"
}
```

`commonsTitle` 은 `data/candidates.json` 에서 그대로 복사합니다. 한 글자라도
다르면 다음 단계에서 걸러집니다.

### 쓸 수 있는 값

| 칸 | 값 |
|---|---|
| `instruments` | `piano` · `string quartet` · `orchestra` · `organ` · `violin` · `cello` · `voice` |
| `moods` | `calm` · `bright` · `melancholy` · `grand` · `playful` · `tense` |
| `focus` | `background` (일하며 틀어 둘 만한가) · `foreground` (귀를 두고 들을 곡인가) |

여기 없는 값을 쓰면 점검에서 잡힙니다. 새 값이 필요하면
`src/catalog/types.ts` · `src/catalog/select.ts` · `tools/check-catalog.mjs`
세 곳을 함께 고쳐야 합니다.

`moods` 는 여러 개를 넣어도 됩니다. 선곡은 그중 가장 잘 맞는 하나를 봅니다.
`focus` 도 여러 개 넣을 수 있고, 둘 다 넣으면 어느 쪽으로 골라도 나옵니다.

### 해설 쓰는 법

- **`shortNote`** 는 안내인이 **소리 내어 읽습니다.** 한 문장, 60자 안쪽으로.
  듣고 바로 알아들을 수 있어야 합니다. "오른손이 길게 노래합니다" 같은 말은
  글로는 읽히지만 귀로는 어렵습니다.
- **`fullNote`** 는 프로그램북의 펼친 면에 실립니다. 두세 문장.
  무엇을 들으면 되는지, 이 곡이 어떤 자리에 있는지를 적습니다.
- **모르는 것은 쓰지 않습니다.** 작곡 연도나 악장 구성이 확실하지 않으면
  빼십시오. 제목만 보고 지어낸 해설은 틀리기 쉽고, 틀리면 서비스 전체의
  신뢰가 깎입니다.

## 3. 카탈로그 생성

```bash
npm run catalog:build
```

`tools/build-catalog.mjs` 가 곡마다 이렇게 합니다.

1. 후보 목록에서 그 파일의 라이선스 필드를 다시 확인합니다
   (`Copyrighted !== "False"` 면 제외)
2. Commons API 로 MP3·OGG 변환본 주소를 받습니다 (변환본이 없으면 제외)
3. 그 주소에 HEAD 요청을 보내 생존·용량·Range 지원을 확인합니다
4. `track` / `source` / `rights` / `note` 를 `data/catalog.json` 에 적습니다

제외된 곡은 이유와 함께 화면에 나옵니다. 요청을 몰아 보내면 `429` 가 오므로
곡 사이에 간격을 둡니다 — 33곡에 30초쯤 걸립니다.

## 4. 점검

```bash
npm run catalog:check          # 내용만 (빠름)
npm run catalog:check:links    # 주소가 살아 있는지까지
```

**문제**로 나오면 고치기 전에 배포하지 않습니다. 권리 기록이 확인되지 않은 곡,
출처 주소가 없는 곡, 겹치는 id, 모르는 분류 값이 여기서 걸립니다.
**경고**는 판단에 맡깁니다 — 해설이 아직 초안이라는 알림이 대부분입니다.

해설을 검수하고 나면 `data/catalog.json` 의 그 곡 `note.reviewStatus` 를
`confirmed` 로 올립니다. (선정 파일에는 이 칸이 없습니다. 검수는 만들어진
카탈로그를 보고 하는 일이라 그렇습니다.)

## 5. 링크 정기 점검

원 출처에서 파일이 지워지거나 옮겨지면 재생이 끊깁니다. 한 달에 한 번쯤
확인하고, 결과를 카탈로그에 적어 둡니다.

```bash
node tools/check-catalog.mjs --links --update
```

`availability` 가 `broken` 인 곡은 재생 목록에 들어가지 않습니다
(`src/catalog/catalog.ts` 에서 거릅니다). 끊긴 곡은 Commons 에서 새 주소를
찾아 다시 만들거나, 선정 목록에서 빼십시오.

## 벽에 걸 그림

같은 방식으로 그림도 늘릴 수 있습니다.

```bash
npm run artworks:survey
```

The Met 오픈 액세스에서 퍼블릭 도메인 회화를 찾아 `data/artworks.json` 을
만듭니다. 이미지가 실제로 받아지는지와 CORS 가 열려 있는지를 한 점씩
확인합니다. 찾는 갈래나 개수는 `tools/survey-artworks.mjs` 위쪽의
`QUERIES` · `WANT` 를 고치면 됩니다.

## 새 출처를 더할 때

지금은 Commons 한 곳만 봅니다. 다른 출처를 더하려면:

1. `tools/` 에 그 출처용 조사 도구를 새로 씁니다. 라이선스 필드를 그대로
   받아 적고, 임의로 해석하지 않습니다
2. `build-catalog.mjs` 가 `RightsRecord` 를 채우는 부분을 그 출처에 맞게 늡니다
3. 출처 안내서(`src/scene/books.ts` 의 `SOURCE_SECTIONS`)에 항목을 더합니다
4. `public/props/README.md` 에도 적습니다

**표기 의무가 있는 라이선스(CC BY 등)를 쓰기로 하면**, 출처 안내서에 제작자
표기를 넣는 것이 의무가 됩니다. 지금 카탈로그가 전부 퍼블릭 도메인인 것은
그 의무를 지지 않기 위한 선택이기도 합니다.
