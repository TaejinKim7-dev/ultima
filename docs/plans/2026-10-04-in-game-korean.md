# 계획: 문서 정리 + 대화 키워드 메뉴 + 게임 화면 안 한국어 표시 + 고정폭 한글 글꼴

## Context
2026-10-04 사용자 요청 흐름:
1. 대화 중 쓸 수 있는 키워드를 보여 달라. 위치는 빨간 표시 영역(대화 기록 아래)에, 목록이나 메뉴로.
2. 오른쪽 창이 아니라 **원래 게임 화면 안에 한국어**가 나오게 해 달라. 게임 전체는 그대로 두고, 한국어 영역만 고해상도로.
3. **고정폭 한글 픽셀 글꼴**이 더 게임답다.
4. 모든 기록·방향 문서를 `docs/`로 모으고, 다른 AI에게 "docs 읽고 다음 작업 준비해" 한마디로 넘길 수 있게 해 달라.

**현재 상태**
- 게임 메시지 영역(320×200 래스터의 192,96 128×96 = 16칸×12줄)은 영어로 나오고, 한국어는 오른쪽 패널에만 나온다.
- 상태창·인트로·메뉴는 이미 불투명 한국어 DOM 덮개로 덮여 있다(Todo 26/27).
- 계획서 Todo 48·49·50은 등록·push까지 끝났다. 이 문서는 탐색과 설계 검토 결과로 그 Todo들을 수정하고 구체화한다.
- 진행률 50/54. 남은 Todo: 48, 49, 50, 43. *(2026-10-05 갱신: 48·49·50 ✅ — 53/54, 남은 것은 Todo 43뿐. 48은 `ca3cd6d`에서, 49 Phase B·50은 Todo 50 merge로 main에 들어감)*

## 방향 (결정)
- **표시 방식**: 엔진 안에서 한글을 그리지 않는다(8×8 격자에서는 16×16 한글이 8자×6줄밖에 안 들어감). 대신 메시지 영역을 **불투명 고해상도 DOM 덮개**로 덮는다. 게임 래스터와 HQX 필터는 그대로 둔다.
- **글꼴**: **Neo둥근모**(`neodgm.woff2` v1.601, OFL 1.1, 44KB)를 `public/fonts/`에 원본 `LICENSE.txt`와 함께 수정 없이 둔다. CSS는 `url("/fonts/neodgm.woff2")`(Vite가 `/ultima/fonts/`로 바꿈). 감사·소스 고정·신선도 스크립트는 바꿀 필요가 없다.
- **오른쪽 패널**: 대화 기록 스크롤백과 Todo 48 키워드 메뉴로 쓴다. 한국어를 읽는 곳은 게임 화면 안이 먼저다.

### 사용자 결정 5건 (권장안 채택, 승인 화면에서 바꿀 수 있음)
1. **스위치 "게임 화면에 한국어 표시"**: 기본 켜짐. 상태는 세션 한정이고 URL `?screen-ko=0`에 반영해 새로고침해도 유지한다. localStorage는 `audit:dist` 규칙 위반이라 쓰지 않는다.
2. **프롬프트 기호(▶)**: 게임 화면 덮개에는 표시하고, 오른쪽 패널에는 표시하지 않는다. 패널에 넣으면 명령마다 기호가 쌓인다.
3. **Lord British·Hawkwind의 긴 대답**: 한 화면을 넘으면 "▼"에서 멈추고, 키를 누르면 다음 페이지로 넘긴다(원작처럼).
4. **ESC 게임 선택 화면·일시정지 화면**: 이 화면이 뜨면 덮개층 **전체**(메시지·상태창·인트로 덮개)를 숨긴다. 지금 상태창 덮개가 게임 선택 화면을 가리는 문제도 같이 해결된다.
5. **아래 테두리의 바람 표시("Wind West")**: 한국어화는 Todo 50에서 한다.

