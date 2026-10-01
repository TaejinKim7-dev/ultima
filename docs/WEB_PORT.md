# Web Port — build, run, test

xu4(Ultima IV 엔진)를 Emscripten으로 빌드해 브라우저에서 돌리는 방법과 저장소 구조, 검증 방법, 알려진 한계를 정리한 문서입니다. 배포는 [GITHUB_PAGES.md](GITHUB_PAGES.md)를 보세요.

## 구조

| 영역 | 위치 | 역할 |
|---|---|---|
| 엔진 | `vendor/xu4/src` | pinned xu4 소스. 웹 전용 코드는 `__EMSCRIPTEN__` 분기(`vendor/xu4/src/sound_web.cpp`, `vendor/xu4/src/event.cpp`의 text-prompt 훅 등) |
| wasm 빌드 | `scripts/build-wasm.mjs` | 네이티브와 같은 소스 목록 + GLFW(`-sUSE_GLFW=3`) + Asyncify로 `build/wasm-release/{xu4.mjs,xu4.wasm}` 생성 |
| 모듈 | `scripts/build-modules.mjs` | host Boron으로 `render.pak`, `Ultima-IV.mod`를 pinned 소스에서 빌드 (원본 게임 데이터 아님) |
| 브라우저 셸 | `src/main.ts`, `src/shell.ts` | 원본 ZIP 선택, 엔진 시작, 대화 패널, 오버레이, 한국어 키워드 입력, 세이브 export/import |
| 시작 순서 | `src/engine/startup.ts` | ZIP 검증 → IDBFS mount → FS에 모듈·ZIP 기록 → 오디오 bridge → `callMain()` 1회 |
| 영속 저장 | `src/engine/persistence.ts` | IDBFS 세이브/설정 동기화 |
| 오디오 | `src/engine/audio.ts` | Web Audio 음악/효과음(RFX 합성 포함) |
| 한국어 | `locales/ko/`, `src/i18n/` | 번역 원천 JSON, 생성 테이블, NPC 키워드 alias |

## 요구 도구

- Node.js 22 이상 (`package.json` `engines`; 개발은 v22.23.3에서 확인)
- C 컴파일러, `make` (host Boron/Faun 빌드)
- Debian/Ubuntu 기준 Faun 빌드용 헤더: `sudo apt-get install -y libpulse-dev libvorbis-dev libflac-dev`
- emsdk 4.0.23 (pin은 [SOURCE_PINS.md](SOURCE_PINS.md)). 저장소 루트의 `.emsdk/`(git-ignored)에 설치해 쓰는 것이 기존 개발 방식입니다.
  ```bash
  git clone https://github.com/emscripten-core/emsdk.git .emsdk
  .emsdk/emsdk install 4.0.23
  .emsdk/emsdk activate 4.0.23
  source .emsdk/emsdk_env.sh
  ```
- 플레이/실제 엔진 e2e에는 사용자가 합법적으로 가진 원본 `ultima4.zip` (저장소에 없음)

## 빌드 (clean clone 기준)

CI(`.github/workflows/pages.yml`)와 같은 순서입니다. 2026-09-27에 clean clone에서 전 단계 exit 0을 확인했습니다.

```bash
npm ci
npm run deps:host          # host Boron + Faun (build/host/)
npm run build:modules      # build/host/modules/{render.pak,Ultima-IV.mod}
source .emsdk/emsdk_env.sh
npm run deps:wasm          # wasm Boron (build/wasm-deps/)
npm run build:wasm         # build/wasm-release/{xu4.mjs,xu4.wasm}
npm run build:site -- --base=/ultima/
npm run audit:dist -- --require-engine
```

`build:site`는 `build/wasm-release`가 있을 때만 엔진을 `dist/engine/`에 복사합니다. 엔진 없이 빌드하면 셸만 있는 사이트가 되므로, 배포용 산출물은 반드시 `audit:dist -- --require-engine`으로 확인합니다.

## 로컬 실행

```bash
npm run dev                # 개발 서버
npm run preview            # dist/ 정적 프리뷰
```

- `ULTIMA4_DATA=/절대/경로/ultima4.zip npm run dev`로 띄우면 `vite.config.ts`의 개발 전용 플러그인이 파일 선택을 자동으로 채웁니다. 이 플러그인은 `apply: "serve"`라 `vite build` 결과에는 들어가지 않고, `npm run preview`에서도 동작하지 않습니다.
- 그 외에는 화면의 파일 선택 버튼으로 원본 `ultima4.zip`을 고르면 됩니다.

## 검증

```bash
npm run test:unit
npm run typecheck
npm run verify:repo-sources
npm run verify:workflow
npm run verify:release-docs
npm run i18n:check -- --strict
npm run test:e2e -- --project=chromium
```

