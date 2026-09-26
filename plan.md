# Ultima IV 웹 한글판 — 진행 계획
기준 시각: 2026-09-24 KST · 기준 main: `bf87961` 이후 (origin과 동기화) · **2026-09-24 재계획 반영** (아래 "재계획 요약")

## 목표
원본 `ultima4.zip`을 사용자가 브라우저에서 직접 선택해 플레이하는, 한국어 UI/대화/NPC 키워드 alias와
실제 음악·효과음을 갖춘 Ultima IV(xu4 엔진)를 GitHub Pages(`https://taejinkim7-dev.github.io/ultima/`)
정적 사이트로 배포한다. 원본 게임 데이터는 절대 배포/커밋하지 않는다.

## 재계획 요약 (2026-09-24)
- **핵심 발견**: 지금 `build/wasm-release/xu4.wasm`에는 **게임 엔진 코드가 하나도 없다.** `llvm-nm --defined-only`로 확인한 정의 함수는 약 251개이고 전부 libc/libc++ 런타임 + 브릿지 export 2개(`u4_web_enqueue_key`, `u4_web_submit_text`)다. 원인: wasm 빌드가 엔진 소스 74개 중 29개만 컴파일하고, `scripts/web-main.cpp`의 `main()`이 즉시 `return 0`이라 링커가 도달 불가능한 엔진 코드를 전부 제거했다.
- 그래서 Step 6~9의 ✅는 "각자의 승인 기준(export 존재·별도 셰이더 하네스·큐 유닛 테스트·시작 시퀀스)을 통과했다"는 뜻일 뿐, **실제 엔진이 브라우저에서 돈 적은 없다.** 사용자 결정으로 ✅는 유지하되 아래 표에 **"실제 게임에서 확인" 열을 추가**해 두 수준을 분리 표시한다.
- Todo 21을 "실제 xu4 엔진을 wasm에 링크·실행"으로 **본문을 다시 썼고**(기존 본문의 "web-stub.cpp를 통해 부팅"은 틀린 방향이었음 — 그 stub 이름 다수가 실제 헤더에 없거나 링크가 다름), 세부 단계 **21.1~21.4**로 쪼갰다. 이게 이제 유일한 크리티컬 패스다.
- Todo 19(Pages workflow)의 **골격**은 엔진과 무관하므로 Todo 21과 병렬로 먼저 시작할 수 있게 했다(완료 판정은 기존 선행조건 15·16·18 유지).
- 정리 작업: merge된 worktree 8개 제거(브랜치는 유지, 로컬 evidence는 main의 `.omo/evidence/`로 먼저 복사), Node 22 LTS(v22.23.3)를 사용자 홈에 설치해 전환(`~/.local/opt/node22`, `~/.profile`/`~/.bashrc` PATH) — Node 22에서 유닛 13 files/99 tests·typecheck·build·verify·e2e 8개 전부 통과, EBADENGINE 경고 사라짐.

## 진행률 계산법
- 전체 25단계 = 구현 1~21 + 최종 검증 F1~F4 (Todo 수는 `.omo/plans/ultima-web.md` 기준, 늘어나면 같이 늘어남). 단계마다 가중치 동일.
- **승인 기준 진행률** = 완료(✅) 단계 수 ÷ 25. 부분 진행(🟡)은 0.
- **"실제 게임에서 확인"** = 그 단계의 기능이 *브라우저에서 실제 xu4 엔진이 돌 때* 동작함을 확인했는가(✅/⬜, 엔진과 무관한 단계는 —). 진행률 숫자에는 안 들어가고, 현실 체크용이다.
- 완료 기준 = acceptance criteria 통과 + `main` merge 전 로컬 검증 게이트 통과(AGENTS.md).
- 세부 정의(References/Acceptance/QA)는 `.omo/plans/ultima-web.md`의 같은 번호 항목이 원본이다.

## 현재 진행률
- **승인 기준: 17 / 25 = 68.0%** (Step 1~16, 21 ✅ — Todo 15 완료).
- **실제 게임에서 확인 (2026-09-26 갱신): 브라우저에서 실제 엔진으로 확인됨 — Step 7(WebGL2 렌더), 8(실제 GLFW 입력), 9(브라우저 시작), 10(저장/재로드/export-import), 13(실제 NPC 대화 + 한국어 alias), 16(실제 Web Audio 음악/RFX 효과음), 21(링크·FS·렌더·입력 전부).** 근거: `tests/e2e/boot-sequence.spec.ts`가 실제 `ultima4.zip`으로 실제 타이틀 화면 렌더 + 키 입력 2회로 `IntroController`의 실제 상태 전이(INTRO_TITLES→INTRO_MAP→INTRO_MENU)까지 확인(`.omo/evidence/ultima-web/task-21/title-render.png`). (Step 12·14는 Todo 11과 같은 사유로 ⬜: 실제 엔진이 status/menu/message bridge 이벤트를 아직 안 보냄.)
- **Step 10 완료 (2026-09-25): 저장·재로드·export/import 전부 증명됨.** `tests/e2e/save-reload.spec.ts`가 실제 캐릭터 생성(이름/성별/스토리 24화면/미덕 질문 최대 20라운드)을 Playwright로 끝까지 자동화해 실제 `party.sav` write → IDBFS 동기화(`#save-status`="저장 완료") → 페이지 리로드 → "Journey Onward" → 실제 게임 월드(파티 이름 "avatar", 골드 200 등) 진입을 스크린샷으로 확인(`.omo/evidence/ultima-web/task-10/save-reload-after-journey.png`). IDBFS 실패 시나리오도 실제 `window.indexedDB` 제거로 확인. **Export/import도 이번에 실제로 연결**: `src/shell.ts`에 `attachSaveHandlers()`를 추가해 `main.ts`가 `startEngine()` 성공 시 `persistence.ts`의 실제 `exportSaveArchive`/`importSaveArchive`를 넘겨주고, 다운로드된 아카이브가 실제 "U4SV" 매직 바이트로 시작하며 재가져오기가 라운드트립되는 것까지 e2e로 확인(`.omo/evidence/ultima-web/task-10/export-reimport.dat`).
- **Step 11 완료 (2026-09-25, 병렬 백그라운드 에이전트)**: 긴 메시지를 HTML 대화 패널로 라우팅. 실제 `screen.cpp` 메시지 바이트(줄바꿈/백스페이스/커서이동/색상)를 `message-tokens.ts`로 토큰화, `PanelState`가 dispatch 호출 간 지속(엔진 출력이 줄 단위가 아니라 조각 단위로 옴), Hawkwind류 pause는 `MessageBridgeEvent.awaitKey`로 별도 전달(ABI v1에 additive). `createElement`/`textContent`만 사용(e2e로 innerHTML 계열 미호출 증명, 악성 `&lt;script&gt;` 주입 텍스트도 무해하게 렌더됨을 확인).
- **Step 12 완료 (2026-09-26, branch `todo-12-status-overlay` → main merge)**: status/menu/textview DOM 오버레이. `src/overlay/overlay-layout.ts`(순수 `OverlayRegistry` + DPR/letterbox 인식 수학), `ViewBridgeEvent`에 `rows`/`selectedIndex`를 ABI v1에 additive로 추가, `src/shell.ts`가 canvas 실측 박스(ResizeObserver)로 오버레이 위치/글자크기 갱신. 실제 엔진은 여전히 status/menu bridge 이벤트를 안 보내므로 e2e는 synthetic dispatch로 검증 — "실제 게임에서 확인" ⬜ (Todo 11과 동일 사유).
- **Step 14 완료 (2026-09-26, branch `todo-14-localization-runtime` → main merge)**: `scripts/i18n-generate.mjs`가 `locales/ko/*.json`을 정적 테이블(`src/i18n/generated/strings.ts`, `native/i18n/u4_i18n_table.inc`, `native/i18n/ko-overlay.b`)로 변환(ready만, pending은 영어 fallback — corpus는 Todo 15). TS 경계 `src/i18n/localization.ts`(resolveDisplayText/hasTranslation/placeholder-match/width/command-key 판정) + C 경계 `native/i18n/u4_i18n_lookup.{h,c}`(screenMessageN/TLK/binary seam 문서화) + `window.ultimaI18n` 노출. e2e는 synthetic + 실제 wasm 부팅 위에서 한국어 표시/영어 로직/placeholder 불일치 loud-fail 검증 — "실제 게임에서 확인" ⬜ (11·12와 동일 사유).
- **Step 16 완료 (2026-09-26, 병렬 백그라운드 에이전트)**: Todo 21.1의 무음 `sound.h` 스텁을 실제 `vendor/xu4/src/sound_web.cpp`(Web Audio 백엔드)로 교체. `tests/e2e/audio.spec.ts`가 실제 `ultima4.zip`으로 AudioContext unlock, 실제 음악 재생(94초 트랙, 자동 트리거), 실제 RFX 합성 효과음(Configure 메뉴 화살표/닫기 키), pause/resume, 생성-취소(stale decode) 경합 시나리오까지 확인(`.omo/evidence/ultima-web/task-16/{audio-summary.json,audio-generation-race.log}`). 실제 버그 발견·수정: `module.c`의 `mod_addLayer()`가 모든 `CDIEntry`의 `cdi` 하위 바이트를 레이어 번호로 덮어써서 RFX 포맷 판별이 깨짐 — `CDI_MASK_FORMAT`로 상위 2바이트만 비교하도록 수정(vendor 원본은 안 건드림, 새 `sound_web.cpp` 안에서만 마스킹).
- **Step 13 완료 (2026-09-26, branch `todo-99-settings-abort` + `todo-13-e2e` → main merge)**: 한국어 NPC alias + prompt별 입력 규칙 코드 자체는 이미 main에 있었으나(`80ce1ac`), e2e happy path가 WASM 전용 `Aborted(RuntimeError: unreachable)` 크래시로 장기간 구조적 차단돼 있었다. **근본 원인을 찾아 고쳤다**: Emscripten의 GLFW 웹 포트가 `screen_glfw.cpp`의 키/마우스 콜백을 브라우저 DOM 이벤트에서 직접·동기적으로 호출하는데, 이게 `EventHandler::run()`의 Asyncify 프레임 루프가 `emscripten_sleep()` 중간에 unwind된 채 대기 중인 시점과 완전히 무관하게 일어난다. 그 콜백이 중첩 Controller(메뉴/치트메뉴 탐색 → `runMenu()`의 재진입 `EventHandler::run()`)를 여는 코드에 도달하면 그 중첩 호출도 Asyncify로 suspend되는데, Asyncify는 전역으로 단 하나의 suspend만 지원한다 — 이미 대기 중이던 메인 루프의 sleep 콜백이 고아가 되고, 그 stale 타이머가 나중에 발화하면 이미 재사용/해제된 `Asyncify.currData`로 재개를 시도해 런타임이 abort된다. 진단: `-sASYNCIFY_STACK_SIZE` 1MB→16MB로도 동일 크래시(스택 크기 무죄), 컴파일된 glue를 패치해 원본 trap을 찍어보니 `asyncify_start_rewind`의 자체 sanity check(`stack_ptr > stack_end`)였고, SLEEP/WAKE 트레이스로 `PENDING-ON-ENTRY`(이미 대기 중인 sleep이 있는데 새 sleep이 또 시작됨)를 실측 확인, 최종적으로 `Asyncify.currData`가 크래시 직전 `null`이었음을 확인(힙 손상이 아니라 orphan 콜백임을 증명). 수정: `keyHandler`/`dispatchEvent`가 이제 이벤트를 큐에만 넣고, `EventHandler::handleInputEvents()`가 자신의 `glfwPollEvents()` 호출 직후(네이티브가 이 콜백들을 동기 처리하는 바로 그 지점)에 큐를 drain — 네이티브 빌드는 `#ifdef __EMSCRIPTEN__`로 완전히 무영향. 신규 회귀 스펙 `tests/e2e/configure-menu-no-abort.spec.ts`(RED로 재현 확인 후 GREEN) + 기존 `korean-npc-alias.spec.ts`의 실제 happy-path(영어 "health" → 한국어 "건강" alias → "bye") 최초로 끝까지 통과(2.8분). `vendor/source-manifest.json` xu4 treeSha256 갱신.

