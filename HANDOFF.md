# HANDOFF
작성 시각: 2026-09-24 14:00 KST

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 전체 진행은 `/home/taejin/ultima/plan.md`의 24단계 기준으로 관리한다.
- 이번 세션: **Step 6 main merge + Step 7·8 병렬 구현·게이트 완료(merge 대기)**.

## 2. 현재 상태 (Current state)

### 2-0. 진행률 요약
- **공식 완료: 6 / 24 = 25.0%** (Step 1~6, 모두 main merge됨).
- **Step 7·8: 🟡 브랜치 구현+acceptance/게이트 통과, main merge 전 → 진행률 0으로 계산** (AGENTS: 부분 진행은 0).

### 2-1. Step 6 → main merge 완료
- merge `c836ecc`, 구현 `26f7164`. 게이트 exit 0 (unit 57, wasm-symbols 8/8, QA instantiate/missing-fs). push 미실시.

### 2-2. Step 7 WebGL2 (branch `todo-07-webgl2`, commit `90232b9`, merge 대기)
- 변경: `gpu_opengl.cpp/.h` (Emscripten CPU staging + `glBufferSubData`, native map 경로 `#else` 유지), `world.glsl`/`xbr-lv2.glsl` ANGLE 수정, 신규 `tests/e2e/webgl-render.spec.ts`, `playwright.config.ts` chromium project, source-manifest.
- **테스트/게이트 (worktree 내 전부 exit 0)**:
  | 항목 | 결과 |
  |---|---|
  | RED e2e | `task-7/red.log` 1 failed (의도된 RED) |
  | GREEN e2e | `task-7/green.log` 1 passed (454ms) |
  | unit | 9 files / **57/57** passed |
  | typecheck / build / verify:repo-sources / diff-check | exit 0 |
  | full e2e (shell-ready 포함) | exit 0 |
  | failure QA bad-shader | exit 1, `runtimeError: shader-compile-error` |
  | 픽셀 | title 202,148,32 / status 226,212,178, shader 20 logs 0 error |
- evidence: `.omo/evidence/ultima-web/task-7/{red,green,bad-shader}.log`, `title-render.png`, `render-summary.json`
- manifest: xu4 treeSha256 `80758478…bbcdc` (fileCount 407)

### 2-3. Step 8 input queue (branch `todo-08-input-queue`, commit `af13814`, merge 대기)
- 변경: `src/bridge/input-queue.ts` (max 256, prompt epoch, IME guard), `vendor/xu4/src/web_bridge.{h,cpp}`, `event.cpp` fsleep=0 yield, `web-main/stub` 실제 queue 연결, unit+native+e2e 신규, build-wasm 소스 1행, source-manifest.
- **테스트/게이트 (worktree 내 전부 exit 0)**:
  | 항목 | 결과 |
  |---|---|
  | RED unit | `task-8/red.log` failed (의도된 RED) |
  | GREEN unit | `task-8/green.log` **16/16** |
  | unit 전체 | **73/73** (57+16) |
  | typecheck / build / verify:repo-sources / diff-check | exit 0 |
  | native `-R input-queue` | Passed |
  | build:wasm --debug + wasm-symbols | exit 0, **8/8** (sources 33/33) |
  | e2e input-queue + shell-ready | 1+1 passed |
  | failure QA stale requestId | `stale-request.log` 거부+무변경 |
  | wasm export codes | OK/INVALID/FULL/NO_PROMPT 매칭 |
- evidence: `.omo/evidence/ultima-web/task-8/{red,green,stale-request,wasm-queue-proof}.log`, `input-flow.trace.zip`
- manifest: xu4 fileCount **409**, treeSha256 `cfc0db65…93ca9`
- 알려진 제한: full `test:native`의 module-package/native-baseline은 fresh worktree에 build 산출물 없어 기존 환경 gap(스コ프 밖); 게임 루프 소비 배선은 Step 9.

### 2-4. 병렬 레인 · 이전 세션
- fix-3(Step 7)/fix-4(Step 8) reconcile 완료. exp-1/lib-1/exp-3/fix-1/fix-2 재사용 가능.
- Todo 1~5 main, emsdk 4.0.23, Todo 3 merge `13a3969`.

## 3. 다음 할 일 (Next steps)
- [ ] **Step 7·8 main merge** — 양쪽 `vendor/source-manifest.json` treeSha256 충돌 → 합친 vendor로 재계산 후 merge 게이트 재실행, handoff 기록.
- [ ] **user decision**: `git push origin main` (현재 ahead).
- [ ] Step 9 → 10 → …

## 4. 주요 결정
- Step 7: `#if defined(__EMSCRIPTEN__) || defined(U4_WEBGL2_SAFE_BUFFERS)` 분기 — native map 경로 보존.
- Step 8: queue reject-newest(256), prompt epoch로 in-flight keys 폐기, `emscripten_sleep(0)` per-frame yield.
- 양 step 모두 vendor 편집 → source-manifest 동기화 필수.

## 5. 주의사항
- 원본 데이터/evidence 원문 커밋 금지 유지.
- merge 전 양 worktree 게이트는 통과했으나 **병합 후 main에서 전체 게이트 재확인 필수**.
- Step 9 전 실제 게임 런타임(WebGL2·input 소비) 미검증.
- `qa:native-baseline` E2E 2회차는 사용자 허가제.

## 6. 재개 방법
```bash
cd /home/taejin/ultima && git status -sb && git log --oneline -5
git log --oneline main..todo-07-webgl2; git log --oneline main..todo-08-input-queue
# 공식 인계: handoff.md "Todo 6/7/8" 섹션 · 진행률: plan.md
```
- 운영 규칙: `AGENTS.md`.
