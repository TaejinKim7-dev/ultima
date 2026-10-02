# HANDOFF
작성 시각: 2026-10-02 KST (4차 갱신 — F1~F4 전부 실행 완료, 사용자 승인 대기) · 세션 재개용 요약

## 1. 목표
Ultima IV(xu4)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 실제 플레이 화면을 한국어로 만든다. 진행 기준 `plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`.
순서: 원본 계획서 100% → F1~F4 완주 → 그 다음 main push.

## 2. 현재 상태 — **F1~F4 전부 실행 완료, 승인/결정 대기**
- 작업 트리 `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90`, main tip **`b870b85`** (2026-10-02, `Merge todo-f3-final: F1-F4 verification records + WebKit aura-relative overlay fix`). **push하지 않았다.** main이 origin보다 2커밋 앞섬.
- 진행률 **28/32 = 87.5%** (`[x]` 28, `[ ]` 4 = F1~F4). 계획서 체크박스는 **사용자 명시 승인 전까지 건드리지 않는다**(plan.md "바로 다음 순서" 6번 규칙).
- **F1 ✅**: `npm run verify:release` 18단계 전부 exit 0 (chromium e2e 46/46은 중단된 run 재개로 완주). 감사서 `final/F1-plan-compliance.md`, 로그 `final/F1-verify-release.log`.
- **F2 ✅**: 기존 승인(blocker 0) + 네이티브 게이트 green (2026-10-01). `final/F2-code-quality.md`.
- **F3 ✅**: 실제 `ultima4.zip`으로 Chromium 46/46 · Firefox 46/46 · WebKit 46/46 (WebKit 1건 서브픽셀 허용치 → oracle 리뷰 후 **aura-relative 단언**으로 수정, RED→GREEN 확인). 증거 `final/F3-real-browser-qa/`.
- **F4 ✅**: `final/F4-scope-fidelity.md` 신규 — **APPROVE_WITH_DEVIATIONS**, 분모 산술 계획서에서 직접 유도(32/28/4), cmp·audit:dist·verify:workflow exit 0.
- **사용자 결정 필요**: ① Todo 29~33 편입 + 분모(32 vs 35/37), ② F1~F4 승인 → 체크박스 `[x]` + 진행률 갱신, ③ `git push origin main`.

## 3. ✅ F1~F4 실행 요약 (2026-10-02, 병렬 4레인)
- F1: f1 worktree(`f1-verify-release`, detached dd0c933)에서 verify:release 실행. 1~17단계 exit 0, e2e 단계 직전 태스크 중단 → **chromium e2e 46/46(35.5m) 단독 재실행으로 완주**, `F1-plan-compliance.md` + dist SHA-256 `41a2e0e5…0743d` 기록. F1 증거는 main worktree `final/`로 복사해 co-locate.
- F3: main worktree에서 Firefox 46/46(36.4m)·WebKit 45→46/46(36.3m). WebKit 실패 1건 = `korean-status-overlay.spec.ts` 0.069px 초과(`72/200` vs 측정 0.36034) — oracle 판정 "제품 결함 아님, WebKit 라인박스 서브픽셀 축적" + **aura-relative 단언 권고**(`overlayBottom ≤ auraTop + 0.5`, line 160과 동일 규약). fix-3이 반영 후 webkit/chromium/firefox 단독 재실행 각각 green, fix-4가 전체 WebKit 재실행 46/46 확정.
- F4: main worktree에서 감사서 작성. verdict APPROVE_WITH_DEVIATIONS (blocking 0 / non-blocking 3 + 확인 필요 2). 주요 확인: `[x]` 28 / `[ ]` 4 / 총 32, `cmp` exit 0, `audit:dist --require-engine` exit 0(9 files), `verify:workflow` exit 0. 승인 필요: ① Todo 29~33 편입, ② 남은 영어 표면 릴리스 범위, ③ F3 브라우저 3종 완료.

## 4. 변경한 파일 (main, 커밋 `b870b85` merge / `5c80d0b` 구현)
- `tests/e2e/korean-status-overlay.spec.ts` — reagents 오버레이 하한 단언을 aura-relative로 교체(`overlayBottom ≤ auraTop + 0.5`, +0.5px 엡실론은 line 160과 동일 규약). WebKit 서브픽셀(72.069px) 허용. 제품 동작 단언 무변경.
- `plan.md` — "바로 다음 순서" 2026-10-02 갱신: F1~F4 실행 완료 기록, 승인 대기 항목 명시.
- `handoff.md` — F1~F4 실행 기록 + merge 게이트 exit 코드 append.

## 5. 주요 결정과 근거
- **F1/F3/F4를 병렬 레인으로 분리**: F1(verify:release, chromium e2e 포함)과 F3(firefox/webkit e2e)는 같은 머신에서 동시에 돌리면 타이밍 민감 스펙이 흔들린다 → F1은 **별도 worktree**에서, F3는 main worktree에서 순차 실행. F4는 read-only라 어느 래이든 병렬 가능.
- **WebKit 허용치 수정은 "테스트 약화"가 아님**(oracle 판정): 제품 동작 단언(한국어 렌더, 영어 누출 0, opaque, aura 미침범)은 전부 통과하고, 실패한 것은 엔진별 서브픽셀 라운딩을 못 받아주던 float 상한뿐. RED 로그는 유지하고 증거에 남김.
- F1의 중단된 run은 **재개**로 처리: 1~17단계 exit 0이 로그에 남아 있고 e2e만 재실행. "게이트 실패를 숨기지 않는다" 규칙에 따라 중단 사유(인프라)를 handoff.md에 명시.

## 6. 막힌 부분 / 주의사항
- **F1~F4 체크박스는 사용자 승인 전 미변경** — F1~F4 결과 보고 + 사용자 명시 승인 후 `[x]` 전환, 그다음 push.
- **Todo 29~33은 코드가 main에 있고 계획서에 없다** — 분모를 32로 둘지 35/37로 늘릴지 사용자 결정 필요. 결정 없이는 100% 도달 불가.
- **main push 대기**: origin보다 2커밋 앞섬(5c80d0b, b870b85). 사용자 승인 후 `git push origin main`.
- 루트 `/home/taejin/ultima`는 **stale**(f3-real-browser-qa `6462af3`, dirty) — 쓰지 말 것. 모든 main 작업은 이 worktree에서.
- e2e 병렬 실행 시 다른 `PLAYWRIGHT_PORT` 필수. 타이밍 민감 스펙끼리는 동시 실행 자제.
- Pages Source="GitHub Actions" 설정은 사용자만 가능.

## 7. 재개 방법
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90
git status -sb && git log --oneline -3
export PATH="$HOME/.local/opt/node22/bin:$PATH"
export ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip
# 1. 사용자에게 F1~F4 결과 보고 → 승인 받으면 체크박스 [x] + 진행률 갱신
# 2. push (승인 후): git push origin main
# 3. Todo 29~33 편입 여부 결정 (분모 32 vs 35/37)
```
상세: `handoff.md` 마지막 절(2026-10-02 F1~F4), `plan.md` "바로 다음 순서"(2026-10-02). 증거: `.omo/evidence/ultima-web/final/` 아래 F1~F4 파일 전부.