## 단계 목록

### Wave 1 — 기반 (1~5)
| # | 단계 | 승인 기준 | 실제 게임에서 확인 | 비고 |
|---|---|---|---|---|
| 1 | 소스 동결 + 웹 test harness | ✅ | — | main `36a128e` |
| 2 | host Boron 빌드 + xu4 모듈 패키징 | ✅ | — | main `f84b5f5` |
| 3 | native GLFW 기준선(원본 데이터로 실제 플레이) | ✅ | ✅ (native) | main `13a3969` |
| 4 | 영어 원문 inventory + 한국어 스키마 | ✅ | — | main `ada0a6d` (4411 entries, 4402 pending) |
| 5 | 브라우저 셸 + bridge ABI v1 + Pages 자산 계약 | ✅ | ⬜ | main `0a1408a` — 셸은 브라우저에서 동작, 엔진이 bridge 이벤트를 실제로 보낸 적은 없음 |

Step 3 완료 (2026-09-24):
- 3.1 ✅ native 빌드, missing/corrupt ZIP CTest, 잘못된 ZIP hash 차단, 새 게임→이동→save→재시작/load 자동 QA
- 3.2 ✅ NPC 접근: 매 스텝 4방향 talk sweep + Backspace 16회 clear 가드, 6×Right→Calabrini 대화 완주
- 3.3 ✅ `e` 직후·talk sweep 직후 CHECKPOINT(Enter towne!/You meet) 로그, greeting 없으면 실행 폐기
- 3.4 ✅ name/health/bye 키워드 응답 스크린샷 확보, save+reload 검증
- 3.5 ✅ main(Todo 4/5 4커밋) 병합 + 충돌 해결(pacakge.json/handoff.md/계획서)
- 3.6 ✅ clean 전체 게이트 재실행(rm -rf build 후 전체 파이프라인) + handoff 기록 + 체크박스 동기화

### Wave 2 — WASM 이식 (6~10, 21)
| # | 단계 | 승인 기준 | 실제 게임에서 확인 | 비고 |
|---|---|---|---|---|
| 6 | 단일 스레드 wasm Boron + xu4 core 빌드 (Emscripten 4.0.23, Asyncify) | ✅ | ⬜ | main `c836ecc` (`26f7164`) — 29/74 소스만 컴파일, 링크된 엔진 코드 0 |
| 7 | OpenGL → WebGL2 (glMapBufferRange 제거, CPU staging + glBufferSubData) | ✅ | ✅ | main `874c775` (`90232b9`) — 21.2~21.3에서 실제 엔진의 `gpu_opengl.cpp`(`__EMSCRIPTEN__` 분기)로 실제 렌더 확인. GL_RGB/RGBA 텍스처 포맷 버그(21.2~21.3에서 발견) 수정 포함 |
| 8 | blocking event loop / 키 입력 → 브라우저 안전 queue (IME, request ID) | ✅ | ✅ | main `6b97d8e` (`af13814`) — 큐 자체는 여전히 실제 엔진이 안 씀(GLFW 자체 리스너가 정식 경로, 21.4 참고). "실제 게임에서 확인"은 큐가 아니라 Step 8이 만든 DOM 키 파이프라인이 실제로 키를 전달한다는 뜻으로 ✅ |
| 9 | 브라우저 시작 시퀀스 + 원본 ZIP 검증 + 가상 FS, main 1회 실행 | ✅ | ✅ | main `5c28511` (`4c878c9`) — 21.2에서 FS 경로 재작성 후 실제 `main()` 실행 확인(`tests/e2e/startup-data.spec.ts` 전체 통과) |
| 10 | IDBFS 세이브/설정 영속 + export/import | ✅ | ✅ | main `92ebce8` (`6a74288`) + 2026-09-25 완료 — `tests/e2e/save-reload.spec.ts`(신규)로 실제 캐릭터 생성→저장→리로드→Journey Onward 로드, `src/shell.ts`에 `attachSaveHandlers()` 추가로 export/import를 실제 `persistence.ts` 함수에 연결(다운로드가 실제 "U4SV" 아카이브, 재가져오기 라운드트립 확인) |
| 21 | **실제 xu4 엔진을 wasm에 링크·실행** (재작성, 세부 21.1~21.4) | ✅ | ✅ | branch `todo-21-real-engine` `542ce34`, `70d14db` — 21.1~21.4 전부 완료, 실제 `ultima4.zip`으로 타이틀 렌더 + 키 입력 확인 |

