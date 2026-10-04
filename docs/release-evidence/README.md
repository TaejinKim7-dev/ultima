# 릴리스 증거 요약 (Todo 34~46, 2026-10-03)

`.omo/evidence/`는 원본 게임 데이터가 섞이지 않도록 git에 올리지 않는 로컬 폴더다(AGENTS.md). 이 폴더는 그중 **영어 원문과 원본 데이터가 없는 요약 문서만** repo로 옮긴 것이다. 번역 공개 정책은 [TRANSLATION_POLICY.md](../TRANSLATION_POLICY.md), 갭별 최종 상태는 [GOAL_GAP_AUDIT.md](../GOAL_GAP_AUDIT.md) §11, 명령과 exit code의 전체 기록은 [handoff.md](../handoff.md)에 있다.

| 문서 | 내용 |
|---|---|
| [F1-addendum-2026-10.md](F1-addendum-2026-10.md) | Todo 34~46 증거 표, 최종 트리의 `verify:release` 18단계, 한계 |
| [F4-addendum-2026-10.md](F4-addendum-2026-10.md) | 범위 충실도 재감사 (APPROVE_WITH_DEVIATIONS), Firefox 15/15 · WebKit 15/15 |
| [task-38-coverage-report.md](task-38-coverage-report.md) | 화면에 남는 영어·누락 텍스트 계측 보고서(해시와 `file:line`만, 영어 없음) |
| [task-45-coverage-report-after.md](task-45-coverage-report-after.md) | Todo 45 수정 후 재측정 보고서 |
| [task-45-classification.md](task-45-classification.md) | 형식만 있는 템플릿 호출 지점 분류(해시, `file:line`, 분류, 이유) |
| [task-metrics.md](task-metrics.md) | 순서 감사, Codex 관측, wasm 메모리, 오분류 점검의 작은 로그 |

## 이 폴더에 없는 것 (로컬 전용)
- 스크린샷, Playwright trace, 전체 e2e·게이트 로그, 각 Todo의 RED/GREEN 로그
- `.local/`의 비공개 영어 인벤토리(영어 원문이 있어 공개 금지)

## 한계
- Safari 실기는 이 환경(WSL2)에서 검증할 수 없다. WebKit 자동화는 Safari 증거가 아니다.
- 한국어 IME 입력 감각, 세이브 가져오기의 OS 파일 선택창, 엔딩 패널 표시 방식은 사람이 확인해야 한다.
- 죽음 메시지와 미덕 형용사는 단위 테스트만 있다(e2e가 해당 상황에 도달하지 못함).
