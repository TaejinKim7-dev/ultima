# HANDOFF
작성 시각: 2026-09-27 19:48 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식 + 한국어화. 진행 기준 `plan.md`(25단계).
- 최종 목표는 **한국어로 실제 플레이하는 웹 기반 울티마 4**. 영어 keyword 또는 한국어 alias 입력 가능 + 실제 NPC 응답은 한국어여야 함. 현재 검증된 것은 한국어 alias 입력뿐(Calabrini 실제 응답은 영어) — 한국어 NPC 출력 미완료, 출시 차단. 72%는 계획 승인률이지 한국어 플레이 완성률이 아님.
- 이번 세션: `plan.md` 바로 다음 순서 5번 — stale 한국어 입력 제출이 실제 게임 표면(GLFW keydown)으로 합성되지 않게 하는 최소 구현(Todo 18 남은 RED).

## 2. 현재 상태 (Current state)
- 진행률 **18/25 = 72%** (Todo 18은 아직 `[ ]`). branch `todo-18-failure-boundaries`, HEAD `2ba0b32`, 이번 변경 전부 **미커밋**, main 미merge.
- 이번 세션 구현(아래 3절): 네이티브 `ReadStringController` 생성/소멸 → `Module.u4TextPrompt.opened(id)/closed(id)` EM_JS 훅, `startEngine({textPrompt})`로 연결, 셸 `#korean-keyword-input`이 순수 게이트(`src/i18n/text-prompt-gate.ts`)로 제출을 판정.
- 실제로 확인한 결과(모두 직접 실행):
  - 유닛 RED→GREEN: `text-prompt-gate.test.ts` 모듈 없음으로 RED(exit 1) → 10/10 GREEN. `startup-sequence.test.ts`의 새 Todo 18 케이스 RED(1 failed/9 passed) → 10/10 GREEN. 로그: `.omo/evidence/ultima-web/task-18/stale-real-surface/{unit-red,unit-green,startup-unit-red,startup-unit-green}.log`.
  - 전체 `npm run test:unit` 22 files/276 tests, `verify:repo-sources`, `typecheck`, `build`, `audit:dist`, `git diff --check`, 계획서 `cmp` 전부 exit 0 (`stale-real-surface/static-gates.log`, `build.log`).
  - 백그라운드 fork 보고(직접 재현은 grep/diff만): `npm run build:wasm`(release) exit 0, `xu4.wasm` 1,186,774 B, `wasm-symbols.test.ts` 8/8, `verify:repo-sources` 0, `event.cpp` 네이티브 `g++ -fsyntax-only` 0. 내가 직접 확인: `dist/engine/xu4.mjs`에 `u4TextPrompt` 존재, event.cpp diff 검토.
- **진행 중(결과 미확인)**: `failure-boundaries.spec.ts` e2e GREEN 실행(port 4228, 4/4 기대). 결과는 `stale-real-surface/green.log`. **확인 필요**.
- 아직 안 돌림: 회귀 확인용 `korean-npc-alias.spec.ts`, `gameplay-progression.spec.ts`(게이트가 제출을 막지 않는지), `npm ci`.

## 3. 변경한 파일 (Files changed)
- `vendor/xu4/src/event.cpp` — `__EMSCRIPTEN__` 한정: EM_JS `u4_web_text_prompt_opened/closed`, `ReadStringController`에 `webPromptId` + 소멸자. 네이티브 빌드 무영향.
- `vendor/source-manifest.json` — xu4 treeSha256 `69f8d7e7…59eb` (fileCount 410 유지).
- `src/i18n/text-prompt-gate.ts`(신규) + `tests/unit/text-prompt-gate.test.ts`(신규) — 열린 prompt 스택, input 시점 prompt id 캡처, 제출 판정(stale/없음 거부 메시지).
- `src/engine/startup.ts` + `tests/unit/startup-sequence.test.ts` — `TextPromptReceiver`, `textPrompt` 옵션을 callMain 전에 `module.u4TextPrompt`로 부착.
- `src/shell.ts` — 게이트 생성, `input` 이벤트에서 `noteInput()`, `submitKoreanKeyword()`가 먼저 게이트 판정 후 거부 시 `[한글 입력 거부] …` 메시지; `UltimaBridgeApi.textPromptReceiver` 추가; "대화 밖에서 쓰면 top-level 키 합성" 주석을 새 동작으로 수정.
- `src/main.ts` — `startEngine`에 `textPrompt: bridge.textPromptReceiver` 전달.
- `tests/e2e/failure-boundaries.spec.ts` — 이전 세션에서 추가한 stale real-surface RED 테스트(이번엔 수정 안 함).
- `plan.md`, `handoff.md` — 이전 세션의 미커밋 변경(이번엔 아직 안 건드림).