Todo 21 세부 단계 (각각 자체 게이트, 넷 다 통과해야 Todo 21 완료 — **전부 완료**):
- 21.1 ✅ **링크 성공** — branch `todo-21-real-engine` 커밋 `542ce34`. 네이티브 `Makefile.common` 소스 목록(69개, UI=glfw → `screen_glfw.cpp`/`-sUSE_GLFW=3`, CONF=boron) 그대로 + 실제 `xu4.cpp` + 무음 `scripts/web-sound-silent.cpp`(sound.h 전체 no-op)로 링크. `web-stub.cpp`/`web-main.cpp` 삭제. `-DVERSION` 따옴표 버그 수정(spawnSync는 셸을 거치지 않아 싱글쿼트가 그대로 매크로 텍스트에 들어갔었음). 첫 링크에서 실제로 걸린 두 문제: (1) `gpu_opengl.cpp`의 `GPU_RENDER` 맵청크 경로가 `map.h`를 안 받고 있었음(네이티브는 `GPU_RENDER`를 기본으로 안 켜서 한 번도 컴파일된 적이 없던 코드) → `build-wasm.mjs`가 **build-dir 복사본만** 패치(vendor/xu4는 tree-hash pinned라 원본은 안 건드림). (2) `sound.h`가 `uint16_t`를 전방선언 없이 씀 → `web-sound-silent.cpp`에 `<cstdint>` 추가. 검증: `npm run build:wasm -- --debug` exit 0, `xu4.wasm` 7.5MB(이전 스텁 빌드 대비), `llvm-nm --defined-only`로 정의 심볼 2832개(이전 ~251개) 확인, `GameController`/`IntroController`/`EventHandler` 등 실제 엔진 심볼 존재. `npm run test:unit`(13 files/99 tests) · `verify:repo-sources`(4 components) · `typecheck` · `build` · `git diff --check` 전부 exit 0. (`gpu_opengl.cpp`·`discourse_tlk/castle.cpp`·`config_data.cpp`·`script_boron.cpp`는 각각 다른 파일이 `#include`하므로 소스 목록에 따로 안 넣음, 계획대로.)
- 21.2 ✅ **FS/경로 해결** — branch `todo-21-real-engine` 커밋 `70d14db`. `render.pak`/`Ultima-IV.mod`/`ultima4.zip`을 wasm FS **루트**에 씀(`u4find_path`/`u4find_pathc`가 resourcePaths[0]="."과 결합해 가장 먼저 찾는 경로임을 실제 엔진 실행으로 실증 확인 — 추측 아님). `Module.ENV.HOME`을 `preRun` 콜백으로 `/persist`로 설정(팩토리 프라미스가 resolve된 뒤에는 이미 getenv 캐시가 굳어서 늦음, 실측으로 확인)해 `Settings::init`의 실제 userPath(`$HOME/.xu4/`, `__unix__`지만 `__linux__`는 아님을 확인)를 Todo 10 IDBFS 마운트 밑으로 옮김. 이 과정에서 실제 실행 중 발견한 버그 3개를 추가로 고침: `-sFS_DEBUG=1` 누락(Todo 10의 `FS.trackingDelegate` 자체가 이 플래그 없인 아예 안 생김), `build/host/modules/render.pak`이 Step 2 이후로 낡아서 `npm run build:modules` 재실행과 다른 바이트를 냄(재빌드로 해결), `gpu_opengl.cpp`의 `screenTex` GL_RGB/GL_RGBA 포맷 불일치(데스크톱 GL은 조용히 봐주지만 WebGL2는 `GL_INVALID_OPERATION`). `vendor/xu4/src/gpu_opengl.cpp`·`support/getTicks.c` 수정은 Todo 7/8이 이미 세운 전례(vendor 직접 수정 + `vendor/source-manifest.json` treeSha256 갱신, 같은 커밋)를 따름.
- 21.3 ✅ **타이틀 화면 렌더** — `Module.canvas`를 `#game-canvas`에 연결(`src/main.ts`). 실제 `ultima4.zip`으로 "Lord British and Origin Systems, Inc. present Ultima IV: Quest of the Avatar" 타이틀 화면이 실제로 렌더됨(`.omo/evidence/ultima-web/task-21/title-render.png`). 21.2에서 고친 GL_RGB/RGBA 버그가 이 단계에서 나온 것.
- 21.4 ✅ **실제 입력** — 코드 변경 불필요: GLFW 포트가 자체 DOM 키 리스너로 `IntroController::keyPressed()`에 실제 키를 전달함(`screen_glfw.cpp`의 `glfwSetKeyCallback`). `web_bridge`/Todo 8 큐는 실제 엔진 어디에서도 소비되지 않음(`grep`으로 확인) — 다만 Step 8 자체 e2e 계약과 향후 Todo 13(한국어 IME 텍스트 입력)을 위해 `main.ts`에 그대로 남겨둠. 실제 검증: 키 입력 2회로 `IntroController`의 실제 상태 전이(INTRO_TITLES→INTRO_MAP→INTRO_MENU, 지도 애니메이션이 사라지고 실제 영어 메뉴 텍스트가 나타남) 확인 — 애니메이션 자체 진행과 혼동되지 않는, 코드로 확인된 이산적 전이.
- 이번에 한 것: `tests/e2e/boot-sequence.spec.ts`(신규) happy/failure 경로 둘 다, `src/main.ts`의 모듈 자산 fetch에 `response.ok` 검사 추가(전엔 404여도 조용히 통과), `startup.ts`에 `Module.onExit`/`onAbort` 연결(전엔 엔진이 죽어도 "시작됨"으로 잘못 보고).
- 아직 안 한 것(Todo 21 자체 완료 기준 밖, Todo 10 자체 완료 기준): Step 10의 `tests/e2e/save-reload.spec.ts` — 실제 저장을 일으키려면 캐릭터 생성(다수의 가상/이름 입력 프롬프트) 흐름이 필요해서 이번 세션엔 보류.

### Wave 3 — 한국어화 (11~15)
| # | 단계 | 승인 기준 | 실제 게임에서 확인 | 선행 |
|---|---|---|---|---|
| 11 | 긴 메시지 → 하단 HTML 대화 패널 (textContent만) | ✅ | ⬜ | 5,9,21 |
| 12 | status/menu → DOM overlay (DPR/letterbox) | ✅ | ⬜ | 5,9,11,21 |
| 13 | 한국어 NPC alias + prompt별 입력 규칙 | ✅ | ✅ | 8,9,11,21 — main `cf0a690`(abort 수정 merge) + `a88d9e4`(e2e spec merge) |
| 14 | C++/Boron/TLK/binary/JS 번역 lookup 런타임 연결 | ✅ | ⬜ | 4,11,12,13 |
| 15 | 전체 한국어 번역 corpus + glossary 일관성 (`i18n:check --strict`) | ✅ | ✅ | 4,14 — 4411/4411 pending 0, `npm run i18n:check -- --strict` exit 0. `tests/e2e/korean-progression.spec.ts`가 실제 `ultima4.zip`으로 semantic Korean coverage(인트로/저장 UI/Moonglow NPC/Lord British/shrine/Codex) + 실제 새 게임 저장→Journey Onward 재로드를 검증 |

### Wave 4 — 완성/배포 (16~20)
| # | 단계 | 승인 기준 | 실제 게임에서 확인 | 선행 |
|---|---|---|---|---|
| 16 | Web Audio 음악/효과음 + RFX 생성 | ✅ | ✅ | 6,9,21 (21.1의 무음 구현을 교체) — branch `todo-16-web-audio` `541d6ca`, main에는 아직 merge 안 함 |
| 17 | 브라우저 통합 게임 진행 e2e (새 게임부터) | ⬜ | ⬜ | 10,12,13,15,16,21 |
| 18 | 실패/보안/개인정보/회귀 경계 강화 (`audit:dist`) | ⬜ | ⬜ | 17 |
| 19 | GitHub Actions Pages workflow + `/ultima/` release artifact | 🟡 | — | 15,16,18 (골격 완성, 브랜치 `todo-19-pages-workflow`, main 미merge) |
| 20 | README/사용자 가이드/증거 인덱스/handoff | ⬜ | — | 19 |

### Final — 독립 검증 (F1~F4 = 진행률 22~25번째)
| # | 단계 | 상태 |
|---|---|---|
| F1 | 계획 준수 감사 | ⬜ |
| F2 | 코드 품질 리뷰 | ⬜ |
| F3 | 실제 브라우저 수동 QA (Chromium/Firefox/WebKit) | ⬜ |
| F4 | 범위 충실도 (정적 호스팅, 원본 데이터 미포함) | ⬜ |

## 완료 기록 (시간순)

