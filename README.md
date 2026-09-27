# Ultima IV Web Korean

Ultima IV를 웹 브라우저에서 실행할 수 있도록 포팅하고, 한국어 UI/대화/입력을 제공하기 위한 개발 저장소입니다.

목표는 DOS/Windows 실행 환경에 묶여 있던 Ultima IV 플레이 경험을 `HTML + WebAssembly + WebGL2 + Web Audio` 기반의 정적 웹 앱으로 옮기는 것입니다. 최종 빌드는 GitHub Pages에 올릴 수 있어야 하며, 사용자는 브라우저에서 자신의 원본 `ultima4.zip` 파일을 선택해 플레이합니다.

## 이 저장소의 목적

- xu4 엔진 기반으로 원작 Ultima IV 규칙과 플레이 흐름을 보존합니다.
- Emscripten/WASM으로 브라우저 실행 환경을 만듭니다.
- WebGL2로 화면을 그리고, Web Audio로 음악과 효과음을 재생합니다.
- 긴 대화와 서사는 HTML 패널에 표시하고, 상태/메뉴는 게임 화면 위치에 맞춘 웹 오버레이로 표시합니다.
- 한국어 번역, 한국어 NPC 키워드 alias, 영어 원본 명령 입력을 함께 지원합니다.
- 세이브와 설정은 브라우저 저장소에 영속화합니다.
- GitHub Pages에서 정적 파일만으로 배포 가능하게 만듭니다.
- 새로 작성되는 코드는 TDD로 구현하고, 각 컴포넌트는 Unit Test로 독립 검증합니다.
- 원본 게임 데이터와 비밀 값만 제외하고, 계획/코드/번역 원천/테스트 정책/배포 workflow는 공개합니다.

## 현재 상태 (2026-09-27)

브라우저에서 실제 xu4 엔진이 원본 데이터로 돌아갑니다. GitHub Pages에도 올라가 있습니다.

Verified deployment: https://taejinkim7-dev.github.io/ultima/ (Actions run 36316708881)

동작하는 것:

- 원본 `ultima4.zip` 선택 → 검증 → 실제 엔진 시작 (WebGL2 렌더, 키보드 입력)
- 새 게임(캐릭터 생성), 필드 이동, 마을·NPC 대화, 던전·신단 진입, 저장/재로드, 세이브 export/import
- Web Audio 음악과 효과음
- 한국어 셸 UI, 한국어 NPC 키워드 alias 입력(예: `건강` → `health`)
- 원본 데이터가 배포 산출물에 섞이지 않도록 하는 검사(`npm run audit:dist`)

아직 안 된 것:

- 실제 NPC 대사를 한국어로 표시하기 (Todo 22 진행 중). 지금 게임 화면의 대사는 영어입니다.
- Firefox/WebKit 수동 QA, 최종 독립 검증(F1~F4)

자세한 한계는 [웹 포팅 문서](docs/WEB_PORT.md#알려진-한계)에 있습니다.

## 빠른 시작

clean clone에서 로컬로 빌드해 실행하는 순서입니다. 필요한 도구(Node 22, emsdk 4.0.23, apt 헤더)는 [웹 포팅 문서](docs/WEB_PORT.md)를 보세요.

```bash
npm ci
npm run deps:host
npm run build:modules
source .emsdk/emsdk_env.sh
npm run deps:wasm
npm run build:wasm
npm run build:site -- --base=/ultima/
npm run audit:dist -- --require-engine
ULTIMA4_DATA=/절대/경로/ultima4.zip npm run dev
```

## 문서

- [웹 포팅: 빌드·실행·테스트·한계·증거 인덱스](docs/WEB_PORT.md)
- [GitHub Pages 설정과 배포](docs/GITHUB_PAGES.md)
- [웹 포팅 실행 계획](docs/ULTIMA_WEB_PLAN.md)
- [진행 현황](plan.md)
- [소스 고정 revision](docs/SOURCE_PINS.md)
- [GitHub 업로드 및 Pages 대상](docs/GITHUB_UPLOAD.md)
- [TDD 및 컴포넌트 테스트 정책](docs/TESTING_POLICY.md)
- [AI 코딩 에이전트 인계 규칙](docs/AI_AGENT_HANDOFF.md)
- [작업 인수인계 기록](handoff.md) (세션별 누적 기록이라 옛 명령·경로가 남아 있습니다. 현재 방법은 위 문서를 따르세요.)
- [초기 프로젝트 노트](project.md)

AI 코딩 에이전트가 이 저장소를 이어받을 때는 먼저 [AGENTS.md](AGENTS.md), [작업 인수인계](handoff.md), [웹 포팅 실행 계획](docs/ULTIMA_WEB_PLAN.md), [TDD 및 컴포넌트 테스트 정책](docs/TESTING_POLICY.md)을 읽어야 합니다.

## 포함된 오픈소스 코드

`vendor/` 아래에 pinned 오픈소스 스냅샷이 있습니다.

- `vendor/xu4`: Ultima IV 엔진 (웹 이식용 수정 포함)
- `vendor/faun`: 오디오 라이브러리
- `vendor/glv`: xu4 관련 GLV submodule
- `vendor/boron`: xu4 모듈 패키징과 설정 처리에 필요한 Boron

각 소스의 revision은 [SOURCE_PINS.md](docs/SOURCE_PINS.md)에 있고, `npm run verify:repo-sources`가 트리 해시를 검사합니다.

## 포함하지 않는 것

이 저장소는 원본 Ultima IV 게임 데이터를 포함하지 않습니다.

포함하지 않는 예:

- `ultima4.zip`
- 원본 `.EXE`, `.TLK`, `.MAP`, `.EGA`, `.SAV`
- 추출된 원문 corpus
- 사용자의 세이브 파일
- 빌드 산출물과 테스트 evidence

최종 웹 앱도 원본 데이터를 배포하지 않습니다. 사용자가 합법적으로 가진 원본 데이터를 브라우저에서 직접 선택하는 방식으로 동작해야 합니다.

반대로 이 저장소에서 작성되는 구현 코드, 한국어 번역 원천 JSON, 테스트 정책, GitHub Actions workflow, 개발 문서는 공개를 기본값으로 둡니다.

## 배포

대상 GitHub 저장소:

```text
https://github.com/TaejinKim7-dev/ultima
```

GitHub Pages URL:

```text
https://taejinkim7-dev.github.io/ultima/
```

`main`에 push하면 `.github/workflows/pages.yml`이 엔진까지 빌드·검사한 뒤 `dist/`를 배포합니다. 설정과 확인 방법은 [GITHUB_PAGES.md](docs/GITHUB_PAGES.md)를 보세요.

## 개발 원칙

구현은 [TDD 및 컴포넌트 테스트 정책](docs/TESTING_POLICY.md)을 따릅니다. 새 코드는 실패하는 테스트를 먼저 만들고, 컴포넌트별 Unit Test를 통과시킨 뒤 통합 QA로 넘어갑니다. 진행 순서와 남은 단계는 [plan.md](plan.md)에 있습니다.

이 저장소의 첫 번째 원칙은 단순합니다: 원작 데이터는 배포하지 않고, 웹에서 플레이 가능한 한국어 Ultima IV 실행 환경을 만든다.
