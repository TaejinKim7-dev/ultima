# HANDOFF
작성 시각: 2026-09-27 16:38 KST

## 1. 목표 (What we're building)
- xu4(Ultima IV)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식 + 한국어화. 진행 기준 `plan.md`(25단계).
- 이번 세션: Todo 17 merge/push 완료 → Todo 18(실패/보안/회귀 경계) 진행 중.

## 2. 현재 상태 (Current state)
- 진행률 **18/25 = 72%** (Todo 18은 아직 `[ ]`).
- branch `todo-18-failure-boundaries` (origin에 push됨, 최신 `ae788a1`, **main 미merge**).
- 통과 확인(이 세션 직접 실행): unit 265/265 · typecheck · verify:repo-sources · build · audit:dist · diff-check (전부 exit 0), e2e `gameplay-progression` 2/2 · `failure-boundaries` 3/3 · `memory-smoke` 1/1.
- **확인 필요**: `korean-npc-alias.spec.ts` — helper 수정 후 재실행이 세션 중단으로 결과 없음.

## 3. 변경한 파일 (Files changed)
- `scripts/audit-dist.mjs`, `tests/unit/audit-dist.test.ts` — `window.ultimaI18n` + vendor/xu4 Credits URL 4개 allowlist (`cf1af77`).
- `src/engine/zip.ts`, `src/engine/startup.ts` + 유닛 테스트 — 200MiB 초과 ZIP 거부 (`23cbddf`).
- `src/engine/persistence.ts`, `tests/unit/persistence.test.ts` — IDBFS 동기 throw 시 "저장 중..." 멈춤 버그 수정 (`ae788a1`).
- `tests/e2e/failure-boundaries.spec.ts`, `tests/e2e/memory-smoke.spec.ts`(신규), `package.json`(`test:memory-smoke`).
- `playwright.config.ts` — `PLAYWRIGHT_PORT` + 포트별 `outputDir` (병렬 e2e용).
- `tests/e2e/gameplay-progression.spec.ts`, `tests/e2e/korean-npc-alias.spec.ts` — 한국어 입력창 포커스 버그 수정(`blur()`), 저장 검사 강화.
- `plan.md`, `handoff.md`, `HANDOFF.md`.

## 4. 주요 결정과 근거 (Key decisions)
- Todo 17 스펙의 던전·신단·중간저장 구간이 **거짓 통과**였음: 한국어 입력창에 포커스가 남아 `src/shell.ts` 가드가 이후 키를 모두 가로챔. 임시 진단 로그(`activeElement`)로 확정 후 로그 제거. 제품 동작은 안 바꾸고 테스트에서 `blur()`(사용자가 입력창 밖을 클릭하는 것과 동일).
- "stale bridge requests"는 테스트를 만들지 않음: `web_bridge.cpp` epoch ABI를 실제 엔진이 쓰지 않아(죽은 코드) 실제 엔진 기준 증명 불가 — 항상 통과하는 가짜 테스트 대신 gap으로 기록.

## 5. 다음 할 일 (Next steps)
- [ ] `korean-npc-alias.spec.ts` 재실행 (명령은 7절).
- [ ] 통과 시 main merge + push.
- [ ] Todo 18 완료 판단: stale-request gap 수용 여부, 메모리 스모크 1분 기본값 인정 여부 결정 → 계획서 두 벌 `[x]`(cmp) → 19/25.
- [ ] 이후 Todo 19 → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- e2e를 동시에 돌릴 땐 **반드시 다른 `PLAYWRIGHT_PORT`**. NPC 접근 스윕 같은 타이밍 민감 스펙끼리는 동시 실행 자제.
- UX 이슈(미수정): 실제 사용자도 한글 입력창 사용 후 화살표/명령키가 무시됨.
- 신단 샘플: 실제 프롬프트는 동작하지만 새 캐릭터라 명상 쿨타임으로 거절됨(정상 게임 규칙).
- `memory-smoke`는 JS 힙만 측정(wasm 메모리 미포함).
- `pkill -f "<패턴>"`은 자기 셸까지 죽여 exit 144가 남 — `"[p]laywright ..."`처럼 대괄호 트릭 사용.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-18-failure-boundaries && git status -sb
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
PLAYWRIGHT_PORT=4188 npx playwright test tests/e2e/korean-npc-alias.spec.ts --project=chromium --workers=1
```
- 상세 기록: `handoff.md` 마지막 절 "Todo 18 진행 중 — 세션 중단 기록". 진행 순서: `plan.md` "바로 다음 순서".
