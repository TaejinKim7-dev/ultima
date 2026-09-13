# TDD And Component Test Policy

이 저장소에서 새로 작성되는 구현 코드는 TDD 기반으로 개발한다.

핵심 규칙은 간단하다.

1. 구현보다 테스트를 먼저 작성한다.
2. 실패하는 테스트를 확인한 뒤 최소 구현으로 통과시킨다.
3. 통과 후 필요한 정리만 한다.
4. 컴포넌트 단위 테스트와 통합 검증을 모두 남긴다.

## Required TDD Loop

모든 기능 작업은 아래 순서를 따른다.

1. RED: 새 기능 또는 버그 수정이 아직 실패한다는 테스트를 먼저 추가하고 실행한다.
2. GREEN: 가장 작은 구현으로 테스트를 통과시킨다.
3. REFACTOR: 동작을 유지한 채 구조를 정리한다.
4. EVIDENCE: 실행한 명령과 결과를 작업별 evidence에 기록한다.

테스트가 없거나 테스트 수가 0이면 완료로 인정하지 않는다.

## Component-Level Unit Tests

각 컴포넌트는 독립 테스트를 가진다.

| Component | Required test type | Purpose |
|---|---|---|
| Source/export tooling | Unit test + repository audit | pinned source와 금지 파일 추적 여부 검증 |
| Module packaging | Native unit/fixture test | `render.pak`, `Ultima-IV.mod` 로딩 검증 |
| WASM bridge | TypeScript unit test | C ABI/JS bridge contract 검증 |
| WebGL renderer | Unit fixture + browser test | shader, buffer upload, nonblank rendering 검증 |
| Input queue | Unit test | keyboard, IME, request ID, prompt epoch 검증 |
| Data loader | Unit test + browser test | ZIP 구조/hash/필수 파일 검증 |
| Persistence | Unit test + browser test | IDBFS save/settings/export/import 검증 |
| Message panel | Unit test | token stream, clear/prompt/control 문자 검증 |
| Overlay layout | Unit test + browser screenshot | status/menu 위치와 CJK overflow 검증 |
| Korean aliases | Unit test | 한국어 alias와 canonical English mapping 검증 |
| Localization | Unit test + i18n check | placeholder, missing key, width, glossary 검증 |
| Audio | Unit test + browser test | manifest, decode, duration, playback state 검증 |
| Pages artifact | Unit/audit test | `/ultima/` base, `index.html`, 금지 파일 유출 검증 |

## Required Test Commands

구현 과정에서 다음 명령 인터페이스를 제공해야 한다.

```sh
npm run test:unit
npm run test:native
npm run test:e2e
npm run i18n:check
npm run audit:dist
npm run verify:release
```

각 작업 Todo는 필요한 더 좁은 명령도 지정한다. 예를 들어 `npm run test:unit -- tests/unit/input-queue.test.ts`처럼 특정 컴포넌트 테스트를 직접 실행할 수 있어야 한다.

## Completion Rule

작업 하나가 완료되려면 다음이 모두 필요하다.

- 해당 작업의 RED 로그
- 해당 작업의 GREEN 로그
- 컴포넌트 단위 테스트 통과
- 필요한 경우 browser/native/e2e 검증 통과
- 실패 케이스 테스트 또는 명시적인 negative assertion
- evidence 경로 기록

`빌드됨`, `눈으로 봐서 됨`, `grep으로 찾음`, `테스트를 나중에 추가 예정`은 완료 증거가 아니다.

## Production Boundary

테스트 전용 hook, fixture, cheat/state-control API는 production bundle에 남기지 않는다. production artifact는 `npm run audit:dist`로 검사하며, 원본 Ultima IV 데이터와 private corpus가 포함되면 실패해야 한다.