Step 7·8 main merge 완료 (2026-09-24):
- 7 ✅ merge `874c775 Merge todo-07-webgl2: WebGL2-safe buffers and shaders` (구현 `90232b9`)
- 8 ✅ merge `6b97d8e Merge todo-08-input-queue: browser-safe input queues` (구현 `af13814`)
- `vendor/source-manifest.json` treeSha256 충돌 → 합친 vendor로 재계산 resolve: xu4 **fileCount 409**, treeSha256 `e65f0d9b616f9e28923a5e6dfd61b481848832ac3a5f2ce3b0f2169d73b25b49` (`match:true`)
- worktree evidence는 main `.omo/evidence/ultima-web/task-{7,8}/`로 복사(git-ignored, local-only)
- 상세 acceptance·QA·RED/GREEN은 `handoff.md` "Todo 7/8 main merge 완료 기록" 참고

merge 게이트 (2026-09-24, main, 전부 실제 실행 · exit 0):
```
npm ci                                      # 0
npm run test:unit                           # 0 — 10 files / 73 tests
npm run verify:repo-sources                 # 0
npm run typecheck                           # 0
npm run build                               # 0
git diff --check                            # 0
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md  # 0
npm run deps:wasm                           # 0
npm run build:wasm -- --debug               # 0 — 33/33 sources, xu4.wasm 3599061 B
npm run test:unit -- tests/unit/wasm-symbols.test.ts  # 0 — 8/8
npm run test:unit -- tests/unit/input-queue.test.ts   # 0 — 16/16
npm run cmake:configure && npm run cmake:build        # 0
ctest --test-dir build/native --output-on-failure     # 0 — 3/3 (module-package, native-baseline-negative, input-queue)
npm run test:native -- -R input-queue       # 0 — Passed
npx playwright test --project=chromium      # 0 — 3 passed (shell-ready, input-queue, webgl-render)
```
- build/wasm-release/build.log: Asyncify enabled, 금지어(pthread/libfaun/libpulse/GL) 없음
- 실패 배제 확인: 병렬 `npm ci`와 동시에 돌린 1회 unit/e2e는 node_modules 교체 충돌로 실패했으나, npm ci 종료 후 순차 재실행으로 전부 통과(위 exit code가 최종 상태)

Step 9 main merge 완료 (2026-09-24):
- 9 ✅ merge `5c28511 Merge todo-09-startup-data: browser startup, ZIP validation, virtual FS` (구현 `4c878c9`)
- `src/engine/zip.ts`(브라우저용 순수 ZIP 중앙 디렉터리 파서 + `validateUltima4Zip`), `src/engine/startup.ts`(`noInitialRun` → FS 준비 → IDBFS mount+populate → ZIP 검증/주입 → 오디오 unlock(best-effort) → `callMain` 1회, 계획 순서 그대로), `vite.config.ts`(생성된 `build/wasm-release/{xu4.mjs,xu4.wasm,modules/*}`만 화이트리스트로 `/engine/`에 서빙+`dist/engine/`에 복사 — 그 디렉터리가 xu4 소스 전체의 컴파일 스테이징 사본이기도 해서 통짜 복사는 안 됨, 처음 시도에서 발견하고 고침), `src/main.ts`(rom-picker → `startEngine` 1회 호출 배선, `data-engine-started`/`data-engine-start-reason` e2e 관측 속성)
- `.gitignore`: `engine/` → `/engine/`로 루트 앵커링 수정 — 앵커 없는 규칙이 새로 만든 `src/engine/`을 통째로 무시하고 있었음(다른 항목들은 전부 앵커돼 있었음, 기존 불일치를 바로잡음)
- e2e 5개 시나리오(happy/missing-files/corrupted/sha-mismatch-allow/reload) 전부 실제 실행·통과, happy path는 실제 검증된 `ULTIMA4_DATA`(529099 bytes)로 확인. 스크린샷 `.omo/evidence/ultima-web/task-9/startup-title.png`.
- **정직하게 남기는 한계**: `scripts/web-main.cpp`의 `main()`은 여전히 Step 6의 placeholder(즉시 return 0)라서, 지금 "엔진 시작" 성공은 화면에 실제 타이틀 화면을 그리는 게 아니다(스크린샷 캔버스는 검은 화면). 실제 xu4 부팅 시퀀스(servicesInit/config/screen/이벤트 루프) 이식은 이 Todo의 파일 범위 밖(빌드 스크립트 주석에 명시)이며 후속 통합 작업이다.
- **로컬 merge만 완료, origin push는 아직 안 함** — 사용자 확인 대기 중(아래 "바로 다음 순서" 참고). 이전 Step 7/8까지는 매번 push 전 사용자 승인을 받는 절차였는데, 이번엔 로컬 merge까지 진행한 뒤에야 확인 요청으로 넘어갔다 — AGENTS.md 진행 관리 규칙("merge는 멈추고 물어봐")과 어긋난 처리였다는 점을 다음 세션을 위해 남겨둔다.
- 상세 acceptance·QA·RED/GREEN은 `handoff.md` "Todo 9 main merge 완료 기록" 참고
- 병렬로 Step 10/16/11-13 설계 조사 메모 작성 완료(읽기 전용, 코드 미변경): `.omo/drafts/step-10-idbfs-design.md`, `.omo/drafts/step-16-web-audio-design.md`, `.omo/drafts/step-11-13-korean-ui-design.md`

merge 게이트 (2026-09-24, main, Step 9 merge 후 전부 재실행 · exit 0):
```
npm ci                                      # 0
npm run test:unit                           # 0 — 12 files / 87 tests
npm run verify:repo-sources                 # 0
npm run typecheck                           # 0
npm run build                               # 0
git diff --check                            # 0
cmp .omo/plans/ultima-web.md docs/ULTIMA_WEB_PLAN.md  # 0
npm run deps:wasm                           # 0
npm run build:wasm -- --debug               # 0 — 33/33 sources
npm run test:unit -- tests/unit/wasm-symbols.test.ts  # 0 — 8/8
npm run cmake:configure && npm run cmake:build        # 0
ctest --test-dir build/native --output-on-failure     # 0 — 3/3 (module-package, native-baseline-negative, input-queue)
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium  # 0 — 8 passed
```

Step 10 main merge 완료, 부분 (2026-09-24):
- 10 🟡 merge `92ebce8 Merge todo-10-idbfs-persistence: IDBFS persistence coordinator + save archive (partial)` (구현 `6a74288`)
- **사용자 결정 (AskUserQuestion)**: Step 9가 남긴 "web-main.cpp의 main()이 아직 placeholder" 문제 때문에 Step 10의 e2e 승인 기준(실제 새 게임 저장→reload→export/import를 브라우저에서 증명)을 지금 만들 수 없다는 걸 발견 → 사용자가 "Persistence Coordinator만 먼저 구현(유닛 테스트로 완전히 검증), e2e는 xu4 부팅 이식 후로 미루기"를 선택함.
- `src/engine/persistence.ts`: `createPersistenceCoordinator()`(단일 `FS.trackingDelegate.onCloseFile` 훅으로 gameSave/신규 캐릭터 생성/Settings::write 전부 관찰 — 설계 메모의 1안. 마이크로태스크 디바운스로 같은 틱의 여러 close를 syncfs 1회로 합침), `packSaveArchive`/`unpackSaveArchive`(이 프로젝트 자체의 최소 바이너리 번들 포맷, 진짜 ZIP 아님 — 세이브가 고정 바이트 레이아웃이라 그대로 왕복해야 함), `exportSaveArchive`/`importSaveArchive`.
- `tests/unit/persistence.test.ts`: RED(모듈 없음) → GREEN, **12 tests**. 설계 메모의 RED 후보 항목(단일/동시 close 합치기, 무관 경로 필터, saving→saved 순서, sync 실패 시 "saved" 오보 안 함, flush 무대기, 아카이브 왕복, 손상 아카이브는 throw 대신 error 상태) 전부 커버.
- **아직 안 한 것(의도적, 다음 결정 필요)**: `src/shell.ts`의 `save-export`/`save-import` placeholder를 실제 `exportSaveArchive`/`importSaveArchive`로 연결하지 않았다 — `startEngine()`이 FS/module 참조를 호출자에게 안 넘겨줘서 연결할 대상이 없고, 실제 세이브 데이터도 없어서 지금 연결해도 빈 아카이브만 오간다. e2e(`tests/e2e/save-reload.spec.ts`)도 아직 없다.
- 전체 게이트(main, merge 후 재실행): `npm run test:unit`(13 files/99 tests) · `verify:repo-sources` · `typecheck` · `build` · `git diff --check` · `cmp` 계획서 두 벌 — 전부 exit 0. `npx playwright test --project=chromium`(기존 8개, 무회귀) exit 0.
- 상세는 `handoff.md` "Todo 10 main merge 완료 기록(부분)" 참고.

