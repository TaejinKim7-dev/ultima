# Todo 34–46 검증 측정값 요약 (2026-10-03)

로컬 증거(`.omo/evidence/`, git 미포함)에서 **영어 원문이 없는 작은 로그**만 옮겼다. 스크린샷, 전체 e2e 로그, 비공개 영어 인벤토리는 올리지 않는다.

## Todo 36 — placeholder 순서 감사 (`task-36/order-audit.log`)
```
entries with 2+ placeholders compared: 95
recorded ordered signature differs from source order: 0
translations whose placeholder order differs from source: 0
```

## Todo 41 — Codex/엔딩 관측 (`task-41/codex-observation.log`)
한국어 패널에 나타났는지 여부와 id만 기록한다. 게임 텍스트 본문은 없다.
```
darkness line has a Korean translation: true
darkness line reached the panel in Korean: true
passage-granted line has a Korean translation: true
question 0 shown in Korean: true
question 1 shown in Korean: true
question 2 shown in Korean: true
question 3 shown in Korean: true
question 4 shown in Korean: true
question 5 shown in Korean: true
question 6 shown in Korean: true
question 7 shown in Korean: true
question 8 shown in Korean: true
question 9 shown in Korean: true
question 10 shown in Korean: true
ending ids seen in Korean (11/11): avatar.exe:endgameText1:1,avatar.exe:endgameText1:0,avatar.exe:endgameText1:2,avatar.exe:endgameText1:3,avatar.exe:endgameText1:4,avatar.exe:endgameText1:5,avatar.exe:endgameText1:6,avatar.exe:endgameText2:0,avatar.exe:endgameText2:1,avatar.exe:endgameText2:2,avatar.exe:endgameText2:3
Hangul present in the final panel: true
```

## Todo 42 — wasm 메모리 smoke (`task-42/memory-smoke.json`, Chromium 1분 실행)
```json
{
  "browser": "chromium",
  "version": "136.0.7103.25",
  "minutes": 1,
  "wasmMemoryCapBytes": 67108864,
  "wasmMemoryMaxBytes": 16973824,
  "jsHeapRatio": 1,
  "samples": [
    {
      "atMs": 10,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 5320,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 10607,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 15886,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 21170,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 26421,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 31736,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 37037,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 42069,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 47354,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 52665,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },
    {
      "atMs": 57674,
      "usedJSHeapSize": 39600000,
      "wasmMemoryBytes": 16973824
    },

```

## Todo 45 — 오분류 점검 (`task-45/misclassified.log`)
```
No misclassification observed: the sites classed debug (cheat.cpp, mixReagentsSuper) produced no snapshot hash in the normal-play specs run (alias spec uses debug Goto: aae692d1 and a4793a3c/cd876cd3 appear only there). The one residual 79843a19 hit is not attributable to a site (player-name echo or debug).
```
