# HANDOFF
작성 시각: 2026-09-26 20:00 KST — Todo 14까지 완료 15/25 = 60.0%, 사용자 지시로 여기서 멈춤

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계).
- 사용자 지시: "현재 step까지만 구현 후 handoff/plan 업데이트 후 멈춰" — Todo 14 merge·게이트·docs·push까지 하고 중단.

## 2. 현재 상태 (Current state)
- **승인 기준 15/25 = 60.0%** (Step 1~12, 14, 16, 21 ✅). 실제 게임 확인: 7, 8, 9, 10, 16, 21 (11·12·14는 synthetic, ⬜).
- main: Todo 14 merge(`c89a0f3`)까지 완료. origin push 예정(docs 커밋과 함께).
- **Todo 13은 `[ ]` 유지**: 코드는 병합됨(`80ce1ac`), e2e happy-path가 wasm settings-write abort에 구조적 차단. failure-path는 behavioral 재설계로 GREEN.
- **알려진 블로커 (fix-7 조사 완료)**: wasm에서 Configure 저장('u')·빈이름 제출이 `Aborted(unreachable)`. NATIVE에서는 정상 → WASM-ONLY, 엔진 무죄. 다음 실험: `--debug` ASSERTIONS=2 빌드로 named trap+스택.
- 병합됨·`[ ]` 유지: 19-emsdk(CI emsdk 핀) · 18-audit(audit:dist 8종+글루 allowlist). 15 인벤토리(4-chunk 분할안) · 17 QA 갭분석 recon 완료.
- 최종 게이트 전부 exit 0: unit 21/258 · verify · typecheck · build · diff-check · cmp · i18n:check · CTest 4/4 · e2e 25/25.

## 3. 변경한 파일 (이번 웨이브)
- main merge: Todo 12(overlay) · Todo 13 코드 · 19-emsdk · 18-audit · gluefix · Todo 14(i18n 런타임+`window.ultimaI18n` 배선 1건 직접 수정).
- 미병합 브랜치: `todo-13-e2e`(spec 복구+failure-path GREEN, happy RED), `todo-99-settings-abort`(조사만, 수정 없음), `todo-19-emsdk-ci`·`todo-18-audit-ext`·`todo-18-audit-gluefix`·`todo-14-localization-runtime`(병합됨, 보관).
- worktree: 에이전트 worktree(`agent-*`) 미커밋 잔재 보존, 손대지 않음. 자가 `verify-12/13`은 정리 예정.

## 4. 주요 결정과 근거 (Key decisions)
- 병합 순서 12→13 (oracle 리뷰, shell.ts 1 hunk 수동 해소).
- Todo 13 e2e 미커밋분은 회수하되 중단 세션 산출물로 취급, 출처 명시.
- abort 수정 없이 멈춤 (사용자 지시) — 수정은 다음 세션의 첫 작업으로 남김.
- 병렬 레인은 문서 파일 금지 (충돌 방지).

## 5. 다음 할 일 (Next steps, 재개 시 순서)
- [ ] wasm settings-write abort 수정 (fix-7 가설순: stdio→Asyncify→GLFW, `--debug` named trap부터).
- [ ] Todo 13 e2e happy GREEN → `[x]` → 16/25.
- [ ] Todo 15 (4-chunk: A tlk 2레인 / B module+glossary / C ui+binary / D strict sweep).
- [ ] Todo 17 (갭 분석 있음, 치트 없이 public UI 경로만) → 18 → 19 완료 → 20 → F1~F4.
- [ ] Pages Source = "GitHub Actions" 설정은 사용자만 가능.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- e2e는 `--workers=1`/`2`만 (headless segfault). save-reload는 분리 실행 (5분 초과 가능).
- `build/wasm-release`는 git-ignored, 새 worktree에 복사 필요 (원본 데이터 `find` 확인 후).
- Node 22 PATH 매 호출 export. 원본 zip repo 복사 금지.
- F3 수동 QA·`qa:native-baseline` 2회차(승인제) 미실시.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git status -sb && git log --oneline -5
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium --workers=2
```
- 공식 인계: `handoff.md` 끝 4개 절. 진행률/순서: `plan.md`. 운영 규칙: `AGENTS.md`.
