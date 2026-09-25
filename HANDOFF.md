# HANDOFF
작성 시각: 2026-09-26 04:15 KST — Todo 21·10·11·19(골격) main merge 완료, Todo 12·13·16 백그라운드 병렬 진행 중

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 사용자 지시: "물어보지 말고 권장 방향으로 진행해" + "병렬로 구현하자, 최대한" — 이 두 지시에 따라 계속 확인 없이 병렬 백그라운드 에이전트로 작업 중.

## 2. 현재 상태 (Current state)
- **main `df2b92b`**, origin push 완료. 승인 기준 12/25 = 48.0% (Step 1~11, 21 ✅).
- 이번 세션에 main에 merge된 것: Todo 21(21.1~21.4, 실제 엔진), Todo 10(저장/재로드/export-import), Todo 11(HTML 대화 패널), Todo 19(Pages workflow 골격 — 체크박스는 `[ ]` 유지, 15·16·18 이후 완료 판정).
- **백그라운드에서 3개 진행 중**(worktree 격리, 각자 브랜치에 커밋만 하도록 지시):
  - Todo 12 (`todo-12-status-overlay`) — status/menu DOM 오버레이. 신규 착수.
  - Todo 13 (`todo-13-korean-aliases`) — 한국어 NPC alias. 신규 착수.
  - Todo 16 (`todo-16-web-audio`) — Web Audio. **1차 시도가 API rate limit로 커밋 0개 상태에서 중단** → `SendMessage`로 재개 지시(점진적 커밋 강조).
- Todo 19 에이전트도 rate limit로 중단됐었지만 그때는 이미 커밋 5개 다 끝내고 clean 상태였어서 그대로 merge함(교훈: 이후 에이전트들에게 "작게 자주 커밋"을 명시적으로 지시함).

## 3. 변경한 파일
- 이 세션에서 직접 작성: `tests/e2e/save-reload.spec.ts`(Todo 10), export/import 배선(`src/engine/startup.ts`, `src/shell.ts`, `src/main.ts`).
- Todo 11/19/12/13/16은 전부 백그라운드 에이전트가 각자 worktree에서 작성 — merge된 것(11, 19)은 diff를 직접 읽고 게이트를 직접 재실행해서 검증함(에이전트 보고를 그대로 믿지 않음).

## 4. 주요 결정과 근거 (Key decisions)
- 병렬 에이전트와 조율 세션이 동시에 `playwright test`/`vite preview`를 돌리면 포트 4173 충돌이 실제로 반복해서 났다(`--strictPort`) — 코드 수정 없이 재시도로 해결. 여러 e2e를 병렬로 돌릴 계획이면 이 충돌을 예상할 것.
- merge 순서: 항상 diff를 fork point(`git merge-base`) 기준으로 리뷰(단순 `main..HEAD`는 다른 에이전트가 먼저 merge한 파일들 때문에 오해를 부름 — Todo 19 리뷰 때 실제로 이 함정에 빠졌다가 fork point 기준으로 다시 봐서 해결).
- plan.md/handoff.md/HANDOFF.md는 병렬 브랜치마다 거의 항상 충돌한다(다들 "완료 기록"과 "바로 다음 순서"를 건드림) — 항상 양쪽 서사를 다 보존하는 방향으로 수동 병합(한쪽만 취하지 않음, 단 HANDOFF.md는 세션 재개용이라 그냥 우리 쪽으로 덮어써도 무방).

## 5. 다음 할 일 (Next steps)
- [ ] Todo 12/13/16 완료 알림 대기 → 각각 diff 리뷰(fork point 기준) + 게이트 직접 재실행 → 문제없으면 main merge + push.
- [ ] Todo 14(12·13 merge 후) → 15(번역) → 17 → 18 → 19 완료 → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 백그라운드 에이전트가 API rate limit로 죽으면 커밋 안 된 작업은 그대로 worktree에 uncommitted로 남는다 — `git status`로 확인 후 `SendMessage`로 같은 agentId에 재개 지시(같은 세션 컨텍스트 유지됨). 완전히 새 Agent 호출로 다시 시작하면 그 컨텍스트를 잃는다.
- worktree 목록: `.claude/worktrees/agent-<id>/` 아래, `ListAgents`로 현재 살아있는 에이전트 확인 가능.
- Node 22 PATH, `.emsdk/` 경로 등은 이전 HANDOFF 항목과 동일.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
# 백그라운드 에이전트 상태: ListAgents 도구, 또는 완료/실패 알림 대기
```
- 공식 인계: `handoff.md`의 최신 절들("Todo 21 완료 기록", "Todo 19 골격 작업", "병렬 에이전트 rate limit 중단"). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