- 한 번에 전부: `ULTIMA4_DATA=/절대/경로/ultima4.zip npm run verify:release` — typecheck, unit, native, `i18n:check --strict`, repo-sources, `build:site --base=/ultima/`, `audit:dist --require-engine`, workflow, release-docs, Chromium e2e를 순서대로 돌리고 첫 실패에서 그 exit code로 멈춥니다. `ULTIMA4_DATA`가 없으면 실행을 거부합니다(`--allow-skip-real-data`로 강행 가능, 경고 출력). `--dry-run`은 단계만 출력합니다.
- 실제 엔진을 쓰는 e2e는 `ULTIMA4_DATA`가 없으면 skip됩니다. 예: `ULTIMA4_DATA=/절대/경로/ultima4.zip npm run test:e2e -- tests/e2e/boot-sequence.spec.ts --project=chromium`
- 여러 spec 파일을 동시에 돌릴 때는 `PLAYWRIGHT_PORT`를 서로 다르게 줍니다(`playwright.config.ts`). NPC 접근처럼 실시간 타이밍에 민감한 spec(`tests/e2e/korean-npc-alias.spec.ts`, `tests/e2e/gameplay-progression.spec.ts`)은 동시에 돌리지 않는 것이 안전합니다.
- 10분 메모리 스모크: `MEMORY_SMOKE_MINUTES=10 npm run test:memory-smoke`
- 배포 산출물 스모크: `tests/e2e/pages-static-smoke.spec.ts`는 `vite preview`가 아닌 단순 정적 서버에 산출물을 `/ultima/`로 올려 실제 엔진을 부팅합니다. `PAGES_DIST`(산출물 경로), `PAGES_PREFIX`(기본 `/ultima/`)로 대상을 바꿀 수 있습니다.

## 원본 데이터 처리 원칙

- 사용자가 브라우저에서 직접 고른 `ultima4.zip`만 씁니다. 파일은 File API로 읽어 wasm 가상 FS에만 쓰고, 어떤 서버로도 업로드하지 않습니다.
- 원본 ZIP, `.EXE`/`.TLK`/`.MAP`/`.EGA`/`.SAV`, 추출 원문, 사용자 세이브는 저장소·배포 산출물·CI artifact에 넣지 않습니다.
- `npm run audit:dist`가 산출물의 원본 데이터 확장자, 개발 도구 파일, XSS sink, 허용되지 않은 테스트 훅, 외부 네트워크 호출, 콘솔 노이즈를 검사합니다(`scripts/audit-dist.mjs`).
- 200MiB를 넘는 ZIP은 읽기 전에 거부합니다(`src/engine/zip.ts`).

## 브라우저 지원

| 브라우저 | 상태 |
|---|---|
| Chromium 136 (Playwright headless) | 모든 e2e와 라이브 사이트 부팅을 확인했습니다 |
| Firefox, WebKit/Safari | 확인 필요 (최종 수동 QA F3 범위) |

WebGL2와 Web Audio가 필요합니다.

## 알려진 한계

- **실제 게임 텍스트의 한국어 표시 범위**: 마을 주민(U4 .TLK) NPC 대화는 대화 패널(`#dialogue-history`)에 한국어로 나옵니다(Todo 22: 만남·응답·이름·틀 문장). 엔진은 TLK 문장을 `MAP:npcIndex:field` id로만 넘기고 영어 원문은 엔진 밖으로 보내지 않습니다. 그 밖의 게임 텍스트도 한국어입니다.
  - Lord British·Hawkwind·Codex/엔딩 문장: `discourse_castle.cpp`·`codex.cpp`가 원문 포인터가 아니라 문장 id로 넘겨 대화 패널에 한국어로 표시합니다(Todo 24).
  - 상점: `script_boron.cpp`의 `web-say`가 치환 전 템플릿 해시와 심볼/값 쌍을 보내고 `src/dialogue/vendor-compose.ts`가 Boron의 `construct` 규칙 그대로 한국어 한 줄을 조립합니다(Todo 25).
  - 인트로: `intro.cpp`의 각 화면을 `src/overlay/intro-view.ts`가 불투명 배경 한국어 DOM 오버레이로 덮습니다(Todo 26).
  - 상태창(파티·Ztats·인벤토리)과 메뉴: `stats.cpp`가 `src/overlay/status-view.ts`로 보내 한국어 DOM 오버레이로 덮습니다(Todo 27, Todo 12의 status/menu/TextView 오버레이 계약).
  - 인게임 `screenMessage()` 문장(전투·던전·제단·아이템 등): 포맷 해시와 엔진이 미리 채운 인자를 보내 한국어로 다시 조립해 대화 패널에 붙입니다(Todo 23). 매핑에 없는 형식은 영어로 되돌리지 않고 조용히 버립니다(원본 데이터일 수 있어서).
  - 지도·아바타·룬 같은 픽셀 그래프는 번역 대상이 아니라 그대로 캔버스에 그립니다.
  - 남는 영어: 번역 id 경로가 없는 원본 데이터(TLK의 NPC 대사가 아닌 레코드, TITLE.EXE 바이너리 문자열 일부)와 `getVirtueAdjective()` 같은 코드 인자. 화면에 아직 어떤 영어가 남는지 전수 계측한 것은 아닙니다.
