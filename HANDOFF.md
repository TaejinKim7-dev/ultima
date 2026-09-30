# HANDOFF
작성 시각: 2026-09-30 22:05 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 실제 플레이 화면을 한국어화. 진행 기준 `plan.md`.
- 이번 세션: `korean-shop.spec.ts`(Todo 25) 통합 실패 원인 확정 → 재발 방지용 Todo 28 신설·구현.

## 2. 현재 상태 (Current state)
- 진행률 **23/32 = 71.9%** (Todo 28 추가로 분모 31→32). Todo 24·25·26·28은 `verify:integration` 결과 대기로 ✅ 보류.
- branch `todo-28-build-freshness`(origin push됨): Todo 28 `adb5aa6` + `todo-25-shop-approach`(`08c333c`) merge `da10ae1` + 문서 커밋. **main 미merge.**
- worktree: `/home/taejin/ultima/.claude/worktrees/todo-28-build-freshness` (루트 checkout `f3-real-browser-qa`는 오래된 상태, 다른 세션의 미커밋 변경 있음 — 건드리지 않음).
- **실행 중**: 위 worktree에서 `npm run verify:integration`(분리 프로세스 `setsid nohup`, PLAYWRIGHT_PORT=4570, 로그 `/tmp/claude-1000/-home-taejin-ultima/918e074e-6ba3-4ac3-9375-fc1c0d98b92b/scratchpad/verify-integration.log`, 최종 결과는 `.omo/evidence/ultima-web/integration/verify-integration.log`). e2e 이전 게이트 12단계 전부 exit 0 확인, 전체 e2e 진행 중 — **결과 확인 필요**.
- 확인된 것: `korean-shop` 2/2 통과(모듈 재빌드만, 테스트 로직 무변경), 신규 유닛 35개 RED→GREEN, unit 443/443.

## 3. 변경한 파일 (Files changed)
- `scripts/lib/build-stamp.mjs`, `scripts/check-build-fresh.mjs`(신규) — 소스 해시 stamp와 신선도 검사.
- `scripts/build-modules.mjs`, `scripts/build-wasm.mjs` — stamp 기록, build:wasm은 오래된 모듈 복사 거부.
- `scripts/build-site.mjs`, `vite.config.ts` — vite 실행/dev 서버 전에 신선도 강제.
- `scripts/verify-integration.mjs`(신규), `package.json`(`check:build-fresh`, `verify:integration`).
- `tests/e2e/fixtures.ts`(신규) + e2e 22개 import 교체 — 실패 시 패널·포커스·스크린샷 자동 첨부.
- `tests/unit/build-stamp.test.ts`, `verify-integration.test.ts`, `e2e-failure-capture.test.ts`(신규).
- `tests/e2e/korean-shop.spec.ts` — 말 걸기 시도별 패널 출력 + 실패 스크린샷 기록.
- `AGENTS.md`, `docs/TESTING_POLICY.md` — 조사 규칙, merge 게이트에 `check:build-fresh`, 분모 32.
- `.omo/plans/ultima-web.md` = `docs/ULTIMA_WEB_PLAN.md`(cmp 0) — Todo 28 추가. `plan.md`, `handoff.md`, 이 파일.

## 4. 주요 결정과 근거 (Key decisions)
- shop 실패는 테스트가 아니라 **오래된 `Ultima-IV.mod`** 탓(09-27 빌드, Todo 25 `vendors.b` 변경은 09-29). 통합 게이트가 `build:modules`를 빠뜨렸고, 이전 조사는 wasm만 비교했다. 실패 지점 캡처 1회로 확정 → 추측 기반 수정(4방향 접근 등)은 하지 않음.
- `build-wasm.mjs`가 모듈을 `build/wasm-release/modules`로 복사해 그 복사본이 서빙되므로, 신선도 검사는 복사본까지 비교한다.
- 산출물이 하나도 없으면 통과(엔진 없는 로컬 dist도 audit 가능해야 함), 있으면 반드시 stamp 일치.

## 5. 다음 할 일 (Next steps)
- [ ] `verify:integration` 결과 확인. PASS → Todo 24·25·26·28 ✅(27/32), 계획서 두 벌 `[x]` + cmp, handoff.md 게이트 기록, `todo-28-build-freshness` → main merge + push.
- [ ] FAIL → 자동 첨부 `failure-panel.txt`/`failure-screen.png`(test-results/port-4570)부터 확인 후 진단.
- [ ] Todo 28 실패 시나리오 증거 `task-28/stale-rejected.log`(모듈 소스 수정 후 check:build-fresh·build:site exit 1).
- [ ] Todo 27 재개(worktree `.claude/worktrees/todo-27-status` `8023dce`) → `verify:integration`으로 검증.
- [ ] F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 기존 모든 빌드는 stamp가 없음 → 처음 한 번 `build:modules` + `build:wasm` 필수(check:build-fresh가 강제). wasm 전 `source .emsdk/emsdk_env.sh`.
- 새 worktree 준비: `node_modules`·`.emsdk` 심볼릭 링크, `build/host`·`build/wasm-deps` 복사(모두 gitignore, 커밋 금지).
- 긴 작업(>10분)은 Bash 도구 제한에 끊길 수 있어 `setsid nohup` 분리 프로세스로 실행.
- e2e 동시 실행 시 다른 `PLAYWRIGHT_PORT` 필수, NPC 접근 스펙끼리는 동시 실행 자제.
- `pkill -f "<패턴>"`은 자기 셸까지 죽임 → `"[p]attern"` 대괄호 트릭.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima/.claude/worktrees/todo-28-build-freshness
git status -sb && git log --oneline -4
tail -5 .omo/evidence/ultima-web/integration/verify-integration.log
# 재실행이 필요하면:
source .emsdk/emsdk_env.sh
export PATH="$HOME/.local/opt/node22/bin:$PATH" ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip PLAYWRIGHT_PORT=4570
npm run verify:integration
```
- 상세: `handoff.md` 마지막 절 "2026-09-30 22:00 — korean-shop 실패 원인 확정". 순서: `plan.md` "바로 다음 순서".
