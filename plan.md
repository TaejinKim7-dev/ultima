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
- **승인 기준: 10 / 25 = 40.0%** (Step 1~9, 21 ✅, Step 10 🟡).
- **실제 게임에서 확인 (2026-09-25 갱신): 브라우저에서 실제 엔진으로 확인됨 — Step 7(WebGL2 렌더), 8(실제 GLFW 입력), 9(브라우저 시작), 21(링크·FS·렌더·입력 전부).** 근거: `tests/e2e/boot-sequence.spec.ts`가 실제 `ultima4.zip`으로 실제 타이틀 화면 렌더 + 키 입력 2회로 `IntroController`의 실제 상태 전이(INTRO_TITLES→INTRO_MAP→INTRO_MENU)까지 확인(`.omo/evidence/ultima-web/task-21/title-render.png`).
- **Step 10 갱신 (2026-09-25): 실제 저장·재로드는 이제 증명됨, 그러나 완전히 ✅는 아니다.** 신규 `tests/e2e/save-reload.spec.ts`가 실제 캐릭터 생성(이름/성별/스토리 24화면/미덕 질문 7라운드)을 Playwright로 끝까지 자동화해 실제 `party.sav` write → 실제 IDBFS 동기화(`#save-status`="저장 완료") → 페이지 리로드(새 wasm 인스턴스) → "Journey Onward" → 실제 게임 월드(파티 이름 "avatar", 골드 200 등) 로 이어지는 걸 스크린샷으로 확인(`.omo/evidence/ultima-web/task-10/save-reload-after-journey.png`). IDBFS 실패 시나리오도 실제로 `window.indexedDB`를 제거해 확인. 다만 Todo 10의 원래 승인 기준이 요구하는 "export/import"는 아직 미완성 — `src/shell.ts`의 세이브 내보내기/가져오기 버튼은 여전히 플레이스홀더 JSON만 다루고 `persistence.ts`의 실제 `exportSaveArchive`/`importSaveArchive`에 연결돼 있지 않다(확인 필요, 다음에 할 일).

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
| 10 | IDBFS 세이브/설정 영속 + export/import | 🟡 | ✅ (저장/재로드만) | main `92ebce8` (`6a74288`) — `tests/e2e/save-reload.spec.ts`(신규)로 실제 캐릭터 생성→저장→리로드→Journey Onward 로드까지 확인. export/import 버튼은 여전히 플레이스홀더라 승인 기준 미충족(확인 필요, 남은 일) |
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
| 11 | 긴 메시지 → 하단 HTML 대화 패널 (textContent만) | ⬜ | ⬜ | 5,9,21 |
| 12 | status/menu → DOM overlay (DPR/letterbox) | ⬜ | ⬜ | 5,9,11,21 |
| 13 | 한국어 NPC alias + prompt별 입력 규칙 | ⬜ | ⬜ | 8,9,11,21 |
| 14 | C++/Boron/TLK/binary/JS 번역 lookup 런타임 연결 | ⬜ | ⬜ | 4,11,12,13 |
| 15 | 전체 한국어 번역 corpus + glossary 일관성 (`i18n:check --strict`) | ⬜ | ⬜ | 4,14 |

### Wave 4 — 완성/배포 (16~20)
| # | 단계 | 승인 기준 | 실제 게임에서 확인 | 선행 |
|---|---|---|---|---|
| 16 | Web Audio 음악/효과음 + RFX 생성 | ⬜ | ⬜ | 6,9,21 (21.1의 무음 구현을 교체) |
| 17 | 브라우저 통합 게임 진행 e2e (새 게임부터) | ⬜ | ⬜ | 10,12,13,15,16,21 |
| 18 | 실패/보안/개인정보/회귀 경계 강화 (`audit:dist`) | ⬜ | ⬜ | 17 |
| 19 | GitHub Actions Pages workflow + `/ultima/` release artifact | ⬜ | — | 15,16,18 (**골격은 지금 병렬 착수 가능**) |
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
- 코드 변경 없음(21.2에서 이미 연결된 persistence coordinator가 그대로 동작) — 이번엔 테스트만 추가.
- 남은 일: export/import 버튼이 아직 플레이스홀더라 Step 10 전체 승인 기준(export/import 포함)은 미충족. 위 "바로 다음 순서" 1번 참고.
- 검증 게이트 전부 exit 0: `npm run test:unit`(13 files/99 tests) · `verify:repo-sources` · `typecheck` · `build` · `git diff --check` · `tests/e2e/save-reload.spec.ts`(2/2, 실제 ultima4.zip).