## Stage 0 — 문서 체계: "docs 읽고 다음 작업 준비해"
- **`docs/README.md`** (신규, AI 시작점):
  - 읽는 순서: ① `AGENTS.md` ② `docs/plan.md` "바로 다음 순서" ③ `docs/plans/README.md`의 "진행 중" 계획 ④ `docs/handoff.md` 마지막 절
  - 개발 룰: 진행 → 저장 → 기록 → 확인. 테스트는 Haiku 서브에이전트가 실행하고, 통합 게이트는 단독으로 돌린다.
  - 절대 금지 사항
  - 환경: `ULTIMA4_DATA`, Node22 PATH, emsdk
  - 아래의 "새 세션 시작 프롬프트"
- **`docs/plans/README.md`** (신규): 구현 계획 목록과 상태 표, 각 계획에 대응하는 계획서 Todo 번호.
- **`docs/plans/2026-10-04-in-game-korean.md`**: 이 승인본을 저장한다. 이후 갱신도 이 파일에서 한다.
- **`AGENTS.md`**: "작업 전에 읽을 파일"에 `docs/README.md`를 넣고, Haiku 테스트 규칙과 `docs/HANDOFF.md` 위치를 명시한다.

## Stage 0b — 기록·방향 문서를 `docs/`로 모으기
- **이동** (`git mv`, 내용 유지):
  - `plan.md` → `docs/plan.md`
  - `handoff.md` → `docs/handoff.md`
  - `HANDOFF.md` → `docs/HANDOFF.md`
  - `goal.md` → `docs/GOAL.md`
  - `project.md` → `docs/PROJECT_NOTES.md`
  - `.omo/drafts/mod-scope.md` → `docs/plans/mod-scope-proposal.md`
  - `docs/NEXT_FIVE_STEPS.md`(Todo 2~6 시절 문서) → `docs/archive/`, 맨 위에 "역사 기록" 표시
- **루트에 남기는 것**: `README.md`, `AGENTS.md`. 둘 다 `docs/README.md`로 안내한다.
- **계획서**:
  - 스크립트(`verify-integration.mjs`, `verify-release.mjs`, `release-docs-verifier.mjs`, `tests/unit/release-docs.test.ts`)가 `.omo/plans/ultima-web.md`를 직접 읽으므로 두 벌을 그대로 둔다.
  - 기준 문서를 `docs/ULTIMA_WEB_PLAN.md`로 선언하고, `.omo` 쪽은 도구용 사본(`cmp`로 동일 확인)으로 둔다. 스크립트는 바꾸지 않는다.
- **참조 갱신**: README 링크(`verify:release-docs`가 검사함), AGENTS.md, docs, 코드·테스트 주석에 있는 옛 경로를 고친다. 이 파일들을 실제로 읽는 기능 코드는 없다(확인함).
- **로컬 설정**: `.claude/settings.json`의 Stop 훅 경로를 `docs/HANDOFF.md`로 바꾼다.
- **Todo 49 본문 수정** (계획서 두 벌):
  - `screenEraseTextArea`는 바람 표시 영역만 지우므로 "지우기 연결" 항목을 빼고, 게임 단계(플레이 시작·종료) 신호로 바꾼다.
  - localStorage를 세션 한정 + URL 저장으로 바꾼다.
  - ESC·일시정지 화면 신호와 CR/LF 연결을 추가한다.
  - 글꼴 크기 규칙을 "기기 픽셀 기준 16의 정수배"로 바꾼다.
  - 이어서 `docs/plan.md`, `docs/handoff.md`, `docs/HANDOFF.md`를 갱신하고 커밋·push한다.
- **검증**(Haiku): `verify:release-docs`, 계획서 `cmp`, `test:unit`, `git diff --check`, 옛 경로가 남지 않았는지 `git grep`.

