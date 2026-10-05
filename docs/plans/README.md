# 구현 계획 색인

이 디렉터리는 사용자 승인된 구현 계획 문서를 보관한다. 각 계획은 `.omo/plans/ultima-web.md`의
같은 번호 Todo를 상세화한 것이다. 계획을 새로 만들거나 갱신할 때는 사용자 승인을 먼저 받는다.

## 계획 목록 (2026-10-04 기준)

| 계획 문서 | 대응 Todo | 상태 | 요약 |
|---|---|---|---|
| [2026-10-04-in-game-korean.md](2026-10-04-in-game-korean.md) | 48·49·50 | ✅ 완료 (2026-10-05, 사람 화면 확인은 사용자 확인 필요) | 대화 키워드 칩 (Stage 1) ∥ 게임 화면 안 한국어 덮개 (Stage 2·3) → 고정폭 글꼴 Neo둥근모 전체 적용 (Stage 4) |
| [mod-scope-proposal.md](mod-scope-proposal.md) | 43 | ⛔ 사용자 결정 대기 | 개조(modding) 범위 제안 6개, 사용자 결정 필요 |

## 상태 의미

- **✅ 완료** — Todo의 acceptance + merge 전 검증 게이트 통과 + main merge.
- **🟡 진행 중** — 구현 또는 검증이 한 worktree·브랜치에서 진행 중. 진행률은 ✅로 세지 않는다(부분 진행은 0).
- **⛔ 사용자 결정 대기** — 후보/질문 정리까지는 끝났고 사용자 답이 필요해 멈춤.
- **📦 보관** — 더 이상 쓰지 않지만 역사 기록으로 남겨 둠.

## 추가 방법

1. 사용자 승인을 받는다 (`docs/HANDOFF.md` 마지막 절에 "승인된 계획"으로 기록).
2. `docs/plans/YYYY-MM-DD-<topic>.md`로 파일을 추가한다. 머리글에 `## Context`, `## 방향 (결정)`, 본문 단계, 마지막에 `## 새 Claude Code 세션 시작 프롬프트`(필요 시)를 둔다.
3. `.omo/plans/ultima-web.md`의 같은 번호 Todo의 `References` 줄에 새 계획 파일을 추가한다. AGENTS.md 규칙에 따라 `docs/ULTIMA_WEB_PLAN.md`도 같이 갱신하고 `cmp` exit 0을 확인한다(Haiku로 검증).

## 진행 중 계획의 재개

`docs/plan.md` "바로 다음 순서"에서 가장 앞에 있는 미완료 Todo 번호를 찾고, 같은 번호가 위 표에
있으면 그 계획 문서를 정독한다. 없으면 `.omo/plans/ultima-web.md`의 그 Todo 본문을 직접 따른다.