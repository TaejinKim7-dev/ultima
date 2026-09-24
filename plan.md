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
- **승인 기준: 9 / 25 = 36.0%** (Step 1~9 ✅, Step 10 🟡).
- **실제 게임에서 확인: 브라우저에서 동작 확인된 엔진 기능 0개** — Todo 21(특히 21.3/21.4) 전까지는 0이 정상이다. native 기준선(Step 3)은 native에서 실제 게임으로 확인됨.

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
| 7 | OpenGL → WebGL2 (glMapBufferRange 제거, CPU staging + glBufferSubData) | ✅ | ⬜ | main `874c775` (`90232b9`) — 별도 셰이더 하네스로 검증. `gpu_opengl.cpp`는 `screen_glfw.cpp`가 include하는데 그 파일이 wasm 빌드에 없음 |
| 8 | blocking event loop / 키 입력 → 브라우저 안전 queue (IME, request ID) | ✅ | ⬜ | main `6b97d8e` (`af13814`) — 큐를 소비하는 실제 게임 루프가 아직 없음 |
| 9 | 브라우저 시작 시퀀스 + 원본 ZIP 검증 + 가상 FS, main 1회 실행 | ✅ | ⬜ | main `5c28511` (`4c878c9`) — `main()`을 부르지만 비어 있음(화면 검은색) |
| 10 | IDBFS 세이브/설정 영속 + export/import | 🟡 | ⬜ | main `92ebce8` (`6a74288`) — Coordinator+아카이브만, e2e 보류. 세이브 경로가 IDBFS 마운트와 안 맞을 가능성(21.2에서 확인) |
| 21 | **실제 xu4 엔진을 wasm에 링크·실행** (재작성, 세부 21.1~21.4) | ⬜ | ⬜ | 선행 6,8,9 완료 → **지금 착수 가능, 크리티컬 패스** |

Todo 21 세부 단계 (각각 자체 게이트, 넷 다 통과해야 Todo 21 완료):
- 21.1 ⬜ **링크 성공** — 네이티브 `Makefile.common` 소스 목록(UI=glfw → `-sUSE_GLFW=3`, CONF=boron) + 실제 `xu4.cpp` + 무음 `sound.h` 구현으로 기본 `ERROR_ON_UNDEFINED_SYMBOLS` 상태에서 링크. 가짜 `web-stub.cpp`/`web-main.cpp` 제거. `-DVERSION='"DR-1.0"'` 따옴표 버그 수정. 첫 링크의 미정의 심볼 목록을 실제 작업 목록으로 쓴다. (`gpu_opengl.cpp`·`discourse_tlk/castle.cpp`·`config_data.cpp`는 다른 파일이 include하므로 따로 넣지 않는다.)
- 21.2 ⬜ **FS/경로 해결** — `render.pak`/`Ultima-IV.mod`를 wasm FS에 실제로 쓰기(지금은 HTTP로만 서빙, `/assets`는 비어 있음), `u4fsetup`이 `.`/`u4`에서만 찾는 `ultima4.zip` 경로 맞추기, emcc에서 `Settings` user path가 어디로 가는지 확인하고 Todo 10 IDBFS 마운트와 일치시키기.
- 21.3 ⬜ **타이틀 화면 렌더** — `Module.canvas`를 `#game-canvas`에 연결, 실제 렌더러로 검은색이 아닌 타이틀 화면(Step 7의 픽셀 검사 방식 재사용).
- 21.4 ⬜ **실제 입력** — 키 하나가 실제 게임 상태를 바꿈. GLFW 포트의 자체 키 리스너와 `main.ts`의 큐 enqueue 중 정식 경로를 하나로 정해 키가 두 번 들어가지 않게.
- 21.4 이후: Step 7(실제 렌더러)·Step 8(실제 컨트롤러) 재검증, Step 10 e2e(`save-reload.spec.ts`) 추가 → 해당 행의 "실제 게임에서 확인"을 ✅로.

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

