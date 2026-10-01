# AI Coding Agent Rules

이 저장소를 이어받는 AI 코딩 에이전트는 작업 전에 이 파일과 `plan.md`, `HANDOFF.md`, `handoff.md`를 먼저 읽는다.

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
- **빌드 산출물 신선도 강제(Todo 28)**: `build:modules`/`build:wasm`은 소스 해시 stamp를 남기고, `build:site`·`vite dev`는 소스보다 오래된 산출물이면 실패한다. `npm run check:build-fresh`가 실패하면 우회하지 말고 안내된 빌드 명령을 실행한다.
- **통합 검증은 `npm run verify:integration` 하나로만** 실행한다(`build:modules → build:wasm → check:build-fresh → … → e2e` 순서 고정). 명령을 손으로 나열해 일부만 돌리지 않는다.
- **실패 원인은 추측 전에 관측한다**: e2e 실패 시 자동 첨부되는 `failure-panel.txt`(패널·포커스)·`failure-screen.png`를 먼저 본다. 가설은 관측으로 확인한 뒤에만 수정 근거로 쓴다.
- **산출물이 같다고 결론 낼 때는 `build/` 전체(wasm·`.mod`·`render.pak`과 그 복사본)를 비교**한다. 한 파일만 보고 "빌드 동일"이라 판단하지 않는다.
- **e2e webServer 죽음은 제품 회귀가 아니라 인프라 실패다**: `ERR_CONNECTION_REFUSED` / `ECONNREFUSED`로 실패한 e2e는 webServer(`scripts/build-site.mjs` + `vite preview --strictPort`)가 죽은 것이지 assertion 실패가 아니다. 스위트를 중간에 재시작하지 말고, 서버가 죽은 시각과 어느 시점까지 통과했는지 먼저 기록한 뒤 단독 재실행으로 재현· isolating 한다. 서로 다른 port로도 CPU 경합은 남으므로 `tests/e2e`의 실시간 민감 스펙은 여전히 직렬 실행이 안전하다.
- **통합 게이트는 단독으로 실행한다**: `npm run verify:integration`을 돌리는 동안에는 다른 레인·에이전트·워크트리를 동시에 굴리지 않는다. 이 게이트의 `webServer`는 Playwright가 띄운 `vite preview` 프로세스 하나이며, 그 프로세스가 죽으면 이후 모든 테스트가 assertion 실패가 아니라 `ERR_CONNECTION_REFUSED`로 죽는다. 병행 작업이 원인인지 확인하려면 게이트를 완전히 단독으로 재실행해야 하고, 그 재실행이 완주할 때까지 결과를 확정하지 않는다.

## Git 작업 방식

- `main`은 안정 브랜치로 유지한다.
- 구현은 `todo-<number>-<short-topic>` 형식의 feature branch에서 진행한다.
- 이 프로젝트는 1인 개발이므로 PR 리뷰 절차는 생략한다. GitHub PR을 만들지 않고 feature branch를 `main`에 직접 merge한다.
- **`main`에 merge(또는 push)하기 전 반드시 로컬에서 아래 검증을 모두 실행하고 전부 성공(exit 0, 또는 해당 스크립트가 의도적으로 실패를 요구하는 경우 그 명시된 실패)해야 한다. 하나라도 통과하지 못하면 merge를 금지한다.**
  ```bash
  npm ci
  npm run test:unit
  npm run verify:repo-sources
  npm run typecheck
  npm run build
  npm run check:build-fresh
  git diff --check
  ```
  - Todo별로 추가된 명령(예: `npm run cmake:*`, `npm run deps:host`, `npm run test:native` 등)이 있으면 그 Todo의 검증 명령도 동일하게 실행한다.
  - **F2 네이티브 게이트는 `npm run build:native`가 선행이다**: `native/CMakeLists.txt:51-61`이 "전체 엔진 빌드는 이 CMake 프로젝트 소속이 아니며, 네이티브 xu4 바이너리는 `npm run build:native`가 **별도로** 빌드한다"라고 명시한다. 이 선행 단계를 빼면 `cmake:configure`→`cmake:build`는 통과해도 `test:native`가 **exit 8**로 죽는다(`native-baseline-negative`가 `build/host/xu4-src/src/xu4` 부재로 실패). 이는 **제품 결함이 아니라 명령 목록 결함**이며, 그 실패는 설계된 loud-fail다(`native/tests/native_baseline_test.c:6-14`가 skip이 아니라 fail이라고 명시). 순서: `build:native` → `cmake:configure` → `cmake:build` → `test:native`.
- 로컬 검증 결과(실행한 명령과 exit code)는 merge 전에 `handoff.md`에 기록한다.
- **게이트 실패는 숨기지 않는다**: 통합 게이트의 어떤 단계든 exit 0이 아니면 merge/push를 금지하고, 실패한 단계와 exit code를 `handoff.md`에 그대로 남긴다. 인프라 실패(위 e2e bullet)도 통과로 기록하지 않는다.
- merge 후 GitHub Pages 배포가 가능해야 한다.

## 진행 관리

- 진행 기준 문서는 루트 `plan.md`다. 전체 단계 수는 `.omo/plans/ultima-web.md`의 Todo 개수 + F1~F4다 — 새 Todo가 추가되면 이 수도 늘어난다. 진행률은 ✅ 단계 수 ÷ 전체 단계 수로 계산한다. 부분 진행(🟡)은 0으로 센다.
- 단계 번호와 세부 정의(References/Acceptance/QA)의 원본은 `.omo/plans/ultima-web.md`다. `docs/ULTIMA_WEB_PLAN.md`는 그와 byte-identical하게 유지한다(`cmp`로 확인).
- "다음 단계 진행"을 요청받으면 `plan.md`의 "바로 다음 순서"에서 가장 앞에 있는 미완료 단계 하나를 진행한다.
- 단계가 완료 기준(acceptance criteria + merge 전 검증 게이트)을 통과하면 아래를 함께 갱신한다.
  1. `plan.md`: 상태(✅), 현재 진행률(n/N), "바로 다음 순서"
  2. 계획서 두 벌의 해당 체크박스 `[x]`
  3. `handoff.md`: merge 게이트 명령과 exit code
- 작은 단계(의미 있는 조사 결론, 테스트 RED/GREEN, 커밋 등)가 끝날 때마다 `handoff` 스킬로 루트 `HANDOFF.md`를 갱신한다. `HANDOFF.md`는 세션 재개용 요약이고, 소문자 `handoff.md`는 공식 인계 기록이다. 둘은 다른 파일이다.
- 실제로 실행하거나 관찰한 것만 완료로 적는다. 불확실하면 "확인 필요"로 남긴다.
- 사용자 결정이 필요한 작업(패키지/SDK 설치, 큰 다운로드, push, `main` merge)은 진행 전에 멈추고 묻는다.
- 단계 작업이 끝나면 진행률 변화와 다음 단계만 짧게 보고한다.

## 인계 규칙

다른 AI 에이전트에게 넘기기 전 `handoff.md`를 갱신한다. 인계 내용은 다음 항목을 반드시 포함한다.

1. 현재 목표와 범위
2. 이미 확정된 기술/제품 결정
3. 현재 작업 상태와 마지막 커밋/브랜치
4. 다음 에이전트가 바로 실행할 작업
5. 금지사항과 검증 명령
6. 남은 위험, blocker, 아직 검증하지 않은 사실

상세 포맷은 `docs/AI_AGENT_HANDOFF.md`를 따른다.
