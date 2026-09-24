# HANDOFF
작성 시각: 2026-09-24 14:15 KST

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 전체 진행은 `/home/taejin/ultima/plan.md`의 24단계 기준으로 관리한다.
- 이번 세션: **Step 7·8 main merge 완료 + merge 게이트 재실행 + plan/handoff 문서 갱신**.

## 2. 현재 상태 (Current state)

### 2-0. 진행률 요약
- **공식 완료: 8 / 24 = 33.3%** (Step 1~8, 모두 main merge됨).

### 2-1. Step 7 → main
- merge `874c775 Merge todo-07-webgl2: WebGL2-safe buffers and shaders`, 구현 `90232b9`. WebGL2 CPU staging + shader ANGLE 수정 + e2e `webgl-render.spec.ts`.

### 2-2. Step 8 → main
- merge `6b97d8e Merge todo-08-input-queue: browser-safe input queues`, 구현 `af13814`. `src/bridge/input-queue.ts` + `web_bridge` C ABI + unit/native/e2e.

### 2-3. source-manifest 충돌 resolve
- 양 branch 동시 `vendor/source-manifest.json` 수정 → merge 시 treeSha256 충돌 → 합친 vendor tree 재계산.
- 최종: xu4 **fileCount 409**, treeSha256 `e65f0d9b616f9e28923a5e6dfd61b481848832ac3a5f2ce3b0f2169d73b25b49` (`summarizeSourceTree` match:true).

### 2-4. merge 게이트 (main, 전부 실제 실행 · exit 0)
| 항목 | 결과 |
|---|---|
| `npm ci` | 0 (EBADENGINE warning only) |
| `npm run test:unit` | 0 — 10 files / **73/73** |
| `npm run verify:repo-sources` | 0 |
| `npm run typecheck` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |
| `cmp` 계획서 두 벌 | 0 |
| `deps:wasm` + `build:wasm -- --debug` | 0 — 33/33 sources, xu4.wasm 3599061 B, Asyncify on |
| `wasm-symbols` unit | 0 — 8/8 |
| `input-queue` unit | 0 — 16/16 |
| full CTest (`cmake:configure`+`build`+test) | 0 — 3/3 (module-package, native-baseline-negative, input-queue) |
| `test:native -R input-queue` | 0 — Passed |
| `npx playwright test --project=chromium` | 0 — **3 passed** (shell-ready, input-queue, webgl-render) |

- 환경 복구: `deps:host` 재실행 후 `build:native` exit 0 → full CTest의 `native-baseline-negative` Passed.
- worktree evidence를 main `.omo/evidence/ultima-web/task-{7,8}/`로 복사(git-ignored local-only).
- 병렬 `npm ci` 동시 실행 시 unit/e2e가 일시 실패(node_modules 교체 충돌)했으나, npm ci 종료 후 순차 재실행으로 전부 통과 — 위 exit code가 최종 상태.

### 2-5. git 상태
- main tip `118c716`(docs) / Step 8 merge `6b97d8e`, **push 완료** — origin과 동기화(`main...origin/main` 동기).
- worktree clean(untracked session 잔여물만: `.claude/`, `.omo/boulder.json`, `.omo/start-work/`, `.omo/lazycodex-executor-verify/` — 커밋 금지).
- 사용자 승인: Step 7/8 merge + `git push origin main` — 둘 다 완료.

## 3. 변경한 파일 (Files changed)
- `plan.md` — 진행률 8/24, Step 7·8 ✅, merge 게이트 exit code 기록, "바로 다음 순서"=Step 9.
- `handoff.md` — Todo 7/8 "merge 대기" → "main merge 완료" 승격 + 게이트 블록.
- `HANDOFF.md` — 이 파일 갱신.
- `.omo/plans/ultima-web.md` + `docs/ULTIMA_WEB_PLAN.md` — Todo 7·8 checkbox `[x]` (byte-identical 유지).

## 4. 주요 결정과 근거 (Key decisions)
- Step 7: `#if defined(__EMSCRIPTEN__) || defined(U4_WEBGL2_SAFE_BUFFERS)` — native `glMapBufferRange` 경로 보존.
- Step 8: queue reject-newest(256), prompt epoch로 in-flight 폐기, `emscripten_sleep(0)` per-frame yield.
- source-manifest 충돌은 재계산 resolve(임의 편집 금지).

## 5. 다음 할 일 (Next steps)
- [x] docs 커밋 → `git push origin main` (완료: tip `118c716`, origin 동기화).
- [ ] **Step 9**: 브라우저 시작 시퀀스 + 원본 ZIP 검증 + 가상 FS, main 1회 실행 (plan.md "바로 다음 순서").
- [ ] 10(IDBFS) → 11~13 → 14 → 15 … 16은 9 이후 병렬 가능.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- host Node 20.20.2(engines ≥22, 경고만). CI는 Node 22 준비 필요.
- release(非 debug) wasm은 placeholder main DCE로 작아질 수 있음 — acceptance는 `--debug`.
- Step 9 전 실제 게임 루프 런타임(WebGL2·input 소비) 미검증.
- `qa:native-baseline` E2E 2회차는 사용자 승인제.
- `.omo/evidence/`는 git-ignored — 병렬 worktree에서 main으로 evidence 복사 필요할 때가 있음.
- `npm ci`와 다른 heavy 작업 동시 실행 금지(일시적 unit/e2e 실패 유발).

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima && git status -sb && git log --oneline -8
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
npx playwright test --project=chromium
# 공식 인계: handoff.md "Todo 7/8 main merge 완료 기록" · 진행률: plan.md
# 운영 규칙: AGENTS.md
```