## Stage 1 — Todo 48: 대화 키워드 메뉴
- **진행 방식**: plan mode 때문에 멈춘 Todo 48 에이전트(`todo-48-talk-keywords` worktree)를 재개한다. 그 에이전트의 계획을 그대로 따르되 아래 수정을 반영한다.
  - **주제어 뜻 표기**: Todo 37 alias와 맞춘다. `ABYS` = 심연(초안은 어비스).
- **계획 요약**:
  - **주제어 뜻**: 주제어 257개의 한국어 뜻(NPC별 예외 약 17개)을 `glossary.json`에 넣는다. 생성기가 표를 만들고, 네이티브 테이블에는 넣지 않는다.
  - **대화 상태**: `src/dialogue/talk-keywords.ts`가 상대(NPC / Lord British / Hawkwind), 질문 대기, 물어본 키워드를 관리한다.
  - **한국어 입력**: 한국어로 친 주제어 뜻을 현재 NPC의 주제어로 인식한다(`withTopicAliases`).
  - **메뉴**: `#talk-keywords`를 공통 / 이 사람에게 물어볼 것 / 대답의 세 묶음으로 보여 준다. 누르면 입력창 제출과 똑같이 처리하고, 포커스는 가져가지 않는다.
  - **방향 프롬프트**: "대화: 방향?북쪽"을 고친다(백스페이스 4개를 받으면 Korean "방향?"을 지움).
  - **도달 불가 주제어**: `BEH.`는 입력할 수 없어서 메뉴에서 뺀다.
- **검증**:
  - RED 단위 테스트
  - e2e `talk-keywords.spec.ts`: Moonglow, Lord British, 프롬프트가 없을 때 거부
  - 3브라우저
  - 회귀: npc-alias, focus-return, castle-output, side-column, dialogue-panel, game-messages
  - 통합 게이트 단독 실행 → 병합

## Stage 2 — Todo 49 Phase A: 엔진 연결과 순수 모듈 (Stage 1과 병렬 가능, 셸 파일은 건드리지 않음)
1. **크기 계산** `src/overlay/message-area-layout.ts`:
   - 메시지 영역 사각형(TEXT_AREA)과 기기 픽셀 기준 계산식을 둔다.
   - k = floor(상자 높이 ÷ (12×16)), 글꼴 = 16k 기기 픽셀, 12줄, 줄 간격 = floor(높이 ÷ 줄 수).
   - 예상 수용량: 2배 화면 16자×12줄, 1280×720 창 20자×12줄, 1366 창 22자×12줄.
2. **보여 줄 내용** `src/overlay/message-area-view.ts`:
   - 오른쪽 패널과 **같은 PanelState**를 쓰고, 그중 플레이 시작 이후 줄만 보여 준다.
   - 고정폭이라 JS에서 정확히 줄을 바꾼다(한글 2단위, ASCII 1단위). 아래 정렬로 마지막 12줄을 보인다.
   - 입력 중 글자와 커서를 그린다. 선택 키 에코는 임시 칸으로 처리한다.
   - 긴 대답은 "▼"에서 멈춘다.
   - `message-tokens.ts`의 칸에 `kind`(prompt/input)를 추가한다.
3. **제어 전용 메시지 표** `src/dialogue/control-formats.ts`. 각각 오용을 막는 조건을 둔다.
   - `\n`, `\n\n`, `"    \n"` → 줄바꿈
   - `%c` → 0x10일 때만 프롬프트 기호
   - `%c\n` → 영문·숫자 한 글자일 때만
4. **엔진 웹 전용 연결** (`#ifdef __EMSCRIPTEN__`, 받는 쪽은 새 `Module.u4Screen`):

   | 신호 | 넣는 곳 |
   |---|---|
   | `input(id, text)` 입력 중 글자 | `event.cpp:615-644`(ESC 포함) |
   | `choice(ch)` 선택 키 에코 | `event.cpp:715` |
   | `cursor(on)` 커서 | `screen.cpp:1230-1238`, 바뀔 때만 보냄 |
   | `play(on)` 플레이 시작·종료 | `game.cpp:130` 시작, `:115` 종료 |
   | `modal(on)` ESC·일시정지 화면 | `screenSetLayer`에서 `LAYER_TOP_MENU`일 때 |
   | `crlf()` 줄바꿈 | `screenCrLf` 끝. TLK `talkCrLf` 안에서는 꺼서 기존 대화 신호를 바꾸지 않음 |

   - `vendor/source-manifest.json`을 갱신하고 `build:wasm`을 다시 돈다.