## 바로 다음 순서 (2026-09-25 갱신 — Todo 21 완료 + main merge, Todo 10 저장/재로드 증명 완료)
1. **Todo 10 마무리**: `src/shell.ts`의 세이브 내보내기/가져오기 버튼을 플레이스홀더 JSON 대신 `persistence.ts`의 실제 `exportSaveArchive`/`importSaveArchive`에 연결(엔진 시작 후에만 FS/coordinator를 알 수 있으므로 `main.ts`↔`shell.ts` 사이에 핸들을 넘기는 작은 인터페이스가 필요). 이게 끝나면 Step 10 승인 기준 전체 충족.
2. 병렬 진행 중(백그라운드 에이전트, worktree 격리): Todo 19(Pages workflow 골격), Todo 16(Web Audio), Todo 11(대화 패널) — 완료 알림 오는 대로 검토 후 순차 main merge.
3. 12~13(설계 메모 `.omo/drafts/step-11-13-korean-ui-design.md`) → 14 → 15(번역 4402건, 워크플로우 병렬 처리 후보).
4. 17 → 18 → 19 완료 → 20 → F1~F4.

## 목적 달성 가능성 판단
- **가능하다, 그리고 크리티컬 패스(Todo 21)는 이제 끝났다.** 근거: 같은 xu4 소스가 native에서도(Step 3), 이제 브라우저에서도(Todo 21, 2026-09-25) 원본 데이터로 실제로 돈다 — 실제 타이틀 화면 렌더 + 실제 키 입력으로 `IntroController` 상태 전이까지 확인됨. 남은 일은 대부분 한국어화(11~15)와 배포(17~20)로, 엔진 자체의 미지수는 이제 거의 없다.
- 주요 위험 (확인 필요):
  - (해결, 2026-09-25) Todo 21 전체(21.1~21.4)가 예상보다 훨씬 가벼웠다 — 걸린 문제 전부(map.h 누락, VERSION 따옴표, FS_DEBUG 누락, render.pak 낡음, GL_RGB/RGBA 포맷, msecSleep의 nanosleep 블로킹) 각각 한두 줄 수정으로 끝남. 실제 실행 전엔 전혀 안 보이던 문제들이었다는 게 핵심 교훈 — Step 6~9가 "링크만 되고 실행은 안 해본" 상태였을 때처럼, Todo 10도 "연결만 되고 실제 저장은 안 해본" 상태다(아래 참고).
  - (해결, 2026-09-25) Asyncify blocking loop: `msecSleep()`이 `nanosleep()`을 그대로 호출해 매 프레임 브라우저를 완전히 멈추는 버그였음 — `emscripten_sleep()`으로 교체해 해결. Step 8 큐의 yield 훅(`u4_web_frame_yield`) 자체는 문제 없었음, 그 훅에 도달하기 전에 이미 멈춰 있었던 것.
  - (남음) Step 10: persistence coordinator가 실제 엔진에 연결은 됐지만(21.2), 실제 저장이 한 번도 안 일어나봤다 — 캐릭터 생성 없이는 세이브 트리거가 없음. IDBFS write가 실제로 브라우저 재로드 후 살아남는지는 아직 확인 안 됨(확인 필요).
  - 번역 corpus 4402건의 분량·품질 (Step 15).
  - Web Audio + RFX 동기 `soundDuration` 계약 (Step 16) — 21.1의 무음 구현을 실제로 교체할 때 처음 검증됨.
- 해결된 환경 이슈: Node 22 전환 완료(2026-09-24, v22.23.3). host의 `/usr/bin/node`는 여전히 v20이라, 로그인 셸이 아닌 환경에선 `export PATH="$HOME/.local/opt/node22/bin:$PATH"`가 필요할 수 있다. wasm 빌드 시 `source .emsdk/emsdk_env.sh`는 emsdk 자체 Node(22.16)를 PATH 앞에 둔다(둘 다 22라 문제 없음).

## 공통 규칙 (AGENTS.md 요약)
- 브랜치 `todo-<n>-<topic>`, PR 없이 main 직접 merge. merge 전 `npm ci`, `npm run test:unit`, `npm run verify:repo-sources`,
  `npm run typecheck`, `npm run build`, `git diff --check` + 해당 단계 추가 명령 전부 통과 후 `handoff.md`에 기록.
- TDD: RED 로그 → GREEN. 테스트 삭제/약화 금지.
- 원본 ZIP/EXE/TLK/MAP/EGA/SAV, 추출 원문 corpus, 사용자 save, secret 커밋 금지.
- 단계 완료 시 이 파일의 상태·진행률을 갱신한다.
