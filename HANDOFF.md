# HANDOFF
작성 시각: 2026-09-25 00:35 KST — Todo 21.1(실제 엔진 링크) 완료 반영

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- 이번 세션: 사용자 요청 "plan.md 기준으로 다음 단계 진행해"에 따라 재계획에서 크리티컬 패스로 정한 **Todo 21.1(실제 xu4 엔진을 wasm에 링크)**을 수행했다.

## 2. 현재 상태 (Current state)
- **branch `todo-21-real-engine`, commit `542ce34`** (main `2f9da51`에서 분기, 아직 main에 merge 안 함).
- **Todo 21.1 완료**: `scripts/build-wasm.mjs`가 이제 네이티브와 같은 소스 목록(`vendor/xu4/src/Makefile.common`, 69개 파일: CSRCS+CXXSRCS, UI=glfw, CONF=boron)으로 실제 `xu4.cpp`를 링크한다. `npm run build:wasm -- --debug` exit 0, `xu4.wasm` 7,496,388 bytes(이전 스텁 빌드보다 훨씬 큼). `llvm-nm --defined-only`로 정의 심볼 **2832개**(이전 ~251개) 확인, `GameController`/`IntroController`/`EventHandler` 등 실제 엔진 심볼 존재 확인.
- **아직 안 된 것**: 엔진이 브라우저에서 실제로 실행/렌더/입력을 받은 적은 없다(21.2~21.4). `main()`을 실제로 부르면 모듈/ZIP 경로 문제로 `errorFatal`이 날 가능성이 높다(21.2가 다룰 부분). `gpu_opengl.cpp`의 `glMapBufferRange` 호출은 vendor 원본 그대로 남아 있어 WebGL2에서 실제로 동작하는지는 21.3에서 처음 확인한다.
- 검증 게이트 전부 exit 0 (이 브랜치, Node 22): `npm run test:unit`(13 files/99 tests, `wasm-symbols.test.ts` 포함), `npm run verify:repo-sources`(4 pinned components — vendor/xu4 tree hash 불변 확인), `npm run typecheck`, `npm run build`, `git diff --check`.

## 3. 변경한 파일 (Files changed, commit `542ce34`)
- `scripts/build-wasm.mjs` — 소스 목록을 29개(플레이스홀더 stub 포함) → 69개(실제 엔진)로 교체. `-DVERSION` 따옴표 버그 수정(`-DVERSION='"DR-1.0"'` → `-DVERSION="DR-1.0"`, spawnSync가 셸을 안 거쳐서 예전 값은 홑따옴표가 글자 그대로 들어갔었음). `gpu_opengl.cpp`의 build-dir 복사본에 `#include "map.h"`를 주입하는 패치 단계 추가(이유는 아래 4번).
- `scripts/web-sound-silent.cpp` (신규) — `vendor/xu4/src/sound.h`의 모든 함수를 실제 시그니처(C++ linkage) 그대로 no-op 구현. `sound_faun.cpp`(Faun/PulseAudio/pthread) 대체.
- `scripts/web-stub.cpp`, `scripts/web-main.cpp` (삭제) — 발명된 이름(`gpuInit`, `savegameSave`, `xu4_config_get` 등)이거나 실제 함수와 링크가 안 맞는 stub이었고, 실제 엔진 어디서도 참조하지 않음(`grep`으로 확인).
- `vendor/xu4/src/*`는 **건드리지 않음** — tree-hash로 pinned(`verify-repo-sources.mjs`)라서 `gpu_opengl.cpp` 수정은 `build-wasm.mjs`가 `build/wasm-release/src/gpu_opengl.cpp`(빌드 시 복사본)에만 적용한다.
- `plan.md`, `handoff.md` — Todo 21.1 완료 기록 추가(이 파일 이후에 갱신, 아래 참고). `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`는 **변경 없음** — 이 두 문서는 Todo 전체가 끝나야 체크박스를 바꾸는 문서라서(선례: Todo 10도 부분완료 상태에서 그대로 `[ ]`), 21.1만 끝난 지금은 그대로 두는 게 맞다.

## 4. 주요 결정과 근거 (Key decisions)
- 첫 링크 시도에서 실제로 걸린 컴파일 에러는 딱 2개였다(예상보다 가벼웠음):
  1. `gpu_opengl.cpp`의 `GPU_RENDER` 매크로 분기(맵청크 렌더링, `gpu_resetMap`/`gpu_drawMap`)가 `Map`/`BlockingGroups`를 역참조하는데 `gpu.h`는 전방선언만 한다. 네이티브 빌드는 `GPU_RENDER`를 기본으로 안 켜므로(`GPU ?= scale`) 이 코드가 이제까지 한 번도 실제로 컴파일된 적이 없었다 — 순수 wasm 쪽 발견.
  2. `sound.h`가 `uint16_t`를 쓰는데 그 자체로는 `<cstdint>`를 안 받는다(다른 TU들은 항상 다른 헤더가 먼저 그걸 끌어와서 안 걸렸던 것).
