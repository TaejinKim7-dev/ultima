# HANDOFF
작성 시각: 2026-09-25 09:50 KST — Todo 21(21.1~21.4) 전부 완료 반영

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- 이번 세션: 사용자 요청 "plan.md 기준으로 다음 단계 진행해" + "중간에 물어보지 말고 끝까지(Todo 21 끝날 때까지) 진행해"에 따라 **Todo 21 전체(21.1~21.4)를 끝까지 완료**했다.

## 2. 현재 상태 (Current state)
- **branch `todo-21-real-engine`, commit `70d14db`** (이전 `542ce34`=21.1 위에 쌓음, main `2f9da51`에서 분기, 아직 main에 merge 안 함).
- **Todo 21 전부 완료**: 실제 xu4 엔진이 브라우저에서 실제로 링크(21.1)·부팅(21.2)·렌더(21.3)·입력(21.4)까지 전부 확인됐다. 실제 `ultima4.zip`으로 실제 타이틀 화면("Lord British and Origin Systems, Inc. present Ultima IV")이 렌더되고, 키 입력 2회로 `IntroController`의 실제 상태 전이(INTRO_TITLES→INTRO_MAP→INTRO_MENU, 실제 영어 메뉴 텍스트까지)를 스크린샷으로 확인했다. 증거: `.omo/evidence/ultima-web/task-21/title-render.png`, `boot-failure.log`.
- **진행률: 승인 기준 10/25 = 40.0%** (Step 1~9, 21 ✅, Step 10 🟡). "실제 게임에서 확인" 열도 Step 7·8·9·21이 이번에 ✅로 갱신됨(실제 엔진으로 재검증).
- 이 과정에서 **실제 실행 전엔 전혀 안 보이던 버그 5개**를 실제로 찾아 고쳤다(전부 handoff.md "Todo 21 완료 기록"에 상세 기록): `-sFS_DEBUG=1` 누락(Todo 10 트래킹 자체가 불가능했음), 낡은 `render.pak`, `gpu_opengl.cpp`의 `GPU_RENDER` 경로 `#include "map.h"` 누락, `getTicks.c`의 `msecSleep()`이 `nanosleep()`으로 매 프레임 브라우저를 완전히 멈추던 버그(가장 심각했음, advisor 상담으로 확정), `gpu_opengl.cpp`의 GL_RGB/RGBA 텍스처 포맷 불일치.
- 검증 게이트 전부 exit 0 (이 브랜치, Node 22, 실제 `ultima4.zip` 사용): `npm run test:unit`(13 files/99 tests) · `npm run verify:repo-sources`(4 pinned components) · `npm run typecheck` · `npm run build` · `git diff --check` · 전체 e2e 스위트(`npx playwright test --project=chromium`, **10/10 통과**, `tests/e2e/boot-sequence.spec.ts` 포함).

## 3. 변경한 파일 (Files changed, commit `70d14db`, `542ce34` 위에)
- `src/engine/startup.ts` — `render.pak`/`Ultima-IV.mod`/`ultima4.zip`을 FS 루트에 쓰기, `ENV.HOME`을 `preRun` 콜백으로 `/persist`로 설정, `persistence.attach()`를 실제로 연결, `Module.onExit`/`onAbort`로 조기 종료를 `runtime-error`로 보고.
- `src/main.ts` — `Module.canvas`를 `#game-canvas`에 연결, render.pak/Ultima-IV.mod를 fetch(+`response.ok` 검사)해서 `startEngine`에 전달.
- `scripts/build-wasm.mjs` — `-sFS_DEBUG=1`, `-sEXPORTED_RUNTIME_METHODS`에 `ENV` 추가.
- `vendor/xu4/src/gpu_opengl.cpp` — `#include "map.h"`는 21.1에서 이미 build-dir 패치로; 이번엔 vendor 원본에 `screenTex`의 `GL_RGB`→`GL_RGBA`(`__EMSCRIPTEN__` 분기 추가).
- `vendor/xu4/src/support/getTicks.c` — `msecSleep()`에 `__EMSCRIPTEN__` 분기 추가(`emscripten_sleep`).
- `vendor/source-manifest.json` — 위 두 vendor 수정 반영해 `treeSha256` 갱신(Todo 7/8이 세운 전례를 따름).
- `tests/unit/startup-sequence.test.ts` — 새 옵션(`renderPak`/`gameModule`)·`ENV`/`preRun`·persistence 배선 반영해 갱신.
- `tests/e2e/boot-sequence.spec.ts` (신규) — happy/failure 경로.
- `plan.md`, `handoff.md`, 이 파일 — Todo 21 완료 기록.
- `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md` — Todo 21 체크박스 `[x]`로 변경(byte-identical 확인).