5. **시작 연결**: `src/engine/startup.ts`에 `ScreenReceiver`를 추가하고, `callMain` 전에 붙인다. 엔진 종료·중단 시 `play(0)`.
- **검증**:
  - 각 RED 단위 테스트
  - C++ 소스 모양 테스트: 연결이 모두 `#ifdef` 안에 있는지, `talkCrLf`에서 꺼지는지
  - `build:wasm`, `check:build-fresh`, `verify:repo-sources`
  - 네이티브 게이트(`build:native` → `cmake:configure` → `cmake:build` → `test:native`)

## Stage 3 — Todo 49 Phase B: 셸 연결과 화면 (Todo 48 병합 후)
6. **최소 폭 2배 맞추기**: `.viewport`의 `border`를 `outline`으로 바꿔 최소 폭에서 캔버스가 정확히 640×400이 되게 한다(지금은 약 636×396). 덮개 회귀 스펙을 확인한다.
7. **글꼴 파일**: `public/fonts/neodgm.woff2`와 `LICENSE.txt`, `@font-face`. `docs/SOURCE_PINS.md`에 출처·sha256 행을, README에 제3자 글꼴 고지를 넣는다. `pages-static-smoke`에 `.woff2`·`.txt` 형식을 추가하고 글꼴 200 응답을 확인한다.
8. **제어 전용 메시지 연결**: `composeUiMessage`에 연결한다. Todo 48의 백스페이스 지우기와 나란히 둔다.
9. **셸 연결** `src/shell.ts`:
   - `screenReceiver`를 추가하고, prompt가 닫힐 때 입력 글자를 확정한다.
   - 한국어로 제출한 경우 영어 대신 "직업"처럼 한국어로 표시한다.
   - `talk.input` 중복 표시를 없애고, 패널에서는 프롬프트 기호를 그리지 않는다.
   - 성·신단·Codex·상점 입력도 이제 기록에 남는다.
10. **덮개 화면** `src/overlay/message-area-dom.ts`:
    - 항상 켜진 불투명 상자다. 보이는 조건은 스위치 켜짐 + 플레이 중 + 모달 없음이고, 내용과는 상관없다.
    - 화면 갱신은 한 프레임에 한 번으로 묶는다. 화면 낭독기에서는 숨긴다(`aria-hidden`).
    - 색상 클래스는 `.ma-color-*`로 패널과 분리한다.
    - 스위치 체크박스를 둔다(포커스 안 가져감).
    - 모달이 뜨면 `#overlay-layer` 전체를 숨긴다.
11. **긴 대답 페이지 넘김**: 키 입력 리스너가 다음 페이지로 넘긴다.
- **검증**:
  - 신규 실제 엔진 e2e `korean-message-area.spec.ts`. 모든 플레이 프레임에서 덮개가 불투명하고 비어 있지 않으며 위치가 ±1px 안인지 본다. 장면:
    - 인트로에서는 숨김
    - Journey Onward 후 "도움말은 Alt-h"와 프롬프트·커서
    - 걷는 중 연속 5프레임
    - Moonglow 대화: "대화: 북쪽", `job`을 치는 동안 글자와 커서, 한국어 대답, 한국어 제출 시 "직업"
    - 전투
    - 방향 입력 취소
    - 일시정지·ESC 화면에서 숨김 후 다시 표시
    - 메뉴로 나가기·불러오기 진행 막대
    - 스위치 끄기로 영어 복원
    - Lord British 긴 대답의 "▼"
  - 3브라우저
  - 회귀: dialogue-panel, side-column, status-overlay, korean-status/intro-overlay, npc-alias, npc-output, focus-return, castle-output, game-messages, shop, codex, gameplay-progression, save-reload, boot-sequence, i18n-coverage, pages-static-smoke, talk-keywords
  - 통합 게이트 단독 실행, 네이티브 게이트, `audit:dist --require-engine`
  - 계측 보고서 재측정: 남은 번역 누락 목록을 사용자에게 보고
  - 사람의 실제 브라우저 확인

