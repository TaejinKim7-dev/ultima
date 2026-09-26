# HANDOFF
작성 시각: 2026-09-26 23:22 KST

## 1. 목표 (What we're building)
- Ultima IV xu4 엔진을 WASM/WebGL2/Web Audio 기반 GitHub Pages 정적 웹 앱으로 이식하고, 사용자가 직접 선택한 원본 `ultima4.zip`으로 한국어 UI/대화/NPC 키워드를 제공한다.
- 이번 세션에서 `plan.md`의 "바로 다음 순서" 첫 항목인 Todo 15(전체 한국어 번역 corpus)를 완료 처리했다.

## 2. 현재 상태 (Current state)
- 진행률은 **17/25 = 68.0%**다. Todo 15 acceptance와 로컬 게이트를 통과했고, 다음 단계는 Todo 17이다.
- YEW 마을 160개 draft 번역을 `locales/ko/tlk.json`에 적용했다. `npm run i18n:check`와 `npm run i18n:check -- --strict` 모두 exit 0, pending 0을 직접 확인했다.
- `npm run i18n:generate`를 실행해 `src/i18n/generated/strings.ts`, `native/i18n/u4_i18n_table.inc`, `native/i18n/ko-overlay.b`를 갱신했다. 출력: 4388 translated entries + 9 aliases.
- `tests/e2e/korean-progression.spec.ts`를 추가했고 실제 `ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip`로 2/2 passed, exit 0을 확인했다.

## 3. 변경한 파일 (Files changed)
- `locales/ko/tlk.json` — YEW 160개 pending 항목을 draft 번역으로 채우고 `status: "ready"`로 변경.
- `src/i18n/generated/strings.ts` — ready 번역 corpus를 브라우저 TS 런타임 테이블로 재생성.
- `native/i18n/u4_i18n_table.inc` — 같은 corpus를 native C lookup table로 재생성.
- `native/i18n/ko-overlay.b` — 같은 corpus를 Boron overlay fragment로 재생성.
- `scripts/i18n-generate.mjs` — Boron overlay 출력의 line-ending whitespace를 제거하도록 수정.
- `tests/unit/localization-boundaries.test.ts` — overlay trailing whitespace 회귀 테스트 추가(RED→GREEN 확인).
- `tests/e2e/korean-progression.spec.ts` — Todo 15 acceptance e2e 추가.
- `plan.md`, `.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`, `handoff.md` — Todo 15 완료 및 다음 단계 기록. canonical 두 계획서는 byte-identical.
- `HANDOFF.md` — 이 세션 재개용 요약을 현재 실제 상태로 갱신.

## 4. 주요 결정과 근거 (Key decisions)
- YEW 번역은 새로 번역하지 않고 이미 커밋된 `.omo/drafts/tlk-yew-translation-draft.json`의 160개 key-value만 적용했다. worker가 draft key 누락 0, non-YEW 변경 0, changedEntryCount 160을 독립 확인했다.
- `topic1`/`topic2` 계열 pass-through 항목은 draft에 없으므로 그대로 유지했다. 이 필드는 discourse 키워드 매칭 코드라 번역하면 게임 로직이 깨질 수 있다는 기존 결정 유지.
- strict 통과 뒤 `i18n:generate`를 별도로 실행했다. `src/i18n/generated/strings.ts`가 이전에는 빈 테이블이어서, JSON만 채워서는 웹 런타임이 corpus를 볼 수 없기 때문이다.
- Todo 14는 이전에 완료됐지만 canonical 계획서에는 `[ ]`로 남아 있던 stale mismatch였다. `plan.md`가 이미 Step 14를 완료로 계산하고 있었으므로, 이번에 canonical 두 계획서의 Todo 14도 `[x]`로 보정했다.

## 5. 다음 할 일 (Next steps)
- [ ] 변경사항을 커밋할지 사용자 지시를 확인한다. push/main merge는 사용자 승인 전 금지.
- [ ] 다음 단계 Todo 17(브라우저 통합 게임 진행 e2e)을 feature scope로 시작한다.
- [ ] Todo 17 전 `plan.md`의 "바로 다음 순서"를 다시 읽고, 기존 Todo 10/13/15/16 e2e helper를 어떻게 재사용할지 정한다.
- [ ] 사용자 승인 없이는 push 또는 main merge를 하지 않는다.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- 완료 처리 후 `.omo/plans/ultima-web.md`와 `docs/ULTIMA_WEB_PLAN.md`는 서로 byte-identical이다.
- 현재 worktree에는 기존 untracked `.claude/`, `.omo/boulder.json`, `.omo/lazycodex-executor-verify/`, `.omo/start-work/`가 있다. 임의로 삭제하지 말 것.
- 공식 소문자 `handoff.md`는 아직 이번 YEW 적용 결과를 반영하지 않았다. 단계 완료 또는 다음 인계 전 반드시 갱신.
- 원본 게임 데이터는 `/home/taejin/ultima4-original-data/ultima4.zip`에 있으며 repo에 커밋 금지.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb
npm run i18n:check
npm run i18n:check -- --strict
npm run i18n:generate
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npm run test:e2e -- tests/e2e/korean-progression.spec.ts --project=chromium
npm run test:unit
npm run verify:repo-sources
npm run typecheck
npm run build
git diff --check
```

증거: `.omo/evidence/ultima-web/task-15/verification-ledger.txt`.