## 바로 다음 순서 (2026-09-24 재계획)
1. **Todo 21.1 → 21.2 → 21.3 → 21.4** (크리티컬 패스). 착수 전 `.omo/plans/ultima-web.md`의 Todo 21 전문을 읽는다. 브랜치 예: `todo-21-real-engine`.
2. **병렬 가능**: Todo 19의 workflow 골격(Node 22 CI · `npm ci`/unit/typecheck/build/audit · 현재 셸의 Pages 배포). 엔진과 독립이라 21과 동시에 진행해도 충돌이 적다. 완료 판정은 원래 선행조건(15·16·18) 이후.
3. 21.4 이후 재검증: Step 7(실제 렌더러), Step 8(실제 컨트롤러), Step 10 e2e(`save-reload.spec.ts`) → 각 행의 "실제 게임에서 확인" 갱신.
4. 11~13(설계 메모 `.omo/drafts/step-11-13-korean-ui-design.md`) → 16(설계 메모 `.omo/drafts/step-16-web-audio-design.md`, 21.1의 무음 구현 교체) → 14 → 15(번역 4402건, 워크플로우 병렬 처리 후보).
5. 17 → 18 → 19 완료 → 20 → F1~F4.

## 목적 달성 가능성 판단
- **가능하다고 본다, 단 남은 일의 무게중심이 바뀌었다.** 근거: 같은 xu4 소스가 native에서는 원본 데이터로 새 게임·이동·NPC 대화·save/load까지 실제로 돈다(Step 3). 모듈 패키징·번역 inventory·웹 셸/브릿지·시작 시퀀스·영속화 로직도 각각 검증돼 있다. 부족한 건 "이것들을 실제 엔진으로 브라우저에서 한 번에 돌리는 통합"이고, 그게 Todo 21이다.
- 주요 위험 (확인 필요):
  - **Todo 21의 실제 규모를 아직 모른다.** 21.1의 첫 링크 결과(미정의 심볼 목록)가 나와야 정해진다. 네이티브 소스 목록을 그대로 쓰는 방식이라 대부분 컴파일은 될 가능성이 높지만, GLFW 포트 차이·파일 경로·Asyncify 스택 크기에서 막힐 수 있다.
  - Asyncify로 blocking loop를 돌릴 때의 stack/성능 (Step 8 큐는 증명됨, 실제 루프는 21.4 이후 측정).
  - WebGL2 경로(Step 7)가 실제 렌더러에서도 동작하는지 — 21.3에서 처음 확인.
  - 세이브/설정 경로와 IDBFS 마운트 불일치 가능성 — 21.2에서 확인.
  - 번역 corpus 4402건의 분량·품질 (Step 15).
  - Web Audio + RFX 동기 `soundDuration` 계약 (Step 16).
- 해결된 환경 이슈: Node 22 전환 완료(2026-09-24, v22.23.3). host의 `/usr/bin/node`는 여전히 v20이라, 로그인 셸이 아닌 환경에선 `export PATH="$HOME/.local/opt/node22/bin:$PATH"`가 필요할 수 있다. wasm 빌드 시 `source .emsdk/emsdk_env.sh`는 emsdk 자체 Node(22.16)를 PATH 앞에 둔다(둘 다 22라 문제 없음).

## 공통 규칙 (AGENTS.md 요약)
- 브랜치 `todo-<n>-<topic>`, PR 없이 main 직접 merge. merge 전 `npm ci`, `npm run test:unit`, `npm run verify:repo-sources`,
  `npm run typecheck`, `npm run build`, `git diff --check` + 해당 단계 추가 명령 전부 통과 후 `handoff.md`에 기록.
- TDD: RED 로그 → GREEN. 테스트 삭제/약화 금지.
- 원본 ZIP/EXE/TLK/MAP/EGA/SAV, 추출 원문 corpus, 사용자 save, secret 커밋 금지.
- 단계 완료 시 이 파일의 상태·진행률을 갱신한다.
