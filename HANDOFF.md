# HANDOFF
작성 시각: 2026-09-26 09:00 KST — Todo 16 main merge + push 완료, 전체 게이트·e2e 재검증 통과, Todo 12/13 브랜치 리뷰 대기

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계: 구현 1~21 + F1~F4).
- 사용자 지시: "물어보지 말고 권장 방향으로 진행해" + "병렬로 구현하자, 최대한" — 확인 없이 병렬 백그라운드 에이전트로 작업 중.

## 2. 현재 상태 (Current state)
- **main `f944ffc`** (Todo 16 merge), **origin push 완료·동기화**. 승인 기준 **13/25 = 52.0%** (Step 1~11, 16, 21 ✅).
- 실제 게임에서 확인: Step 7(WebGL2 렌더), 8(DOM 키 파이프라인), 9(브라우저 시작), 10(저장/재로드/export-import), 16(실제 Web Audio 음악/RFX 효과음), 21(링크·FS·렌더·입력).
- **이 세션에서 직접 재검증** (전부 exit 0): `test:unit` 18 files/173 tests · `verify:repo-sources` · `typecheck` · `cmp` 계획서 2벌 · 전체 e2e **18/18** (실제 `ultima4.zip`, save-reload 2개 장기 테스트 포함 3.1분).
- 단위 테스트 15→18 파일 증가는 이상 아님: Todo 16 브랜치 게이트(15 files)는 fork 시점 기준, merge 후 main에는 오디오 테스트 2개(`audio-bridge`, `audio-manifest`)가 더해져 18 files — `git diff df2b92b..HEAD -- tests/`로 확인.
- **리뷰 대기 2개** (worktree 격리, main 미merge):
  - Todo 12 (`todo-12-status-overlay`, 8커밋): `src/overlay/overlay-layout.ts`(317줄) + unit 290줄 + e2e 236줄 + 완료기록 커밋까지 있음. 단 worktree에 `tests/e2e/status-overlay.spec.ts` 미커밋 수정(69+/11-) 잔류 — 에이전트 작업 중이거나 마무리 잔재, **확인 필요**.
  - Todo 13 (`todo-13-korean-aliases`, 5커밋): `src/i18n/korean-aliases.ts`(264줄) + unit 228줄 + 실제 엔진 배선(`dbb88ef`)까지 있음. 단 worktree에 미추적 `playwright.agent13.config.ts` + `tests/e2e/korean-npc-alias.spec.ts` 잔류 — e2e 작성 중으로 보임, **확인 필요**.
  - 두 브랜치 모두 fork-point 기준 diff는 코드 실체 있음(12: 13 files +1338/-57, 13: 9 files +672/-12). 병합 전 필수: 에이전트 생존 여부 확인 → diff 직접 리뷰 → 게이트 직접 재실행 → 순차 merge (에이전트 보고 맹신 금지).

## 3. 변경한 파일
- 이 세션: `HANDOFF.md`(이 파일) 갱신, `handoff.md` "최종 갱신" 헤더 2026-09-26으로, `AGENTS.md` 진행률 산식 `n/24`→`n/25` 오타 수정. 코드 변경 없음(검증·push·문서만).

## 4. 주요 결정과 근거 (Key decisions)
- 밀린 main 3커밋(`541d6ca`, `303d2cb`, `f944ffc`) push — standing instruction(권장 방향으로 확인 없이 진행)에 따라 실행, origin 동기화 확인.
- 병렬 에이전트 + 조율 세션 동시 e2e 시 포트 4173(`--strictPort`) 충돌 가능 — 순차 실행으로 회피.
- merge 순서: 항상 fork-point(`git merge-base`) 기준 diff 리뷰. plan/handoff/HANDOFF는 브랜치마다 충돌 나므로 수동 병합(양쪽 서사 보존).

## 5. 다음 할 일 (Next steps)
- [ ] Todo 12/13 에이전트 상태 확인(살아있는지, 완료 알림 있는지) → 각 브랜치 diff 리뷰 + 게이트 재실행 → 문제없으면 순차 main merge + push → 체크박스 `[x]` + 진행률 14/25 → 15/25.
- [ ] Todo 14(12·13 merge 후) → 15(번역 4402건) → 17 → 18 → 19 완료(선행 15·18 대기, emsdk CI 설치 결정 필요) → 20 → F1~F4.
- [ ] GitHub Pages 설정(저장소 Settings → Pages Source = "GitHub Actions")은 사용자만 가능 — Todo 19 완료 전 확인 필요.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 백그라운드 에이전트 상태 확인 수단(ListAgents/SendMessage)이 이 세션에는 없음 — 에이전트를 띄운 환경에서 확인해야 함. 응답 없는 에이전트의 worktree 미커밋 잔재는 함부로 버리지 말 것.
- `qa:native-baseline` E2E 2회차는 사용자 승인제. F3 수동 QA(Chromium/Firefox/WebKit, AudioContext 제스처-전 잠김 절반, WebKit Ogg 지원) 미실시.
- Node 22 PATH(`$HOME/.local/opt/node22/bin`), emsdk는 수동 설치(`.emsdk/`) — CI에 emsdk 자동 설치 없음(Todo 19 범위 밖, 별도 결정 필요).
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo에 복사 금지.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
# Todo 12/13 브랜치 상태: git log --oneline todo-12-status-overlay / todo-13-korean-aliases
```
- 공식 인계: `handoff.md` 최신 절("Todo 16 완료 기록" 이후). 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
