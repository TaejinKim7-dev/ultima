# HANDOFF
작성 시각: 2026-10-02 KST (5차 갱신 — 37/37 = 100% 확정, push 완료) · 세션 재개용 요약

## 1. 목표
Ultima IV(xu4)를 원본 `ultima4.zip`을 사용자가 직접 선택하는 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식하고 실제 플레이 화면을 한국어로 만든다. 진행 기준 `plan.md`, 세부 정의 원본은 `.omo/plans/ultima-web.md`.

## 2. 현재 상태 — **계획 100% 완료, push 완료**
- 작업 트리 `/home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90`, main tip **`fd31e9b`**, origin과 동기 (push 완료).
- **진행률 37/37 = 100%** (2026-10-02 사용자 결정: Todo 29~33 편입 + 분모 37 확정, F1~F4 전부 승인). 계획서 체크박스 37/37 `[x]`, `[ ]` 0.
- main 커밋: `5c80d0b`(F3 fix+기록) → `b870b85`(merge) → `dfb9995`(HANDOFF) → `9bb1b6d`(계획서 37/37) → `794ca6d`(handoff 4차) → `fd31e9b`(handoff 최종).

## 3. 이번 세션(2026-10-02) 실행 요약
- **F1**: `npm run verify:release` 18단계 전부 exit 0 (chromium e2e 46/46은 중단된 run의 18단계만 재실행으로 완주). `final/F1-plan-compliance.md` + `F1-verify-release.log`.
- **F2**: 기존 승인(blocker 0) + 네이티브 게이트 green.
- **F3**: 실제 `ultima4.zip`으로 Chromium 46/46 · Firefox 46/46 · WebKit 46/46. WebKit 1건(0.069px 서브픽셀) → oracle 리뷰 후 `korean-status-overlay.spec.ts`를 **aura-relative 단언**(`overlayBottom ≤ auraTop + 0.5`)으로 수정, RED→GREEN. 증거 `final/F3-real-browser-qa/`.
- **F4**: `final/F4-scope-fidelity.md` 신규 — APPROVE_WITH_DEVIATIONS, 분모는 계획서에서 직접 유도.
- **사용자 결정 3건 접수**: Todo 29~33 편입(분모 37) · F1~F4 승인 · push 승인.
- **push 완료**: `dd0c933..fd31e9b main -> main` (5차 갱신으로 `794ca6d → fd31e9b`까지 push).

## 4. 변경한 파일 (main)
- `tests/e2e/korean-status-overlay.spec.ts` — aura-relative 오버레이 하한 단언 (WebKit 서브픽셀 허용).
- `.omo/plans/ultima-web.md` + `docs/ULTIMA_WEB_PLAN.md` — Todo 29~33 추가, F1~F4 `[x]` (byte-identical, cmp exit 0).
- `plan.md` — 37단계/37✅, 단계 목록, "바로 다음 순서" 완료 상태.
- `handoff.md` — F1~F4 실행 기록 + 사용자 결정 + push 기록.
- `HANDOFF.md` — 본 파일.

## 5. 주요 결정과 근거
- Todo 29~33은 **코드가 이미 main에 있고 검증도 통과**한 상태 → 편입은 문서화 작업이었음. 분모 37 확정.
- WebKit 허용치 수정은 "테스트 약화"가 아닌 엔진 서브픽셀 라운딩 수용(oracle 판정, RED 로그 유지).
- F1 18단계는 최초 실행이 e2e 직전에 중단 → 1~17단계 로그 + 18단계 재실행으로 완주 증명.

## 6. 남은 것 / 주의사항
- **GitHub Pages 실제 배포 확인 필요**: push로 CI가 트리거됨 — Actions run이 Pages에 artifact를 배포하는지 확인 필요. Settings > Pages > Source="GitHub Actions"는 **사용자만** 설정 가능(미설정이면 deploy job 실패).
- 제품 품질 항목(계획 진행률 아님): F4의 non-blocking deviations — 남은 영어 표면(상점/캐슬 등 일부)은 사용자 승인된 릴리스 범위.
- 루트 `/home/taejin/ultima`는 **stale**(`f3-real-browser-qa`) — 쓰지 말 것, 필요하면 최신 main으로 정리(사용자 승인 필요).
- e2e 병렬 시 다른 `PLAYWRIGHT_PORT` 필수, 타이밍 민감 스펙끼리 동시 실행 자제.

## 7. 재개 방법
```bash
cd /home/taejin/ultima/.claude/worktrees/agent-ad52af6bd293aab90
git status -sb && git log --oneline -3        # main fd31e9b, origin 동기
# CI Pages 배포 확인:
gh run list --limit 3                          # push 트리거 run
# 사용자: Settings > Pages > Source="GitHub Actions" (미설정 시)
```
상세: `handoff.md` 마지막 절(2026-10-02), `plan.md` "바로 다음 순서"(2026-10-02). 증거: `.omo/evidence/ultima-web/final/` 아래 F1~F4.