## 4. 주요 결정과 근거 (Key decisions)
- FS 경로(ultima4.zip/render.pak/Ultima-IV.mod)는 전부 **FS 루트**에 쓴다 — `u4find_path`/`u4find_pathc`가 resourcePaths[0]="."과 결합해 가장 먼저 찾는 경로임을 Node에서 실제 엔진을 직접 실행해 verbose 로그로 실측 확인(추측 아님).
- `Module.ENV.HOME`은 반드시 `preRun` 콜백 안에서 설정 — `await factory(...)` 이후엔 이미 늦다(getenv 캐시가 먼저 굳음). `factoryOptions` 객체는 스프레드로 복사하지 말고 그 참조 그대로 `options.factory()`에 넘겨야 한다(MODULARIZE가 그 객체 자체를 `Module`로 재사용하기 때문) — 이 버그를 유닛 테스트로 잡았다.
- vendor/xu4 직접 수정(gpu_opengl.cpp, getTicks.c) — "vendor는 tree-hash pinned라 못 건드린다"는 이전 세션의 전제가 **틀렸다**는 걸 advisor가 지적: Todo 7/8이 이미 `event.cpp`/`web_bridge.*`를 수정하고 매니페스트를 갱신한 전례가 있다(`git log`로 확인). 이번에도 같은 방식(수정 + `vendor/source-manifest.json` 재계산, 같은 커밋).
- WebGL 캔버스의 "검은색 아님" 검증은 `gl.readPixels()`/`drawImage()+getImageData()`가 아니라 **screenshot 바이트 크기 비교**로 한다 — 캔버스가 `preserveDrawingBuffer` 없이 생성되어 있어서 인페이지 픽셀 읽기는 항상 지워진 버퍼를 읽는다(advisor 지적, 실측으로 재확인).
- 브라우저 hang은 "느림"이 아니라 "메인 스레드 스핀"이었다 — `getAttribute()`조차 응답 없는 걸 보고 advisor에게 물어서 `msecSleep()`의 `nanosleep()` 블로킹을 특정했다. 타임아웃을 늘리는 방향으로 계속 삽질하지 않은 게 시간을 크게 아꼈다.

## 5. 다음 할 일 (Next steps)
- [ ] **Todo 10의 `tests/e2e/save-reload.spec.ts`** — persistence coordinator는 연결됐지만(21.2) 실제 저장 트리거(캐릭터 생성 등)가 아직 자동화 안 됨. 다음으로 하기 좋음(엔진이 이제 실제로 도니까).
- [ ] 병렬 가능: Todo 19 workflow 골격(Node 22 CI) — 아직 착수 안 함.
- [ ] Todo 11~13(한국어 UI) → 16(Web Audio, 21.1의 무음 구현 교체) → 14 → 15(번역) → 17 → 18 → 19 완료 → 20 → F1~F4.
- [ ] **`todo-21-real-engine` 브랜치의 main merge** — AGENTS.md 규칙상 사용자 확인 필요, 아직 안 함(다음 세션 시작 시 먼저 물어볼 것).

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- Todo 10은 여전히 🟡다 — persistence coordinator 연결은 됐지만 실제 저장이 한 번도 안 일어나봤다. IDBFS write가 페이지 재로드 후 실제로 살아남는지 확인 안 됨(확인 필요).
- `vendor/xu4/src/gpu_opengl.cpp`/`support/getTicks.c`를 또 고칠 일이 생기면 반드시 `vendor/source-manifest.json`의 `treeSha256`도 같이 갱신할 것 — `node -e "import('./scripts/repo-source-verifier.mjs').then(({summarizeSourceTree}) => console.log(JSON.stringify(summarizeSourceTree('vendor/xu4'))))"`로 재계산.
- Emscripten의 `Module.ENV`/`preRun` 타이밍은 미묘하다 — `factoryOptions`를 스프레드로 복사해서 넘기면 안 됨(위 4번 참고). 다음에 비슷한 Module 옵션을 추가할 때 같은 함정에 빠지지 말 것.
- WebGL 캔버스 관련 검증은 screenshot 기반으로만 할 것 — `readPixels`/`drawImage`는 이 프로젝트의 캔버스 설정에서 신뢰 불가.
- 로그인 셸이 아닌 환경에선 `/usr/bin/node`(v20)가 먼저 잡힌다 — `export PATH="$HOME/.local/opt/node22/bin:$PATH"` 필요. wasm 빌드 시 `source .emsdk/emsdk_env.sh`.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-21-real-engine   # main에서 분기, 커밋 542ce34 -> 70d14db
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v   # v22.23.3
git status -sb && git log --oneline -5
source .emsdk/emsdk_env.sh && npm run build:wasm -- --debug
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
```
- 공식 인계: `handoff.md` "Todo 21 완료 기록 (2026-09-25, ...)". 진행률/순서: `plan.md`. Todo 21 전문: `.omo/plans/ultima-web.md`. 운영 규칙: `AGENTS.md`.