Todo 21 신규 추가 완료 (2026-09-24, 사용자 지시 "main() 이식은 별도 Todo로 새로 만들어"):
- `.omo/plans/ultima-web.md` + `docs/ULTIMA_WEB_PLAN.md`에 Todo 21("Port the real xu4 boot sequence into the web entry point")을 Todo 20 뒤, Final verification wave 앞에 추가(byte-identical, cmp 확인). 기존 Todo 1~20 번호/내용은 안 건드림(관례상 "헤더 재작성 금지" 유지, append만 함).
- 의존성 매트릭스에 `21 | 6,8,9 | 10(e2e), 11,12,13,17` 행 추가. `AGENTS.md`의 진행률 산식 설명을 "24" 하드코딩 대신 "`.omo/plans/ultima-web.md`의 Todo 개수 기준"으로 바꿔서 앞으로 Todo가 또 늘어도 다시 안 고쳐도 되게 함.
- 전체 단계 수 24 → **25**로 갱신(구현 21 + F1~F4).
- (정정, 2026-09-24 재계획) 이때 쓴 Todo 21 본문의 "web-stub.cpp를 통해 부팅" 방향은 틀렸다 — 재계획에서 "네이티브 소스 목록 + 실제 xu4.cpp로 링크"로 본문을 다시 썼다(위 "재계획 요약" 참고).

Todo 21 완료 (2026-09-25, branch `todo-21-real-engine`, main에는 아직 merge 안 함):
- 21.1 ✅ 커밋 `542ce34` — 실제 엔진 링크(69개 소스), `llvm-nm`으로 2832개 심볼 확인. 자세한 내용은 위 "Todo 21 세부 단계" 참고.
- 21.2~21.4 ✅ 커밋 `70d14db` — FS/경로(render.pak·Ultima-IV.mod·ultima4.zip을 FS 루트에, `ENV.HOME`을 `/persist`로), 타이틀 렌더(`Module.canvas` 연결), 실제 입력(코드 변경 없이 GLFW 경로로 확인). 과정에서 실제 버그 4개 발견·수정: `-sFS_DEBUG=1` 누락(Todo 10 트래킹 자체가 안 됨), `render.pak` 낡음(재빌드), `gpu_opengl.cpp` GL_RGB/RGBA 포맷(WebGL2 `GL_INVALID_OPERATION`), `getTicks.c`의 `msecSleep`이 `nanosleep`으로 블로킹(브라우저 탭이 완전히 멈춤 — Asyncify `emscripten_sleep`으로 교체).
- `vendor/xu4/src/gpu_opengl.cpp`·`support/getTicks.c` 직접 수정 + `vendor/source-manifest.json` treeSha256 갱신(Todo 7/8이 세운 전례를 따름, 같은 커밋).
- 신규 `tests/e2e/boot-sequence.spec.ts`: 실제 `ultima4.zip`으로 타이틀 화면 비검은색 렌더 + 키 입력 2회로 `IntroController` 실제 상태 전이(INTRO_TITLES→INTRO_MAP→INTRO_MENU) 확인. 실패 경로: `render.pak` 404 → `runtime-error` 이벤트(이 과정에서 `main.ts`의 모듈 fetch가 `response.ok`를 안 보던 버그도 발견·수정). 증거: `.omo/evidence/ultima-web/task-21/title-render.png`, `boot-failure.log`.
- 검증 게이트 전부 exit 0: `npm run test:unit`(13 files/99 tests) · `verify:repo-sources`(4 components) · `typecheck` · `build` · `git diff --check` · 전체 e2e 스위트(10/10, Chromium).
- 상세 조사 과정(각 버그를 어떻게 찾았는지, advisor 상담 내용 포함)은 `handoff.md` "Todo 21 완료 기록" 참고.

Todo 21 main merge + Todo 10 저장/재로드 증명 (2026-09-25):
- `todo-21-real-engine`(`542ce34`, `70d14db`, `23cbbd4`) → main `ce88bc1`로 merge, `origin/main`에 push 완료.
- 사용자 지시("물어보지 말고 권장 방향으로 진행해")에 따라 이후부터는 merge/push 전 확인을 생략하고 진행.
- 신규 `tests/e2e/save-reload.spec.ts`: 실제 캐릭터 생성(이름 입력 → 성별 선택 → 스토리 24화면 → 미덕 질문 최대 20라운드, 각 waitAnyKey/카드 애니메이션 타이밍에 맞춘 관대한 딜레이 필요함을 실측으로 확인)으로 실제 `party.sav`를 씀 → `#save-status`가 "저장 완료"로 바뀜(persistence coordinator의 실제 IDBFS sync) → 페이지 리로드(새 wasm 인스턴스) → 같은 zip 재선택 → "Journey Onward" → 실제 게임 월드(파티 "avatar", 골드 200, 상태 패널까지) 진입을 스크린샷으로 확인. IDBFS 실패 경로도 `window.indexedDB`를 실제로 제거해(가짜 FS 아님) 확인. 증거: `.omo/evidence/ultima-web/task-10/save-reload-after-journey.png`, `idbfs-failure.log`.
- 첫 커밋은 코드 변경 없이 테스트만(persistence coordinator는 21.2에서 이미 연결돼 있었음). 이어서 export/import도 완성: `src/shell.ts`에 `attachSaveHandlers()` 추가, `src/engine/startup.ts`의 `StartEngineResult`가 성공 시 `saveHandlers`(실제 `exportSaveArchive`/`importSaveArchive`에 바인딩)를 반환, `main.ts`가 엔진 시작 성공 시 연결. `tests/e2e/save-reload.spec.ts`에 export/import 라운드트립 테스트 추가(다운로드가 실제 "U4SV" 아카이브인지, 재가져오기 후 "저장 완료"가 다시 뜨는지).
- 검증 게이트 전부 exit 0: `npm run test:unit`(13 files/99 tests) · `verify:repo-sources` · `typecheck` · `build` · `git diff --check` · `tests/e2e/save-reload.spec.ts`(3/3, 실제 ultima4.zip).
- Step 10 승인 기준 전체 충족 — `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`의 Todo 10 체크박스 `[x]`로 변경(byte-identical 확인).

