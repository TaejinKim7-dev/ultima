# HANDOFF
작성 시각: 2026-09-26 21:35 KST — Todo 13 abort 근본 원인 수정 + e2e GREEN, 16/25 = 64.0%

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 사용자 지시: "plan.md 기준으로 다음 단계 진행해. 규칙은 AGENTS.md, 끝나면 plan.md 진행률과 HANDOFF.md 갱신" — 이전 세션이 Todo 14에서 멈춘 뒤 재개, 이번 세션에서 Todo 13을 막던 크래시의 근본 원인을 찾아 고치고 e2e를 GREEN으로 만들었다.

## 2. 현재 상태 (Current state)
- **승인 기준 16/25 = 64.0%** (Step 1~14, 16, 21 ✅). 실제 게임 확인: 7, 8, 9, 10, 13, 16, 21 (11·12·14는 synthetic bridge dispatch만, ⬜).
- main: `a88d9e4`까지 로컬 커밋 완료. **origin push는 아직 안 함** (이 세션에서 push는 수행하지 않았다 — 다음 재개 시 사용자 지시 없이 진행 가능, 단 실제로 push하기 전에 아래 게이트를 다시 한번 확인).
- **Todo 13 완료, `[x]`**: 코드(`80ce1ac`)는 이전에 이미 병합돼 있었고, 이번 세션에서 (1) e2e happy-path를 막던 WASM 전용 `Aborted(RuntimeError: unreachable)` 크래시의 근본 원인을 확정하고 고쳤고(`b56b415`, `todo-99-settings-abort` → main `cf0a690`), (2) e2e spec을 실제 Configure-menu 경로로 되돌려 두 테스트 모두 GREEN으로 만들었다(`c42398c`, `todo-13-e2e` → main `a88d9e4`).
- **버그 근본 원인 (이전 세션 fix-7 조사의 "musl/Asyncify/GLFW reentrancy" 가설이 맞았다)**: Emscripten의 GLFW 웹 포트가 `screen_glfw.cpp`의 키/마우스 콜백을 브라우저 DOM 이벤트에서 직접·동기적으로 호출 — `EventHandler::run()`의 Asyncify 프레임 루프가 `emscripten_sleep()` 중간에 unwind돼 대기 중인 시점과 무관하게 끼어들 수 있다. 그 콜백이 메뉴/치트메뉴 탐색으로 새 `EventHandler::run()`을 재귀 호출하면 그 중첩 호출도 Asyncify로 suspend되는데, Asyncify는 전역 단일 suspend만 지원 — 원래 대기 중이던 sleep의 콜백이 고아가 되고, 나중에 발화하면 이미 재사용된 `Asyncify.currData`(크래시 직전 실측 `null`)로 재개를 시도해 abort. 힙 손상이 아니라 순수 재진입 버그였다. 상세 진단 과정·계측 로그는 `handoff.md`의 "Todo 13 e2e 차단 해소" 절 참고.
- **수정**: `vendor/xu4/src/screen_glfw.cpp` — GLFW 콜백은 이제 이벤트를 작은 링 버퍼에 큐잉만 하고, `EventHandler::handleInputEvents()`가 자신의 `glfwPollEvents()` 직후(네이티브가 콜백을 동기 처리하는 바로 그 지점)에 드레인. `#ifdef __EMSCRIPTEN__`로 네이티브 무영향(재빌드·CTest 3/3 확인).
- 신규 회귀 스펙 `tests/e2e/configure-menu-no-abort.spec.ts`(RED→GREEN 확인) — Todo 17/F3도 이 재진입 클래스의 다른 트리거를 만날 수 있으니 주의.
- 병합됨·`[ ]` 유지: 19-emsdk(CI emsdk 핀) · 18-audit(audit:dist 8종+글루 allowlist). 15 인벤토리(4-chunk 분할안) · 17 QA 갭분석 recon 완료.
- **최종 게이트 전부 exit 0 (main, 이 세션에서 직접 실행)**: unit 21 files/258 tests · verify:repo-sources · typecheck · build · diff-check · cmp(계획서 2벌 byte-identical) · cmake configure/build · CTest 3/3 · native 빌드(경고만, 에러 없음) · e2e(`--workers=1`) korean-npc-alias 2/2(happy 2.8m + failure 1.6m) · save-reload 3/3(3.1m) · e2e(`--workers=2`) 나머지 23/23 무회귀.

