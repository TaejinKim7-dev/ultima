# HANDOFF
작성 시각: 2026-09-25 23:35 KST — Todo 21 main merge + Todo 10 저장/재로드 증명, 병렬 에이전트 3개 실행 중

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- 사용자가 "물어보지 말고 권장 방향으로 진행해"라고 명시적으로 지시함 — 이제부터 merge/push 포함 확인 없이 진행(개인 메모리에 기록됨).

## 2. 현재 상태 (Current state)
- **main `ce88bc1`**: Todo 21(21.1~21.4, 실제 엔진 링크·부팅·렌더·입력) merge + push 완료.
- **Todo 10 저장/재로드 증명 완료**(코드 변경 없음, 신규 `tests/e2e/save-reload.spec.ts`만 추가, 아직 커밋 안 함 — 이 세션에서 커밋 예정): 실제 캐릭터 생성 → 실제 `party.sav` write → IDBFS sync(`#save-status`="저장 완료") → 페이지 리로드 → Journey Onward → 실제 게임 월드 진입까지 스크린샷으로 확인. **단, export/import는 여전히 플레이스홀더** — Step 10은 🟡 유지.
- **백그라운드에서 에이전트 3개가 병렬로 작업 중**(worktree 격리, 아직 완료 안 됨 — 완료되면 알림 옴):
  - Todo 19: GitHub Pages workflow 골격
  - Todo 16: Web Audio (21.1의 무음 sound.h 스텁 교체)
  - Todo 11: HTML 대화 패널
  - 셋 다 자기 브랜치(`todo-19-pages-workflow`, `todo-16-web-audio`, `todo-11-dialogue-panel`)에 커밋만 하고 main merge/push는 안 하도록 지시함 — 완료되면 **이 세션(조율자)이 검토 후 순차 merge**해야 함.
- 진행률: 승인 기준 10/25 = 40.0% (Step 1~9, 21 ✅, Step 10 🟡).

## 3. 변경한 파일 (아직 커밋 안 됨, main worktree)
- `tests/e2e/save-reload.spec.ts` (신규) — Todo 10 저장/재로드 e2e. 커밋 대기 중.
- `plan.md`, `handoff.md`, 이 파일 — Todo 21 merge + Todo 10 기록 반영. 커밋 대기 중.

## 4. 주요 결정과 근거 (Key decisions)
- 실제 캐릭터 생성 흐름(`vendor/xu4/src/intro.cpp`)은 타이밍에 매우 민감하다 — 카드 애니메이션 중 도착한 키는 씹힌다. 정확한 타이밍을 맞추려 하지 말고 "넉넉한 간격 + 충분히 큰 라운드 캡(20) + 매번 완료 여부 폴링"으로 접근해서 실측으로 해결(7라운드가 이론상 필요하지만 실제로는 15~16회 걸림).
- 캔버스 "비어있지 않음" 검증은 항상 **screenshot 바이트 크기를 같은 실행 안의 "완전 검은 캔버스" 기준선과 비교**하는 방식으로 통일(`boot-sequence.spec.ts`와 `save-reload.spec.ts` 둘 다) — 서로 다른 실제 화면끼리 크기를 비교하면 안 됨(타일 화면이 로고 화면보다 더 작게 압축될 수 있음, 실측으로 확인).
- IDBFS 실패는 가짜 FS가 아니라 진짜 `window.indexedDB`를 지워서 테스트 — 더 빠르고 더 진짜에 가까움.
- Export/import 완성을 미루고 병렬 에이전트 3개를 먼저 띄운 이유: 사용자가 "병렬로 구현하자, 최대한"이라고 명시적으로 요청했고, 다른 Todo들(19/16/11)은 이미 선행조건이 충족돼 병렬 착수가 안전하기 때문.

## 5. 다음 할 일 (Next steps)
- [ ] **이 세션의 미커밋 변경사항 커밋** (`tests/e2e/save-reload.spec.ts` + 문서) — 가장 먼저.
- [ ] 백그라운드 에이전트 3개(Todo 19/16/11) 완료 알림 대기 → 각각 리뷰(diff 확인, 게이트 재실행) → 문제없으면 main에 순차 merge + push.
- [ ] Todo 10 마무리: `src/shell.ts`의 export/import 버튼을 실제 `persistence.ts` 함수에 연결.
- [ ] 12~13(한국어 UI, 11 완료 후) → 14 → 15(번역) → 17 → 18 → 19 완료 → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **병렬 에이전트가 각자 다른 worktree에서 `npm run test:e2e`/`playwright test`를 돌리면 전부 포트 4173을 쓰려고 해서 충돌한다**(`--strictPort`라 실패함, 실제로 이번 세션에서 한 번 겪음). 여러 e2e를 동시에 돌려야 하면 포트 충돌을 감안하고 재시도할 것.
- 백그라운드 에이전트들이 완료되면 각자 `.claude/worktrees/agent-<id>/` 아래에서 작업했을 것 — 병합 전에 반드시 실제 diff를 읽고 게이트를 직접 재실행할 것(에이전트 보고를 그대로 믿지 말 것, 이 프로젝트의 반복되는 교훈: "링크만 되고 실행은 안 해봄" 패턴이 여러 번 나왔다).
- Node 22 PATH, `.emsdk/` 경로 등은 이전 HANDOFF 항목과 동일.
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb   # tests/e2e/save-reload.spec.ts 등이 아직 안 커밋됐을 수 있음
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
# 백그라운드 에이전트 상태 확인: ListAgents 도구 또는 완료 알림 대기
```
- 공식 인계: `handoff.md` "Todo 21 main merge + Todo 10 저장/재로드 e2e" 섹션. 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