Todo 11 완료 (2026-09-25, branch `todo-11-dialogue-panel`, 백그라운드 에이전트가 구현, main에 merge됨):
- 커밋 `3c26822`(feat: 대화 패널 구현) + `a9218b2`(fix: advisor 리뷰 반영, UI 알림 줄바꿈 버그 수정).
- 신규 `src/dialogue/message-tokens.ts`: 순수 `tokenizeMessage()`(제어 바이트 → 토큰) + `PanelState` 리듀서. 바이트 매핑은 `vendor/xu4/src/screen.cpp`의 `screenMessageN()` switch와 `vendor/xu4/src/textview.h`의 `TextColor` enum으로 실제 검증(추측 아님): backspace(0x08, 지우지 않고 커서만 이동 — 네이티브 메시지 영역은 고정 커서 버퍼지 텍스트 편집기가 아님), newline(0x0A), carriage-return(0x0D), cursor-right(0x12 DC2), FG_* 색상 7종(0x13-0x19), `CHARSET_PROMPT`(0x10, `screenPrompt()`의 대기 커서 glyph). ABI 변경 없음 — `MessageBridgeEvent.text` 문자열이 이미 이 바이트들을 그대로 담을 수 있음. "clear"는 in-band 토큰으로 만들지 않음(`vendor/xu4/src/` 전체에서 in-band clear-screen 바이트 증거를 찾지 못함 — 기존 `ClearBridgeEvent`가 이미 이 역할).
- `src/bridge/types.ts`: `MessageBridgeEvent`에 옵션 필드 `awaitKey?: boolean` 추가(ABI 버전 변경 없음, additive) — Hawkwind식 pause(`EventHandler::waitAnyKey()`, 예: `discourse_castle.cpp`의 `runTalkHawkwind`)는 메시지 버퍼 바이트가 아니라 블로킹 함수 호출이라 `text` 토큰화만으로는 절대 복원할 수 없어서 out-of-band로 실음.
- `src/shell.ts`: `PanelState`가 `dispatch()` 호출 사이에 유지되도록 변경(매 이벤트마다 새로 만들지 않음) — 네이티브 메시지 출력은 한 줄을 여러 번에 나눠 보내는 조각(fragment)으로 오기 때문(예: `dungeon.cpp`의 `"...\nWho drinks? "` 다음에 완전히 별도의 `screenMessage("%c\n", key)` 호출이 같은 줄을 이어씀). 렌더링은 `createElement`+`textContent`만 사용(동일 색상 셀을 `<span>` run으로 묶음, innerHTML 전혀 안 씀). prompt 이벤트 동안 포커스를 받는 텍스트 없는 마커 엘리먼트(`#dialogue-prompt-marker`) 추가 — GLFW 입력 포트가 DOM 포커스와 무관하게 `window` 캡처 단계에서 리스닝하는 것을 확인해 실제 키 전달과 충돌 없음을 검증. 잘못된 브릿지 이벤트를 콘솔에 dump하던 버그도 수정(이제 `type`만 로그).
- (advisor 리뷰로 발견한 회귀) UI가 직접 만드는 알림 텍스트(rom-picker 확인 메시지, `startup.ts`의 성공/해시불일치 메시지)에 줄바꿈이 없어서 실제 실행 시 서로 다른 알림이 한 줄에 이어져 보이는 버그 — `startup.ts`의 `message()`와 `shell.ts`의 rom-picker 텍스트에 trailing `\n` 추가, `runtime-error` 케이스는 진행 중이던 줄이 있으면 먼저 줄바꿈하고 항상 새 줄로 끝나는 `appendWholeLine()`으로 교체. 회귀 재발 방지 e2e(`tests/e2e/dialogue-panel.spec.ts`의 "UI-authored notices..." 테스트, 실제 corrupted-zip fixture로 rom-picker 확인 메시지와 `[오류]` 줄이 분리된 두 줄임을 확인)로 검증.
- 신규 `tests/unit/message-tokens.test.ts`(23 tests, RED→GREEN): 토크나이저/리듀서 전체 커버리지 + 두 개의 별도 dispatch에 걸친 fragment 결합 케이스 + `<script>`류 문자열이 하나의 안전한 text 토큰으로 남는지 + tab(0x09)→space 정규화 + `src/` 전체 `.ts` 파일을 재귀 스캔해 innerHTML/outerHTML/insertAdjacentHTML/document.write 사용이 전혀 없는지 정적 가드.
- `tests/unit/bridge-contract.test.ts`: `awaitKey` 옵션 필드 RED→GREEN 케이스 추가.
- 신규 `tests/e2e/dialogue-panel.spec.ts`(happy/실패 경로 + UI 알림 분리 회귀 테스트, 3 tests): synthetic bridge dispatch로 fragment 결합·색상·pause(`awaitKey`)·prompt(`\x10`) 상태·prompt 포커스(실제 키 입력이 여전히 `window.ultimaInput`에 도달함을 확인)·CJK wrapping을 검증하고 `page.addInitScript`로 `Element.prototype.innerHTML`/`outerHTML` setter와 `insertAdjacentHTML`을 계측해 호출 횟수 0임을 실제로 증명(단순 `<script>` 엘리먼트 개수 확인보다 강한 증거 — innerHTML로 삽입된 `<script>`는 어차피 실행되지 않으므로). 증거: `.omo/evidence/ultima-web/task-11/dialogue-panel.png`, `textcontent-safety.log`.
- 검증 게이트 전부 exit 0: `npm ci` · `npm run test:unit`(14 files/123 tests) · `verify:repo-sources`(4 components) · `typecheck` · `build` · `git diff --check` · `ULTIMA4_DATA=<실제 zip> npx playwright test --project=chromium`(13/13, 기존 스위트 무회귀 포함).
- RED/GREEN 로그는 실제로 구현 파일을 임시 제거/원복해 재생성(스크롤백 재사용 아님): `.omo/evidence/ultima-web/task-11/message-tokens.{RED,GREEN}.log`, `bridge-contract-awaitkey.{RED,GREEN}.log`.
- **"실제 게임에서 확인" = ⬜, 의도적으로.** 실제 xu4 엔진은 아직 `screenMessage`를 조각 단위 bridge `message` 이벤트로 내보내지 않는다(engine 쪽 hook이 없음 — `screenMessage`는 게임 context가 없으면(`!c`) 조기 반환하고, intro 단계는 애초에 context가 없다). 이 Todo는 그 엔진 훅 없이도 통과 가능한 acceptance criteria(순수 토크나이저 유닛 테스트 + synthetic bridge 이벤트로 구동하는 Playwright 검증)를 갖고 있어 완료로 인정하되, 실제 엔진이 실제 대화 텍스트를 이 패널로 보내는 것은 아직 아무도 본 적 없다.
- **알려진, 의도적으로 미룬 한계**: (1) 패널은 매 렌더마다 히스토리 전체를 다시 그림(긴 세션에서 O(n²), `aria-live="polite"`가 매번 전체 재낭독) — Todo 18 메모리 성장 하드닝으로 미룸. (2) backspace는 줄 경계를 넘지 않음(같은 줄 안에서만 커서 이동). (3) 0x01-0x07·0x0B·0x0C·0x0E·0x0F·0x11·0x1A-0x1F 같은 다른 낮은 바이트는 네이티브에서는 charset glyph이지만 이 포트에서는 원본 바이트 그대로 DOM에 텍스트로 들어간다(현재 실제로 이 바이트를 쓰는 텍스트가 없어 위험이 낮음, 그러나 확인 필요). (4) 계획서가 인용하는 `engine/src/event.cpp:909-943`/`config_boron.cpp:1325-1340`은 실제로는 `vendor/xu4/src/event.cpp`(readChoice/readDir/readInt/readString 구현부)와 `vendor/xu4/src/config_boron.cpp`(NpcTalk 로더, Todo 13/14 쪽 관련)다 — Todo 11 자체 구현에 직접 쓰이진 않음.