## 3. 변경한 파일 (이번 웨이브)
- `vendor/xu4/src/screen_glfw.cpp`: GLFW 콜백 재진입 방지 입력 큐 추가(약 100줄).
- `vendor/source-manifest.json`: xu4 `treeSha256` 재계산.
- 신규 `tests/e2e/configure-menu-no-abort.spec.ts`: abort 회귀 방지 스펙 2개.
- `tests/e2e/korean-npc-alias.spec.ts`: 임시 IndexedDB seed 우회를 걷어내고 실제 Configure-menu 경로(`enableDebugMode`)로 복귀, happy-path 최초 완주.
- `plan.md`·`.omo/plans/ultima-web.md`·`docs/ULTIMA_WEB_PLAN.md`: Todo 13 `[x]`, 진행률 16/25.
- `handoff.md`: "Todo 13 e2e 차단 해소" 절 신규 추가(진단 과정 전체, 이전 세션의 틀린 결론 정정 포함).
- main merge 커밋: `b56b415`(fix)/`cf0a690`(merge), `c42398c`(spec)/`a88d9e4`(merge).

## 4. 주요 결정과 근거 (Key decisions)
- 근본 원인 수정을 우선함 (advisor 상담 결과 "워크어라운드로 우회하지 말고 지금 고쳐라" — Todo 13/17/F3가 전부 이 버그 클래스에 막혀 있었으므로).
- `todo-99-settings-abort` 브랜치(이전 세션이 조사만 하고 남긴 것)를 재사용해 실제 수정 커밋.
- e2e spec은 (한 세션 내 워크어라운드였던) IndexedDB 직접 seed 방식을 버리고, 버그가 고쳐졌으므로 원래 설계 의도대로 실제 Configure 메뉴 경로로 복귀 — spec 자체가 이 수정의 회귀 테스트를 겸하게 함.
- e2e는 `--workers=2`로 돌리면 긴 테스트(save-reload, korean-npc-alias)가 tracing 아티팩트 경합으로 실패할 수 있음을 이번에 실측 확인 — 반드시 `--workers=1`로 개별 실행.

## 5. 다음 할 일 (Next steps, 재개 시 순서)
- [ ] origin push (로컬 merge까지만 완료, 아직 push 안 함 — 사용자 "묻지 말고 진행" 지시에 따라 다음 세션이 바로 push해도 됨).
- [ ] Todo 15 (4-chunk: A tlk 2레인 / B module+glossary / C ui+binary / D strict sweep).
- [ ] Todo 17 (갭 분석 있음, 치트 없이 public UI 경로만 — 이번에 고친 재진입 버그의 다른 트리거가 없는지 특히 주의 깊게 봐야 함) → 18 → 19 완료 → 20 → F1~F4.
- [ ] Pages Source = "GitHub Actions" 설정은 사용자만 가능.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- e2e는 `--workers=1`로 긴 스펙(save-reload, korean-npc-alias) 분리 실행 필수. 나머지는 `--workers=2` 무회귀 확인함.
- `build/wasm-release`는 git-ignored, 새 worktree에 복사 필요(원본 데이터 없음 확인 후) — 이번 세션엔 `build/host/{boron,modules}`도 별도로 복사해야 wasm 빌드 자체가 성공함을 발견(순서: `deps:host`→`build:modules`→`build:wasm`, 순서 틀리면 render.pak이 안 실림).
- Node 22 PATH 매 호출 export. emsdk PATH도 별도 export 필요(`$HOME/ultima/.emsdk` 계열). 원본 zip repo 복사 금지.
- F3 수동 QA·`qa:native-baseline` 2회차(승인제) 미실시.
- GLFW 콜백 재진입 버그는 "settings write"나 "town 진입"에 국한되지 않는, 더 일반적인 클래스다 — 이번엔 못 찾았지만 다른 메뉴/치트 경로에서 유사 증상(원인불명 abort 또는 탭 프리즈)이 재현되면 이 버그의 잔여 인스턴스가 아니라 진짜 새 버그인지부터 의심할 것(수정이 근본 원인을 없앴으므로 이론상 전부 해소됐어야 함).

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -8
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium --workers=2 --grep-invert "Todo 13|Todo 10:"
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium --workers=1 tests/e2e/korean-npc-alias.spec.ts tests/e2e/save-reload.spec.ts
```
- 공식 인계: `handoff.md`의 "Todo 13 e2e 차단 해소" 절(가장 최근, 가장 상세). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