## 4. 주요 결정과 근거 (Key decisions)
- 신호원은 네이티브 `ReadStringController` 수명: readInt/readString/readStringView 전부 이 클래스 → 이름 입력(`intro.cpp:823`)과 NPC talk(`game.cpp:1424`) 모두 커버. 셸 쪽엔 prompt 상태 신호가 달리 없었음.
- 기존 bridge `prompt` 이벤트 재사용 안 함: `showPromptMarker()`가 `focus()`를 빼앗아 한국어 입력 중 포커스가 튐 + bridge 계약 변경 필요.
- 게이트 규칙: 제출 시 prompt가 열려 있어야 하고, 마지막 입력 시 캡처한 id가 null(열리기 전 입력)이거나 현재 id와 같아야 함 → 기존 alias 헬퍼가 prompt 열리기 전에 fill해도 안 깨지도록.
- `closed(id)`는 열린 id만 제거(순서 꼬임으로 게이트가 고착되지 않게), 스택으로 중첩 대비.

## 5. 다음 할 일 (Next steps)
- [ ] `stale-real-surface/green.log` 확인: `failure-boundaries` 4/4 + exit 0인지. 실패면 스크린샷/관측 로그 보고 수정.
- [ ] 회귀: `korean-npc-alias.spec.ts`, 그다음 `gameplay-progression.spec.ts`를 **순차로**(타이밍 민감) 실행해 게이트가 정상 제출을 막지 않는지 확인.
- [ ] 통과 시 커밋(`test(web): harden browser failure boundaries` 계열), `plan.md` Todo 18 ✅/19/25, 계획서 두 벌 `[x]` + `cmp`, `handoff.md`에 게이트 명령·exit code 기록.
- [ ] `npm ci` + main merge/push는 사용자 결정 대상(이번 세션 지시) — 묻고 진행.
- [ ] 이후 Todo 19 → 20 → F1~F4. 출시 전 Step 11/12/14 실제 엔진 한국어 출력 연결 gap 해결.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 이번 변경 이후 **stale wasm + 새 셸** 조합이면 모든 한국어 제출이 "열린 입력 요청 없음"으로 거부됨 — e2e 전 `build/wasm-release`가 새 빌드인지(`grep u4TextPrompt dist/engine/xu4.mjs`) 확인.
- 동작 변화: 이제 NPC/텍스트 prompt 밖에서 한국어 입력창 제출은 키 합성 대신 거부 메시지. 의도된 변화지만 F3 수동 QA에서 UX 확인 필요.
- e2e 동시 실행 시 반드시 다른 `PLAYWRIGHT_PORT`. NPC 접근 스윕 스펙끼리는 동시 실행 자제.
- UX 이슈(미수정): 한글 입력창 사용 후 화살표/명령키가 조용히 무시됨(포커스 가드).
- `memory-smoke`는 JS heap만 측정(wasm linear memory 미포함).
- `pkill -f "<패턴>"`은 자기 셸까지 죽임 — `"[p]laywright ..."` 대괄호 트릭.
- 진행률 분모: AGENTS.md/plan.md는 25, 이번 세션 사용자 지시문은 n/24 — 25 유지, 불일치 보고함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-18-failure-boundaries && git status -sb
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
# wasm 재빌드가 필요하면: source .emsdk/emsdk_env.sh && npm run build:wasm
npm run build
PLAYWRIGHT_PORT=4228 npm run test:e2e -- tests/e2e/failure-boundaries.spec.ts --project=chromium --workers=1
PLAYWRIGHT_PORT=4188 npm run test:e2e -- tests/e2e/korean-npc-alias.spec.ts --project=chromium --workers=1
PLAYWRIGHT_PORT=4238 npm run test:e2e -- tests/e2e/gameplay-progression.spec.ts --project=chromium --workers=1
```
- 상세 기록: `handoff.md` 마지막 절, 진행 순서: `plan.md` "바로 다음 순서".