- 번역 corpus는 inventory 기준 4549/4549입니다(`npm run i18n:check -- --strict`가 이 수를 검증합니다. Todo 22의 TLK 대화 틀 18개를 시작으로 Todo 23~27이 표면을 계속 늘렸습니다). 이 inventory가 화면에 나오는 모든 문장을 담지는 않습니다. `getVirtueAdjective()` 같은 코드 인자는 번역 틀 안에서 영어로 나옵니다.
- 한국어 입력창을 쓴 뒤에는 포커스가 입력창을 벗어날 때까지 화살표·명령 키가 게임으로 가지 않습니다.
- 한국어 입력창은 네이티브 텍스트 입력 요청(NPC 대화 등)이 열려 있을 때만 제출됩니다. 요청이 없거나 이미 닫혔으면 거부 메시지를 띄웁니다(Todo 18).
- 메모리 스모크는 JS heap만 측정하고 wasm linear memory는 포함하지 않습니다.

## 소스 pin

`vendor/source-manifest.json`과 [SOURCE_PINS.md](SOURCE_PINS.md)에 같은 revision이 기록되어 있고, `npm run verify:repo-sources`가 vendor 트리 해시를 검사합니다.

| Component | Revision |
|---|---|
| xu4 | `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71` |
| faun | `e175dbfabab468008906e724e9d3872097bdb560` |
| glv | `20ab75d39ae1ab27c55f1eea09c83b3985738110` |
| boron | `84e7a81f68aa7588419f7b164e94e096a1c3fa07` |
| emsdk | tag `4.0.23` (not vendored) |

`vendor/xu4`에는 웹 이식용 수정이 들어 있습니다(`__EMSCRIPTEN__` 분기 위주). 수정할 때마다 manifest의 treeSha256을 같이 갱신합니다.

## 증거 인덱스 (로컬 전용)

`.omo/evidence/`는 git-ignored이며 개발 머신에만 있습니다. clean clone에는 없습니다.

`npm run verify:release-docs`는 두 종류를 구분합니다. tracked 산출물(`.omo/plans/ultima-web.md`, `docs/ULTIMA_WEB_PLAN.md`의 byte 동일성, 이 문서, `.github/workflows/pages.yml`, `docs/TESTING_POLICY.md`, `docs/AI_AGENT_HANDOFF.md`, package.json의 스크립트)은 fresh clone에도 있으므로 **hard requirement**로 실패합니다. 아래 표처럼 `.omo/evidence/**`는 커밋되지 않으므로 **soft**입니다: 로컬에 있으면 존재로 집계하고, 없으면 경로를 이름까지 출력해 건너뜁니다(silent pass도 실패도 아님). 그래서 clean clone에서도 이 명령은 통과하면서 무엇이 없는지 보여 줍니다.

| 단계 | 주요 증거 |
|---|---|
| 3 native 기준선 | `.omo/evidence/ultima-web/task-3/full-qa-native-baseline.log` |
| 9 브라우저 시작 | `.omo/evidence/ultima-web/task-9/startup-title.png` |
| 10 저장/재로드 | `.omo/evidence/ultima-web/task-10/save-reload-after-journey.png` |
| 13 한국어 alias | `.omo/evidence/ultima-web/task-13/05-after-korean-health-alias.png` |
| 22 한국어 NPC 대사 | `.omo/evidence/ultima-web/task-22/korean-npc-output.png` |
| 15 번역 검사 | `.omo/evidence/ultima-web/task-15/i18n-strict.log` |
| 16 오디오 | `.omo/evidence/ultima-web/task-16/audio-summary.json` |
| 17 게임 진행 | `.omo/evidence/ultima-web/task-17/14-shrine-honesty-entered.png` |
| 18 경계/보안 | `.omo/evidence/ultima-web/task-18/security-audit.log`, `.omo/evidence/ultima-web/task-18/dist-leak-rejected.log` |
| 19 Pages | `.omo/evidence/ultima-web/task-19/pages-static-smoke-ci-artifact.json`, `.omo/evidence/ultima-web/task-19/live-pages-smoke.json` |
| 21 실제 엔진 | `.omo/evidence/ultima-web/task-21/title-render.png` |