Todo 19 골격 작업 (2026-09-25, branch `todo-19-pages-workflow`, 백그라운드 에이전트가 구현, main에 merge됨, 🟡 부분 진행 — 완료 판정은 여전히 15,16,18 이후):
- `.github/workflows/pages.yml` 신규 작성: `build`(push+PR, `npm ci`→`verify:repo-sources`→`typecheck`→유닛 테스트 2스텝(나머지는 하드 게이트, `wasm-symbols.test.ts`만 `continue-on-error`, 아래 참고)→`build:site -- --base=/ultima/`→`audit:dist`→`verify:workflow`→`.nojekyll`→`upload-pages-artifact`)와 `deploy`(`needs: build`, `push`+`main`일 때만, `configure-pages`→`deploy-pages`) 2-job 구조. 모든 `uses:`를 40자 commit SHA로 고정(체크아웃 v7.0.1/setup-node v7.0.0/configure-pages v6.0.0/upload-pages-artifact v5.0.0/deploy-pages v5.0.1, 전부 GitHub API로 실제 태그→커밋 SHA 조회 후 고정). `node-version: "22.23.3"` 고정(로컬 개발 버전과 동일). 헤더 주석에 HTTPS repo URL·SSH remote·Pages URL·Pages Source="GitHub Actions" 설정 안내·비파괴적 SSH 인증 확인 명령(`ssh -T git@github.com`)을 문서화 — 이 워크플로우 자체는 git push를 전혀 하지 않음(공식 Pages Actions는 OIDC/REST API 기반이라 SSH 불필요)을 명시.
- 신규 `npm run audit:dist`(`scripts/audit-dist.mjs`): dist artifact에서 원본 게임 데이터 확장자(zip/sav/ega/map/tlk/exe)와 개발용 tooling 파일(`scripts/check-base-path.mjs`의 `FORBIDDEN_BASENAMES`/`FORBIDDEN_EXTENSIONS` 재사용) 유출을 검사. Todo 18이 test-hook/cheat-API/XSS 등으로 이 audit을 더 넓힐 예정임을 주석에 명시.
- 신규 `npm run verify:workflow`(`scripts/workflow-verifier.mjs` + `scripts/verify-workflow.mjs`): YAML 파서 없이 텍스트 기반으로 HTTPS URL·SSH remote·Pages URL·`--base=/ultima/`·`pages: write`·`id-token: write`·artifact root(`path: dist`)·`.nojekyll`·모든 `uses:`의 SHA 고정 여부·`node-version` 정확한 버전·`audit:dist`가 upload보다 먼저 실행되는지·`git push` 부재·원본 데이터 확장자 부재를 검사.
- TDD: `tests/unit/audit-dist.test.ts`(4개), `tests/unit/workflow.test.ts`(13개) 전부 RED(스크립트/워크플로우 파일 없음, 17/17 실패) 확인 후 구현 → GREEN(17/17 통과). 과정에서 워크플로우 헤더 주석에 우연히 `audit:dist` 문자열이 두 번 나와(주석+실제 스텝) 순서 검사 테스트가 첫 위양성으로 실패한 것을 실제로 잡아 주석 문구를 고쳐 재통과시킴(진짜 RED→GREEN 사이클).
- **실제로 발견한, 아직 안 풀린 문제**: 완전히 새로 clone한 저장소(`build/` 없음)에서 `npm run test:unit`을 실제로 실행해보니 `tests/unit/wasm-symbols.test.ts`가 실패한다(다른 14개 파일/108개 테스트는 통과 — 이 수치는 최초 발견 시점 실측값; `workflow.test.ts`가 이후 더 늘어서 브랜치 tip에서는 다른 숫자다, `handoff.md` "Todo 19 후속 수정 2" 참고). 원인: wasm 엔진 빌드에 필요한 pinned emsdk(4.0.23, `docs/SOURCE_PINS.md`)가 어떤 npm 스크립트로도 자동 설치되지 않고, 지금까지 전부 로컬 1회성 수동 설치였음(`handoff.md` Node 22 절 참고) — CI 러너는 당연히 이게 없다. 이번 세션 자체 worktree도 처음엔 `build/wasm-release`가 없어서 똑같이 실패하는 것을 실측(클린 clone 시뮬레이션과 동일 증상) → 메인 체크아웃의 기존 빌드 산출물(`build/wasm-release`, 27MB, 원본 데이터 없음 확인 후)을 복사해 로컬 게이트만 통과시킴. **테스트를 고치거나 약화하지 않았고**, CI 워크플로우는 `wasm-symbols.test.ts`만 별도 스텝으로 분리해 `continue-on-error`로 두고(주석으로 이유 명시), 나머지는 그대로 하드 게이트 — advisor 리뷰에서 "전체를 continue-on-error로 두면 진짜 회귀도 배포를 못 막는다"는 지적을 받고 이렇게 좁혔다. 그 결과 CI가 만드는 `dist/`에는 `/engine/`이 없다(셸만 배포, 2026-09-24 재계획이 허용한 범위와 일치). emsdk를 CI에 자동 설치하는 일은 Todo 19의 범위 밖으로 남겨둠(별도 결정 필요).
- 검증 게이트 전부 실제 실행, 전부 exit 0: `npm ci` · `npm run test:unit`(15 files/118 tests) · `npm run verify:repo-sources`(4 components) · `npm run typecheck` · `npm run build` · `git diff --check` · `npm run build:site -- --base=/ultima/` · `npm run audit:dist`(9 files) · `npm run verify:workflow` · `cmp` 계획서 2벌. CI가 실제로 돌릴 하드 게이트도 완전히 새로 clone한 저장소에서 직접 실행(계산 아님): `npx vitest run --exclude tests/unit/wasm-symbols.test.ts` → exit 0, 14 files/110 tests; `npx vitest run tests/unit/wasm-symbols.test.ts` → exit 1, 8 skipped(continue-on-error라 job은 안 막힘, 의도된 동작).
- advisor 리뷰 2회로 추가 발견·수정한 것(전부 커밋 전에 잡음, main엔 한 번도 push 안 됨): (1) `verify:workflow`의 구조 검사(permission/artifact-root/`.nojekyll`)가 헤더 주석 문구만으로도 통과하던 실제 버그 — 주석이 아닌 줄만 앵커된 정규식으로 검사하도록 수정, `include-hidden-files` 검사 추가; (2) workflow-level `concurrency`를 `deploy` job으로 좁힘(PR용 `build`가 대기 중인 main 배포를 치환하지 못하게); (3) 의존성 매트릭스 19번 행을 처음에 빠뜨렸다가 추가 반영; (4) `- name: Unit tests: wasm engine suite (...)`가 인용 안 된 plain YAML scalar에 `: `를 포함해 **GitHub가 워크플로우 파일 전체를 파싱조차 못 하고 거부했을 실제 문법 오류** — `verify:workflow`는 YAML 파서가 아니라서 못 잡았고, 시스템의 PyYAML로 실제 파싱해서 확인/수정, 같은 버그 클래스를 잡는 검사(`checkNameValuesAreYamlSafe`)도 추가.
- 완료 판정: 여전히 15,16,18 이후. 체크박스는 의도적으로 `[ ]` 유지.

Todo 16 완료 (2026-09-26, branch `todo-16-web-audio` 커밋 `541d6ca`, main에 merge됨):
- 신규 `vendor/xu4/src/sound_web.cpp`: Todo 21.1의 무음 `scripts/web-sound-silent.cpp` 스텁을 실제 Web Audio 구현으로 교체. sound.h 전체 함수를 native `sound_faun.cpp`와 같은 decision state(currentTrack/musicEnabled/volumeFades/동일-트랙 가드/BUFFER_MS_FAILED 캐시)로 구현하고, 실행만 EM_JS 트램폴린 10여 개로 `src/engine/audio.ts`(`Module.u4Audio`)에 위임. native `sound_faun.cpp`는 완전히 무수정(native 빌드가 여전히 `sound_faun.o`를 링크하는 것으로 확인).
- 신규 `src/engine/audio-manifest.ts`(CDI TOC 파서 + WAV/Ogg 헤더만으로 duration 계산, 실제 `sfx_gen.c` 생성 없이) + `src/engine/audio.ts`(AudioContext 싱글턴, 실제 Web Audio 재생/페이드/볼륨, generation 취소 로직). `soundDuration()`은 WAV/Ogg는 callMain() 이전에 TS에서 미리 계산한 표를 EM_JS로 동기 조회, RFX는 C++이 그 자리에서 1회 합성해 프레임 수를 캐시하는 방식으로 항상 동기 유지.
- **실제로 발견·수정한 버그(사전 조사에서 예상 못 함)**: `vendor/xu4/src/module.c`의 `mod_addLayer()`가 로드된 모든 CDIEntry의 `cdi` 필드 최하위 바이트(원본 파일의 0xDA 매직 바이트)를 레이어 번호로 **의도적으로 덮어쓴다**("Replace high 0xDA byte with layer number in all entries") — `mod_path()`가 나중에 그 바이트로 레이어를 역추적하기 위해서다. Todo 16 이전에는 아무 코드도 런타임 CDIEntry의 `cdi`를 `DA7A_*` 상수와 비교한 적이 없어서(native는 `ent->offset`/`ent->bytes`만 읽음) 이 문제가 드러난 적이 없었다. 실제 `SOUND_UI_TICK` 엔트리의 온디스크 `cdi`(0x30207ada)가 런타임에는 0x30207a01로 읽히는 것을 실제 엔진 실행 중 직접 확인. `CDI_MASK_FORMAT`(건드리지 않는 상위 2바이트)으로 비교하도록 수정.
- **e2e 작성 중 발견·수정한 버그**: `IntroController::keyPressed()`는 INTRO_TITLES→INTRO_MAP 전이를 오직 타이머(`timerFired()`)로만 하고 키 입력으로는 안 한다 — 이 타이머가 돌기 전에 보낸 키는 `skipTitles()`에 소비될 뿐이다. 'c'를 너무 일찍 보내면 INTRO_MAP(아무 키나 INTRO_MENU로 전이시킴)에 소비돼 Configure 메뉴가 안 열린다. `musicStarts` 통계(타이머가 실제로 돌았다는 증거)를 기다린 뒤에 키를 보내도록 e2e를 수정해 해결(추측이 아니라 `IntroController::keyPressed`/`MenuController::keyPressed`에 임시 디버그 로그를 심어 실제 key/mode 시퀀스를 확인한 뒤 알아냄).
- Playwright/Chromium이 `--autoplay-policy=user-gesture-required`를 줘도 `page.goto()` 직후 `navigator.userActivation.hasBeenActive`가 이미 `true`인 것을 확인 — "제스처 전에는 잠겨 있어야 한다" 절반은 이 하네스에서 증명 불가(F3 수동 QA로 남김), resume-if-suspended/`armAutoResumeOnGesture()` 코드 자체는 unit test로 커버.
- `vendor/source-manifest.json`의 xu4 `treeSha256`/`fileCount`를 같은 커밋에서 재계산(Todo 7/8/21 전례 따름).
- 신규 테스트: `tests/unit/audio-manifest.test.ts`(15), `tests/unit/audio-bridge.test.ts`(14, generation-race 포함), `tests/unit/startup-sequence.test.ts`(+2), `tests/e2e/audio.spec.ts`(2 시나리오, 실제 `ultima4.zip`) — 전부 RED→GREEN 확인.
- 검증 게이트 전부 exit 0: `npm ci` · `npm run test:unit`(15 files/130 tests) · `verify:repo-sources`(4 components) · `typecheck` · `build` · `git diff --check` · `npm run deps:wasm` · `npm run build:wasm -- --debug`(70/70 소스) · `npm run test:e2e -- tests/e2e/audio.spec.ts --project=chromium`(2/2) · 전체 e2e 스위트(12/12, Chromium) · `npm run build:native` · `ctest --test-dir build/native`(3/3, native 무회귀).
- 증거: `.omo/evidence/ultima-web/task-16/{red.log,green-manifest.log,green-unit.log,audio-summary.json,audio-generation-race.log}`.
- 남은 것: `soundSpeakLine()`의 stream sub-range 재생은 미구현(이 모듈에 `voice:` 데이터가 전혀 없어 실질적으로 도달 불가함을 확인) — 정직하게 문서화만 하고 구현은 보류. 상세는 `handoff.md` "Todo 16 완료 기록" 참고.