- vendor 소스는 tree-hash pinned라 원본을 못 고친다 → `gpu_opengl.cpp` 수정은 `build-wasm.mjs`가 매번 "vendor 복사 → 패치" 순서로 재적용한다(이미 스크립트가 vendor를 `build/wasm-release`로 복사하는 기존 구조를 그대로 활용).
- `web-stub.cpp`/`web-main.cpp`를 삭제 전에 `grep -rln "xu4_enqueue_key\|xu4_submit_text\|xu4_config_get\|gpuInit\|gpuBeginFrame\|savegameSave" vendor/xu4/src`로 실제 엔진이 그 이름들을 안 쓴다는 걸 먼저 확인했다(결과 0건) — 안 그러면 삭제가 링크를 깨뜨릴 수 있었다.

## 5. 다음 할 일 (Next steps)
- [ ] **Todo 21.2 (FS/경로 해결)** — 같은 브랜치(`todo-21-real-engine`)에서 계속. `.omo/plans/ultima-web.md`의 Todo 21 본문 중 21.2 항목을 먼저 읽는다. 할 일: (a) `render.pak`/`Ultima-IV.mod`/`U4-Upgrade.mod`를 wasm FS의 실제 경로에 쓰기(지금은 `/engine/modules/`로 HTTP 서빙만 되고 wasm FS `/assets`는 비어 있음), (b) `u4fsetup`이 `.`/`u4`에서만 찾는 `ultima4.zip` 경로를 Todo 9의 `/data/ultima4.zip`과 맞추기(`u4file.cpp:152-153`), (c) emcc에서 `Settings::init`의 user path(`settings.cpp`의 `__unix__`/`__linux__` 분기, `$HOME` 값, `-p <profile>`)가 Todo 10의 IDBFS 마운트(`/persist/...`)와 맞는지 확인하고 안 맞으면 맞춘다.
- [ ] Todo 21.2 통과 후 실제로 `callMain`을 호출해서 무슨 일이 일어나는지 관찰(지금까지는 링크만 했고 실행은 한 번도 안 해봤다).
- [ ] 21.3(타이틀 화면 렌더, `Module.canvas` 바인딩) → 21.4(실제 입력, GLFW 리스너 vs `main.ts` 큐 중복 방지).
- [ ] 21.4 이후: Step 7/8 실제 엔진 재검증, Step 10 e2e(`save-reload.spec.ts`) 추가.
- [ ] 병렬 가능(미착수): Todo 19 workflow 골격.
- [ ] Todo 21 전체 완료 후: main merge 전 AGENTS.md 게이트 전부 재실행 + `plan.md`/`handoff.md`/계획서 두 벌 갱신(체크박스 `[x]`, 진행률 10/25) — 지금은 아직 하지 않는다.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 링크만 됐다. 브라우저 실행/렌더/입력 중 아무것도 검증 안 됐다 — 21.2~21.4가 그 몫이다.
- `gpu_opengl.cpp`의 `glMapBufferRange` 호출은 vendor 원본 그대로다(Step 7의 WebGL2 작업은 별도 셰이더 하네스에서만 검증됐고, vendor 소스 자체는 안 고쳤다는 게 이전 재계획의 발견이었음) — 실제 렌더러에서 동작하는지는 21.3에서 처음 확인해야 한다.
- vendor/xu4는 tree-hash pinned(`verify-repo-sources.mjs`) — 엔진 소스에 버그를 발견해도 `vendor/xu4/src/*`를 직접 고치면 안 되고, `build-wasm.mjs`의 build-dir 복사본 패치 단계로 처리한다(이번 `gpu_opengl.cpp` 패치가 그 선례).
- `-Ivendor/faun/support` include dir와 `vendor/faun/support` 복사 단계는 이제 죽은 코드일 가능성이 높다(well512는 `libboron.a`가 이미 제공함, `llvm-nm`으로 확인함) — 지우지 않고 남겨뒀다, 사소해서 21.1 범위 밖으로 미룸.
- 로그인 셸이 아닌 환경에선 `/usr/bin/node`(v20)가 먼저 잡힌다 — `export PATH="$HOME/.local/opt/node22/bin:$PATH"` 필요. wasm 빌드 시 `source .emsdk/emsdk_env.sh`.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-21-real-engine   # 이미 main에서 분기된 브랜치, 커밋 542ce34
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v   # v22.23.3
git status -sb && git log --oneline -5
source .emsdk/emsdk_env.sh && npm run build:wasm -- --debug
.emsdk/upstream/bin/llvm-nm --defined-only build/wasm-release/xu4.wasm | wc -l   # 2832 (엔진 있음)
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
```
- 공식 인계: `handoff.md` "Todo 21.1 완료 기록 (2026-09-25, ...)". 진행률/순서: `plan.md`. Todo 21 전문: `.omo/plans/ultima-web.md`. 운영 규칙: `AGENTS.md`.
