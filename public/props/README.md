# 소품 모델 출처와 이용 조건

| 폴더 | 소품 | 원본 |
|---|---|---|
| `classic-console/` | 응접실 콘솔 테이블 | [Poly Haven — Classic Console 01](https://polyhaven.com/a/ClassicConsole_01) (제작: Kirill Sannikov) |

코드로 세운 소품(파일이 없는 것): 레코드 재생기 `src/scene/turntable.ts`, 집사 뒤
안내판 `src/scene/screen.ts`. 아래 «직접 만든 소품» 참고.

## 라이선스

Poly Haven 의 모든 에셋은 **CC0 1.0** 입니다.

> "Our assets are all licensed as CC0, which is effectively Public Domain even in
> jurisdictions that do not support the Public Domain."
> — [Poly Haven 라이선스 안내](https://polyhaven.com/license)

표기 의무가 없고 상업적 이용·수정·재배포가 모두 자유입니다.
의무는 아니지만 출처 안내서(단계 3)에 제작자와 출처를 표시합니다.

## 받아 온 파일

`https://dl.polyhaven.org/file/ph-assets/Models/` 아래의 **1k glTF** 판본입니다.
크기는 1.54 × 0.95 × 0.59 m (가로 × 높이 × 세로), 합계 약 740KB.

```
classic-console/
  ClassicConsole_01_1k.gltf         2.7KB
  ClassicConsole_01.bin           222KB   (지오메트리 — 해상도와 무관하게 공통)
  textures/…_diff_1k.jpg          147KB   베이스 컬러
  textures/…_nor_gl_1k.jpg        212KB   노멀 (OpenGL 규격)
  textures/…_arm_1k.jpg           157KB   AO / 거칠기 / 메탈
```

2k·4k·8k 판본도 같은 경로에서 받을 수 있습니다. 전자칠판처럼 큰 화면에서
질감이 부족하면 2k 로 올리는 것을 검토합니다(2k 는 약 2MB).

## 이 저장소에서 가한 수정

없습니다. 내려받은 파일 그대로입니다.

## 직접 만든 소품

### 레코드 재생기 — `src/scene/turntable.ts`

CC0 로 쓸 만한 재생기 모델을 찾지 못했습니다. Poly Haven 에는 축음기·턴테이블이
아예 없고, Poly Pizza 에서 찾은 것들(Gramophone / Record Player / Turntable)은 모두
**CC-BY** 였습니다. Sketchfab 에 CC0 표기된 것이 하나 있었지만 400만 삼각형이라
웹에서 쓸 수 없습니다.

게다가 이 소품은 **판이 돌고 톤암이 오르내려야** 재생 상태를 보여 줄 수 있어서,
뼈대 없는 정적 모델로는 어차피 부족합니다. 그래서 Three.js 기본 도형으로 직접
세웠습니다. 외부 에셋이 아니므로 라이선스 문제가 없습니다.

CC-BY 모델을 쓰기로 바꾼다면 출처 안내서에 제작자 표기를 반드시 넣어야 합니다.

### 안내판 — `src/scene/screen.ts`

황동 액자에 캔버스 텍스처를 붙인 판입니다. 역시 직접 세웠습니다.

## 환경광 HDRI — `public/hdri/ballroom_1k.hdr`

[Poly Haven — Ballroom](https://polyhaven.com/a/ballroom) (제작: Andreas Mischok) · **CC0** · 1k HDR 1.7MB.

배경으로 그리지 않고 **환경광으로만** 씁니다. 놋쇠와 마호가니가 반사할 대상이
있어야 금속과 목재로 보이기 때문입니다. 빅토리아풍 무도회장이라 응접실의
색 온도와 맞습니다. 입장한 뒤에 따로 받습니다.

## 바닥 결 — `public/textures/herringbone-parquet/`

[Poly Haven — Herringbone Parquet](https://polyhaven.com/a/herringbone_parquet) · **CC0** · 1k JPG 3장 1.7MB
(`diff` 베이스 컬러 · `nor_gl` 노멀 · `arm` AO/거칠기/메탈).

응접실 바닥에 1.6m 간격으로 반복해 깝니다. 입장한 뒤에 따로 받으며,
받지 못해도 단색 바닥으로 보입니다.