## Stage 4 — Todo 50: 고정폭 글꼴 전체 적용
- 같은 글꼴 크기 계산식으로 다음에 Neo둥근모를 입힌다: 상태창, 음식·금 줄, Ztats·소지품, 인트로, 메뉴, 오른쪽 패널, 키워드 메뉴.
- 바람·던전 방향 줄을 한국어 덮개로 만든다(`screenUpdateWind` 연결, 사각형 56,184 80×8).
- **위험**: 한 줄짜리 상자는 16px 한글이 지금 14px보다 약 14% 넓다. `status-overlay`의 넘침 검사가 걸리면 열 수 계산을 보정해야 한다.
- **검증**: RED 단위 테스트, 덮개 e2e, `document.fonts` 로드 확인, 3브라우저, 통합 게이트, 사람 확인.

## 순서와 병렬
- Stage 0·0b(문서, 바로)
- Stage 1(Todo 48)과 Stage 2(Todo 49 엔진·순수 모듈)를 **병렬**로 진행. 파일이 겹치지 않는다.
- Todo 48 병합 → Stage 3 → Stage 4
- Todo 43(개조 범위)은 사용자 결정 대기
- 통합 게이트는 매 병합 전 단독으로, 동시에 하나만 돌린다.

## 사용자에게 알릴 남는 위험
- **번역 경로 없는 줄**: 덮개 아래에서 영어로도 안 보이게 된다. 스위치로 끄면 보이고, 재측정 보고서로 남은 것을 알린다.
- **화면 흔들림**: 캔버스만 흔들리고 덮개는 고정이라, 1픽셀 정도 어긋나 보일 수 있다.
- **HQX 경계**: 덮개 경계 한 줄에 희미한 번짐이 보일 수 있다.
- **타이머로 나오는 메시지**: 지도 갱신보다 최대 약 0.25초 먼저 나올 수 있다.
- **Windows 125% 배율**: 줄 간격이 다소 넓어 보인다. 보신 뒤 촘촘한 옵션을 고를 수 있다.
- **영어 입력**: 직접 친 영어(키워드, 치트)는 영어로 표시된다.

## 새 Claude Code 세션 시작 프롬프트 (Stage 0·0b 완료 후)
짧은 버전:
```
docs/README.md 읽고 다음 작업 준비해. 준비되면 진행해.
```
자세한 버전:
```
이 저장소는 Ultima IV 웹 한글판(xu4 → WASM) 프로젝트야.
1. docs/README.md를 먼저 읽고, 거기 적힌 순서대로 AGENTS.md, docs/plan.md "바로 다음 순서",
   docs/plans/README.md의 "진행 중" 계획 문서, docs/handoff.md 마지막 절을 읽어.
2. 가장 앞에 있는 미완료 단계 하나를 골라, 무엇을 할지·어떤 파일을 바꿀지·어떻게 검증할지 짧게 정리해.
3. 정리되면 묻지 말고 진행해. 규칙: 단계마다 진행→저장(커밋)→기록(docs/plan.md, docs/handoff.md, docs/HANDOFF.md)→확인,
   TDD로 RED 먼저, 테스트·게이트는 항상 Haiku 서브에이전트가 실행, 통합 게이트(npm run verify:integration)는 단독 실행,
   원본 게임 데이터·영어 원문은 절대 커밋하지 않기.
4. 단계가 끝나면 진행률 변화와 다음 단계만 짧게 보고해.
```
