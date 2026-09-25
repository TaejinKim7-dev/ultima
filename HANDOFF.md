# HANDOFF
작성 시각: 2026-09-26 09:30 KST — Todo 12 main merge 진행 중 + 병렬 웨이브(13·19-emsdk·18-audit·15·17) 투입

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계: 구현 1~21 + F1~F4).
- 사용자 지시: "물어보지 말고 권장 방향으로 진행해" + "병렬로 구현하자, 최대한" + "작은 단계라도 handoff/plan에 기록하고 목표까지 쉬지 않고" — 확인 없이 계속 진행.

## 2. 현재 상태 (Current state)
- **main: Todo 12 병합 중** (`git merge --no-ff todo-12-status-overlay`, 문서 3건 수동 병합 중). 병합 전 main `d6a7cc5`, origin 동기화. 병합 후 승인 기준 **14/25 = 56.0%** (Step 1~12, 16, 21 ✅) 예정.
- 실제 게임에서 확인: Step 7, 8, 9, 10, 16, 21. Step 12는 ⬜ (Todo 11과 동일 사유: 실제 엔진이 status/menu bridge 이벤트를 안 보냄, synthetic dispatch로 검증).
- **검증 완료** (분리 worktree, 전부 exit 0): Todo 12 브랜치 unit `overlay-layout` 34/34 + `bridge-contract` 14/14 + typecheck + verify:repo-sources. Todo 13 브랜치 unit `korean-aliases` 21/21 + `bridge-contract` 13/13 + typecheck + verify.
- **병렬 웨이브 투입됨** (브랜치·레인 worktree 준비, main 미merge):
  - `todo-19-emsdk-ci` — pages.yml에 `emscripten-core/setup-emsdk@v16` 핀(4.0.23) + verifier/테스트 (리서치 완료).
  - `todo-18-audit-ext` — audit:dist 8종 검사 확장(XSS sink·test-hook·cheat 토큰·egress·console·storage·secret·sourcemap) + 테스트 (정찰 완료). 체크박스는 17 완료까지 `[ ]` 유지.
  - Todo 15 번역 인벤토리 정찰 / Todo 17 QA 갭 분석 (read-only, 결과 대기 중이었음 — 미복귀 시 재확인).
- **Todo 13 상태**: 브랜치 5커밋(unit+실제 엔진 배선) 완료, e2e spec(379줄)은 에이전트 worktree에 미커밋으로 잔류. 에이전트 파일 mtime 4시간 정지 → 중단으로 판단, 복구 예정: 13 코드 먼저 병합(체크박스 `[ ]` 유지) → `todo-13-e2e` 단기 브랜치에서 spec 복구·GREEN → 병합 후 `[x]`.
- 에이전트 worktree 미커밋 잔재는 절대 버리지 말 것 (`.claude/worktrees/agent-a6c1b05c1afa82520`의 spec 수정 69+/11-, `agent-ae063aa7954ffec81`의 e2e spec 379줄+config).

## 3. 변경한 파일
- 병합 중: `src/overlay/overlay-layout.ts`(신규), `src/bridge/types.ts`, `src/shell.ts`, `src/shell.css`, `index.html`, `tests/unit/overlay-layout.test.ts`(신규), `tests/e2e/status-overlay.spec.ts`(신규), `tests/unit/bridge-contract.test.ts`, `plan.md`·`handoff.md`·`HANDOFF.md`(수동 병합), `.omo/plans/ultima-web.md`+`docs/ULTIMA_WEB_PLAN.md`(Todo 12 `[x]`, 자동 병합됨).
- 증거 복사 예정: 에이전트 worktree `.omo/evidence/ultima-web/task-12/*.png` → main 동일 경로 (git-ignored).

## 4. 주요 결정과 근거 (Key decisions)
- 병합 순서 12→13 (oracle 리뷰): shell.ts 텍스트 충돌은 12 먼저 넣고 13에서 해소. types/css/index.html/test는 disjoint, 자동 병합 예상.
- Todo 13 e2e 미커밋분은 회수(recover)하되 출처 명시 — 중단 세션의 프로젝트 산출물이며 살아있는 에이전트 확인 수단이 없고 mtime 4시간 정지.
- 병렬 구현 레인은 `plan.md/handoff.md/HANDOFF.md`/계획서 2벌을 건드리지 않는다 — 문서 충돌 방지, 병합 시 조율자가 일괄 기록.
- 병렬 e2e 금지 (포트 4173 `--strictPort` 충돌 + headless 리소스): 레인은 unit+typecheck만, e2e는 조율자가 순차 실행.

## 5. 다음 할 일 (Next steps)
- [ ] Todo 12: 문서 충돌 해소 완료 → 증거 복사 → 전체 게이트 + e2e(실제 zip) → merge 커밋 → docs 커밋 → push (진행 중).
- [ ] Todo 13 코드 병합(`[ ]` 유지) → e2e 복구 레인 → GREEN → 병합 → `[x]` → 15/25.
- [ ] 19-emsdk / 18-audit 레인 결과 취합 → 순차 merge (둘 다 `[ ]` 유지).
- [ ] Todo 14 구현 레인 (12·13 merge 후) → 15 → 17 → 18 → 19 완료 → 20 → F1~F4.
- [ ] GitHub Pages 설정(Pages Source = "GitHub Actions")은 사용자만 가능 — Todo 19 완료 전 확인 필요.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 이 sandbox(WSL2)에서 e2e를 `--workers=3` 이상으로 돌리면 `headless_shell` 간헐적 segfault → 공유 vite preview가 죽고 이후 테스트 전부 `ERR_CONNECTION_REFUSED`. `--workers=1`/`2` 사용.
- `save-reload.spec.ts`는 5분 초과 가능 — 전체 스위트와 분리해 개별 실행.
- `build/wasm-release`는 git-ignored라 새 worktree엔 없음 — main 것에서 원본 데이터 없음을 `find`로 확인 후 복사.
- Node 22 PATH 매 호출마다 export (`$HOME/.local/opt/node22/bin`).
- `qa:native-baseline` E2E 2회차는 사용자 승인제. F3 수동 QA 미실시.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo 복사 금지.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5   # 병합 중이면 UU 파일 확인
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium --workers=2
# 레인 상태: git worktree list; 각 레인 브랜치 로그 확인
```
- 공식 인계: `handoff.md` 최신 절. 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
