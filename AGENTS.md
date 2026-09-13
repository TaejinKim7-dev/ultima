# AI Coding Agent Rules

이 저장소를 이어받는 AI 코딩 에이전트는 작업 전에 이 파일과 `handoff.md`를 먼저 읽는다.

## 프로젝트 목표

- Ultima IV를 GitHub Pages에서 호스팅 가능한 정적 웹 앱으로 포팅한다.
- 실행 기반은 `HTML + TypeScript + WebAssembly + WebGL2 + Web Audio`다.
- 사용자는 브라우저에서 자신이 가진 원본 `ultima4.zip`을 직접 선택한다.
- 한국어 UI, 한국어 대화 표시, 한국어 NPC keyword alias를 제공한다.

## 절대 금지

- 원본 Ultima IV 게임 데이터는 커밋하지 않는다.
- 금지 예: `ultima4.zip`, 원본 `.EXE`, `.TLK`, `.MAP`, `.EGA`, `.SAV`, 추출 원문 corpus, 사용자 save, secret.
- 임시 검증에 원본 데이터를 사용했다면 repo 밖 임시 경로에 두고, 산출물·로그·artifact에 포함하지 않는다.
- 실패 테스트를 삭제하거나 약화해서 green으로 만들지 않는다.

## 개발 방식

- TDD를 기본으로 한다.
- 새 동작은 실패하는 Unit Test를 먼저 추가하고 RED 로그를 남긴다.
- 최소 구현으로 GREEN을 만든 뒤 리팩터링한다.
- 각 컴포넌트는 독립 Unit Test를 가진다.
- 통합/e2e/manual QA는 Unit Test 통과 이후에만 완료 증거로 인정한다.
- 테스트 정책은 `docs/TESTING_POLICY.md`를 따른다.

## Git 작업 방식

- `main`은 안정 브랜치로 유지한다.
- 구현은 `todo-<number>-<short-topic>` 형식의 feature branch에서 진행한다.
- PR에는 Todo 번호, RED/GREEN 로그, Unit Test 결과, QA evidence를 남긴다.
- PR merge 후 GitHub Pages 배포가 가능해야 한다.

## 인계 규칙

다른 AI 에이전트에게 넘기기 전 `handoff.md`를 갱신한다. 인계 내용은 다음 항목을 반드시 포함한다.

1. 현재 목표와 범위
2. 이미 확정된 기술/제품 결정
3. 현재 작업 상태와 마지막 커밋/브랜치
4. 다음 에이전트가 바로 실행할 작업
5. 금지사항과 검증 명령
6. 남은 위험, blocker, 아직 검증하지 않은 사실

상세 포맷은 `docs/AI_AGENT_HANDOFF.md`를 따른다.