Todo 15 완료 (2026-09-26, main 작업 중 — 커밋 전):
- `glossary.json`(18) 완료: 울티마 4 정경 용어(8미덕·3원칙·아바타/룬/신단/진언/코덱스/동료/미덕) — 이후 모든 파일이 참조하는 용어집이라 가장 먼저 함.
- `ui.json`(369) 완료: 전투/던전/게임 상태줄/Configure 메뉴/아이템/포탈 문구. 화이트스페이스뿐인 소스(12건, 예: 순수 `"\n"`)가 기존 i18n:check의 "번역 없음" 검사(trim 후 빈 문자열이면 실패)를 통과할 수 없다는 스키마 결함을 발견 → `category: "passthrough"` 예외를 RED→GREEN으로 추가(`tests/unit/i18n-check.test.ts`).
- `binary.json`(214) 완료: 엔딩/호크윈드 미덕 평가/로드 브리티시 마을·미덕 설화/신단 조언/미덕 질문/캐릭터 생성 내레이션(집시 카드점·꿈 환영·20개 미덕 이분법 질문). `lordBritishKeyword:*`(24건)는 의도적으로 영어 그대로 둠 — discourse 키워드 매칭 토큰이라 번역하면 실제 대화가 깨짐(Todo 13의 `aliases.json` 설계와 동일한 이유).
- `module.json`(729) 완료: 그래픽/오디오 파일 경로(229건, 정규식으로 자동 pass-through)·Credits·아이템/직업/몬스터 이름·던전/마을 고유명사(binary.json과 표기 통일)·상인 대화 시스템(약 180개 상점/NPC 이름 + 재사용 대화 템플릿). 상인 대화의 `%`/`@`/`#`/`=`/`+`/`$gp` 같은 discourse 치환 토큰은 printf 플레이스홀더가 아니라서 checker가 추적하지 않지만 실제 게임 로직엔 필수라 번역 전체에서 리터럴로 보존. 부수 발견: "% says"류 영어 산문이 printf `%` 공백-플래그 규칙에 우연히 걸려 스키마에 거짓 placeholder(`"% s"` 등, 26건)로 저장돼 있던 것도 함께 수정(`placeholders: []`).
- `tlk.json`(3072건): `TOWN:NPC번호:필드` 구조, 16개 마을 × NPC 16명 × 12필드(name/pronoun/look/job/health/question/yes/no/response1/response2/topic1/topic2). `topic1`/`topic2`(512건)는 discourse가 대화 주제로 직접 매칭하는 4글자 코드(예: "PLAY","COMP")라 `lordBritishKeyword`와 같은 이유로 영어 그대로 pass-through 처리. 나머지 10필드(2560건)도 16/16 마을 전부 완료. 마지막 YEW 160건은 `.omo/drafts/tlk-yew-translation-draft.json`에서 적용했고, worker 독립 검증으로 draft key 누락 0·non-YEW 변경 0·changedEntryCount 160 확인.
- 게이트: `npm run i18n:check`와 `npm run i18n:check -- --strict` 모두 4411 entries, pending 0, exit 0. `npm run i18n:generate`로 4388 translated entries + 9 aliases를 `src/i18n/generated/strings.ts`, `native/i18n/u4_i18n_table.inc`, `native/i18n/ko-overlay.b`에 반영. 새 `tests/e2e/korean-progression.spec.ts`는 실제 `ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip`로 2/2 통과(1.6분): semantic Korean coverage + 실제 저장/재로드, strict failure fixture. Generator가 Boron overlay line-ending whitespace를 내던 문제를 RED→GREEN(`tests/unit/localization-boundaries.test.ts`)로 고치고 `git diff --check` exit 0 확인.

## 바로 다음 순서 (2026-09-26 갱신 — Todo 15 완료 17/25)
1. **Todo 17 진행**: 브라우저 통합 게임 진행 e2e. 이미 Todo 10/13/15/16의 실제 루트가 있으므로 이를 묶되, wasm 재진입 버그 클래스가 다른 in-game 흐름에도 잠재했을 수 있으니 통합 e2e에서 특히 주의.
2. 이후: 18 → 19 완료(emsdk CI 스텝·audit 확장 이미 병합됨) → 20 → F1~F4.
3. Pages Source="GitHub Actions" 저장소 설정은 사용자만 가능 — 계속 대기.

## 목적 달성 가능성 판단
- **가능하다, 그리고 크리티컬 패스(Todo 21)는 이제 끝났다.** 근거: 같은 xu4 소스가 native에서도(Step 3), 이제 브라우저에서도(Todo 21, 2026-09-25) 원본 데이터로 실제로 돈다 — 실제 타이틀 화면 렌더 + 실제 키 입력으로 `IntroController` 상태 전이까지 확인됨. 남은 일은 대부분 한국어화(11~15)와 배포(17~20)로, 엔진 자체의 미지수는 이제 거의 없다.
- 주요 위험 (확인 필요):
  - (해결, 2026-09-25) Todo 21 전체(21.1~21.4)가 예상보다 훨씬 가벼웠다 — 걸린 문제 전부(map.h 누락, VERSION 따옴표, FS_DEBUG 누락, render.pak 낡음, GL_RGB/RGBA 포맷, msecSleep의 nanosleep 블로킹) 각각 한두 줄 수정으로 끝남. 실제 실행 전엔 전혀 안 보이던 문제들이었다는 게 핵심 교훈 — Step 6~9가 "링크만 되고 실행은 안 해본" 상태였을 때처럼, Todo 10도 "연결만 되고 실제 저장은 안 해본" 상태다(아래 참고).
  - (해결, 2026-09-25) Asyncify blocking loop: `msecSleep()`이 `nanosleep()`을 그대로 호출해 매 프레임 브라우저를 완전히 멈추는 버그였음 — `emscripten_sleep()`으로 교체해 해결. Step 8 큐의 yield 훅(`u4_web_frame_yield`) 자체는 문제 없었음, 그 훅에 도달하기 전에 이미 멈춰 있었던 것.
  - (남음) Step 10: persistence coordinator가 실제 엔진에 연결은 됐지만(21.2), 실제 저장이 한 번도 안 일어나봤다 — 캐릭터 생성 없이는 세이브 트리거가 없음. IDBFS write가 실제로 브라우저 재로드 후 살아남는지는 아직 확인 안 됨(확인 필요).
  - 번역 corpus 4402건의 분량·품질 (Step 15).
  - (해결, 2026-09-26) Web Audio + RFX 동기 `soundDuration` 계약 (Step 16) — 실제로 교체·검증 완료. 예상 못 한 진짜 버그: `mod_addLayer()`가 CDIEntry의 `cdi` 필드 최하위 바이트를 레이어 번호로 덮어써서 RFX 포맷 비교가 항상 실패했음(`CDI_MASK_FORMAT`으로 비교하도록 수정) — 자세한 내용은 위 "Todo 16 완료" 참고.
- 해결된 환경 이슈: Node 22 전환 완료(2026-09-24, v22.23.3). host의 `/usr/bin/node`는 여전히 v20이라, 로그인 셸이 아닌 환경에선 `export PATH="$HOME/.local/opt/node22/bin:$PATH"`가 필요할 수 있다. wasm 빌드 시 `source .emsdk/emsdk_env.sh`는 emsdk 자체 Node(22.16)를 PATH 앞에 둔다(둘 다 22라 문제 없음).

## 공통 규칙 (AGENTS.md 요약)
- 브랜치 `todo-<n>-<topic>`, PR 없이 main 직접 merge. merge 전 `npm ci`, `npm run test:unit`, `npm run verify:repo-sources`,
  `npm run typecheck`, `npm run build`, `git diff --check` + 해당 단계 추가 명령 전부 통과 후 `handoff.md`에 기록.
- TDD: RED 로그 → GREEN. 테스트 삭제/약화 금지.
- 원본 ZIP/EXE/TLK/MAP/EGA/SAV, 추출 원문 corpus, 사용자 save, secret 커밋 금지.
- 단계 완료 시 이 파일의 상태·진행률을 갱신한다.
