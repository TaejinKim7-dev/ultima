# ultima-web - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** DOS/Windows 기반 실행을 버리고, 브라우저에서 바로 열리는 Ultima IV 웹 한글판을 만든다. 최종 산출물은 GitHub Pages에 올릴 수 있는 정적 `index.html` 사이트이며, 사용자는 자기 브라우저에서 원본 `ultima4.zip`을 선택해 플레이하고 세이브는 브라우저에 저장한다.

**Why this approach:** 원작 게임 규칙은 검증된 xu4 엔진을 유지하고, 실행 표면만 native GLFW에서 Emscripten/WASM + WebGL2 + Web Audio + HTML UI로 바꾼다. GitHub Pages는 서버 코드를 실행하지 못하므로 모든 빌드 산출물은 정적 파일이어야 하고, 원본 게임 데이터는 저작권/배포 위험 때문에 Pages에 포함하지 않는다.

**What it will NOT do:** 서버, 로그인, 클라우드 세이브, 모바일 터치 UI, 실시간 번역 API, 원본 게임 데이터 번들을 추가하지 않는다.

**Effort:** XL
**Risk:** High - C/C++ 엔진을 single-thread browser runtime으로 옮기면서 GL buffer mapping, blocking input loop, filesystem save, audio decode, 한글 UI를 모두 검증해야 한다.
**Decisions to sanity-check:** GitHub Pages 정적 배포 고정, 원본 ZIP 사용자 선택 고정, 한국어는 DOM overlay/panel 중심으로 표시, native는 기준선 검증용으로 유지.

Your next move: 이 계획을 실행하려면 별도 worker 세션에서 `$start-work .omo/plans/ultima-web.md`로 시작한다. 실행 전 고정밀 이중 리뷰를 먼저 돌릴 수도 있다. Full execution detail follows below.

---

> TL;DR (machine): XL / High. 고정 xu4 소스 → native 기준 실행 → single-thread WASM → 한글 UI/전체 번역/영한 입력/오디오/영속 저장 → GitHub Pages. TDD. 구현 21개(2026-09-24, Todo 21 추가) + 최종 검증 4개.

## Scope
### Must have

이 문서는 GPT-5 구현 담당자에게 전달할 **실행 명세**다. 이전 대화를 읽지 않아도 된다. 사용자는 2026-09-07~08에 아래 결정을 확정하고 이 계획 작성을 요청했다. 이번 계획 세션은 원본 코드와 데이터 확보·정적 분석만 수행했다. 아직 native/WASM 실행 성공 증거는 없다.

1. `xu4-engine/u4`를 기반으로 원작 Ultima IV 전체를 웹으로 이식한다. GLFW + Emscripten + WebGL2를 사용한다. DOS 기본 EGA 그래픽과 게임 규칙을 보존한다.
2. 데스크톱 키보드 플레이. 지원 검증은 Chromium(Chrome/Edge 계열), Firefox, WebKit 계열의 현재 데스크톱 버전이다. 실제 버전을 검증 기록에 남긴다. WebKit 자동화 결과만으로 macOS Safari 실기 검증을 했다고 쓰지 않는다.
3. 원본 `ultima4.zip`은 사용자가 선택한다. 게임 파일은 브라우저 밖으로 업로드하지 않는다. 게임 진행/설정은 브라우저에 영속 저장하며 백업 내보내기/복원을 제공한다.
4. 긴 메시지·대화·서사는 화면 아래 HTML 패널. 상태·장비·메뉴 정보는 기존 게임 화면 위치를 유지하는 고해상도 text overlay로 표시한다. 320×200 world raster는 그대로 둔다.
5. 한국어 번역을 개발 담당 AI가 사전에 전부 작성한다. C++/Boron/TLK뿐 아니라 TITLE.EXE와 AVATAR.EXE에서 읽는 표시 문자열도 포함한다. 번역은 정적 배포물에 포함한다.
6. 한국어/영어 NPC 키워드와 한국어로 표시되는 진행 필수 질문의 답을 지원한다. 원본 영문 키워드, 명령키, 내부 ID/비교값은 보존한다.
7. 최종 산출물은 실제 배경음악/효과음이 나야 한다. 초기 무음 target은 이식 중간 단계일 뿐 완료 상태가 아니다.
8. GitHub Pages 정적 배포, GitHub Actions build/test/deploy workflow, TDD, native/web 회귀와 실제 게임 플레이 증거.
9. 배포 대상 GitHub 저장소는 `https://github.com/TaejinKim7-dev/ultima`다. SSH write remote는 `git@github.com:TaejinKim7-dev/ultima.git`로 사용한다. project site base path는 repo 이름 기준 `/ultima/`로 고정하고, 예상 Pages URL은 `https://taejinkim7-dev.github.io/ultima/`다. 사용자가 공개 키를 등록했다고 밝혔으므로 write 권한은 기대하되, 실행 시 SSH 인증/기본 브랜치/Pages 설정을 실제로 검증한다.
10. 공개 기본 정책: repo, 계획서, 구현 코드, 오픈소스 vendor snapshot, 테스트 정책, GitHub Actions workflow, 한국어 번역 원천 JSON은 공개한다. `main`에 PR이 merge되면 검증 workflow 통과 후 GitHub Pages에 자동 공개 배포한다. 단, 원본 Ultima IV 게임 데이터, 원본에서 추출한 private corpus, 사용자 save, 비밀 값은 계속 공개 금지다.

**입력 자료와 동결 기준**

| 자료 | 분석 checkout/파일 | 고정 값 |
|---|---|---|
| xu4 | `engine/` | `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71` (`https://github.com/xu4-engine/u4.git`) |
| Boron | `.omo/research/boron/` | v2.0.8 / `84e7a81f68aa7588419f7b164e94e096a1c3fa07` (`https://git.code.sf.net/p/urlan/boron/code`) |
| Faun | `engine/src/faun/` | `e175dbfabab468008906e724e9d3872097bdb560` (`https://codeberg.org/wickedsmoke/faun.git`) |
| GLV | `engine/src/glv/` | `20ab75d39ae1ab27c55f1eea09c83b3985738110` (`https://git.code.sf.net/p/outguard/glv`) |
| emsdk | 아직 미설치 | `4.0.23`, SDK repo tag commit `c0bb220cb6e6f4e0fabb6f6db9efd53390ef5e56` |
| 원본 데이터 | `/tmp/ultima4-source-aeN4qd/ultima4.zip` | 529099 bytes, SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74` |
| 배포 저장소 | `https://github.com/TaejinKim7-dev/ultima` | SSH `git@github.com:TaejinKim7-dev/ultima.git`, Pages base `/ultima/`, 예상 URL `https://taejinkim7-dev.github.io/ultima/` |

원본 재다운로드 URL은 `https://ultima.thatfleminggent.com/ultima4.zip`이다. `unzip -t`로 160개 파일 검사 통과했으며 TLK 16개, WORLD.MAP, SHAPES.EGA, TITLE.EXE, AVATAR.EXE를 확인했다. 런타임 호환성은 Todo 3에서 확인한다. 임시 경로의 존재에 의존하지 말고 없으면 다시 다운로드하여 고정 hash를 검사한다. GOG판과 같은 archive라고 단정하지 않는다.

자세한 근거는 [소스 분석 기록](../drafts/ultima-web-source-analysis.md)에 있다. 아래 `engine/...` 참조는 현재 읽을 수 있는 원형 소스다. Todo 1 이후 수정 대상은 동일한 상대 경로의 `vendor/xu4/...`이다. Boron은 `vendor/boron`, Faun은 `vendor/faun`으로 대응한다. 분석 checkout을 수정하지 않는다.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- TypeScript로 게임 엔진을 재작성하거나 에뮬레이터/다른 xu4 fork로 바꾸지 않는다. 게임 규칙을 바꾸는 개조는 요청되지 않았다.
- 로그인, 서버 DB, 클라우드 세이브, 모바일 터치 조작, 실시간 번역/TTS, LLM/API 키 입력 화면을 추가하지 않는다.
- 원본 ZIP/EXE/TLK/맵/세이브를 Git, Pages, 공개 테스트 fixture, CI artifact에 넣지 않는다. 한국어 번역 원천 JSON과 생성된 번역 lookup은 공개 repo/정적 배포물에 포함한다. 원래 `project.md`의 번역 미배포 방침은 이 요청으로 대체되었다.
- 원본 TLK의 288-byte record를 한국어로 덮어쓰거나 원본 바이너리를 수정하지 않는다. 표시 번역과 게임 로직의 키를 분리한다.
- 웹에서 Faun의 native mixer/pthread/PulseAudio를 억지로 링크하지 않는다. SharedArrayBuffer, COOP/COEP 우회 service worker, JSPI 필수화, 서버 proxy는 사용하지 않는다.
- HTML 패널을 붙이고 인트로/상태/엔딩이 영어 또는 깨진 문자로 남은 상태를 ‘한글화 완료’로 보고하지 않는다.
- 단순 grep, WASM 파일 생성, 제목 화면 screenshot 하나를 전체 게임 완료 증거로 사용하지 않는다. 테스트를 skip하거나 assertion을 약화해서 통과시키지 않는다.
- 테스트 전용 state control/cheat API, 개인정보/원문 덤프/게임 파일을 production bundle에 노출하지 않는다.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **TDD**. Native: CMake + CTest와 작은 C/C++ assertion harness. Web pure logic: Vitest. 실제 WASM 브라우저: Playwright. 구현 대상에서 실패하는 테스트를 먼저 실행하고 원인 메시지를 기록한 뒤 구현한다. 실행 환경 누락 실패를 behavioral RED로 계산하지 않는다.
- Repository policy: 새로 작성되는 모든 구현 코드는 `docs/TESTING_POLICY.md`를 따른다. 각 컴포넌트는 독립 Unit Test를 가져야 하며, RED 실패 로그 없이 GREEN 구현만 제출할 수 없다. 컴포넌트 Unit Test가 없거나 테스트 수가 0이면 해당 Todo는 완료가 아니다.
- Component coverage map: source/export tooling, module packaging, WASM bridge, WebGL renderer, input queue, data loader, persistence, message panel, overlay layout, Korean aliases, localization, audio, Pages artifact는 각각 전용 unit/fixture test를 갖는다. 브라우저/e2e QA는 Unit Test를 대체하지 않고 그 위에 추가된다.
- 도구/패키지 선택은 Node 22 LTS + npm lockfile, TypeScript strict + Vite의 vanilla DOM shell이다. React/Next.js/서버 framework는 필요하지 않다. npm 패키지는 Todo 1에서 설치한 정확한 버전을 package-lock.json에 고정한다.
- Evidence root: `.omo/evidence/ultima-web/`. 각 `task-N/`에 `red.log`, `green.log`, 필요한 screenshot/trace/요약 JSON을 기록한다. 원본 데이터 및 추출 영어 corpus는 이 디렉터리에도 복사하지 않는다. CI 공개 artifact에는 비공개 게임 화면/본문을 올리지 않고 pass/fail 요약을 올린다.
- 현재는 계획만 있으므로 아래 `npm run ...`과 scripts는 **구현할 인터페이스**다. 이미 존재하거나 실행했다고 오해하지 않는다. Todo 1에서 harness를 만들고 테스트를 각 todo에서 추가한다. 관련 test 파일이 없거나 테스트 수가 0이면 실패해야 한다.

| 최종 실행 명령(루트에서) | 계약 |
|---|---|
| `npm ci` | lockfile 기반 JS 개발 도구 설치 |
| `npm run deps:host` | native Boron/Faun 및 host prefix 준비; 필요한 OS 패키지 상태를 명확히 출력 |
| `npm run build:native` | 별도 build/native 소스/objects로 GLFW native 실행파일과 모듈 생성 |
| `npm run test:native -- -R <case>` | CMake configure/build 후 CTest regex 실행; 0 tests는 오류 |
| `npm run test:unit -- tests/unit/<name>.test.ts` | 해당 Vitest 테스트 실행 |
| `npm run test:unit` | 모든 TypeScript/JS component unit test 실행; 0 tests는 오류 |
| `npm run build:wasm -- --debug` | 고정 SDK, ASYNCIFY diagnostics, qa hooks 포함 별도 출력 |
| `npm run build:wasm` | production WASM; qa hooks 제외 |
| `npm run test:e2e -- tests/e2e/<name>.spec.ts --project=chromium` | 실제 WASM을 static server에서 구동; browser project는 firefox/webkit도 정의 |
| `npm run i18n:check` | inventory의 모든 필수 entry 번역/format/alias/폭/원본 hash 검사 |
| `npm run build:site -- --base=/ultima/` | Pages project-site 경로 산출물을 dist/에 생성 |
| `npm run audit:dist` | dist allowlist/CDI·preload inventory 검사, 원본 data 및 test hook 유출 차단 |
| `npm run verify:release` | production build, unit/native/e2e, i18n, artifact 검사 모두 실행; 하나라도 실패 시 nonzero |

게임 데이터 경로는 실행 시 `ULTIMA4_DATA` 환경변수로 지정한다. native QA는 Xvfb + xdotool로 실제 키를 보내고 screenshot과 게임 상태를 확인한다. 브라우저 테스트는 test-only fixture에서 생성한 합법적인 입력/진행 상태를 사용하되 최종 F3의 한 경로는 실제 새 게임 생성부터 시작한다. seed/replay는 보조 수단이며 controller를 우회한 조작만으로 완료를 주장하지 않는다.

성능 수치는 실측 후 보고하되 초기 제품 기준은 foreground 대기 중 1초 heartbeat 정지 없음, 입력 반영 250ms 이내(p95, 로컬 warmed artifact), 10분 반복 대화/메뉴 후 crash/지속적 메모리 증가 없음이다. 측정 브라우저/기기/샘플 수를 남긴다. 원작의 의도적인 대기·애니메이션 시간은 입력 지연으로 오판하지 않는다.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

Wave는 마일스톤 묶음이며 내부 작업이 모두 동시에 가능하다는 뜻이 아니다. 아래 의존성을 우선한다.

- Wave 1 (1–5): 소스/도구 동결, host 빌드와 native 기준 플레이, 번역 원천 inventory, 웹 UI/bridge 계약.
- Wave 2 (6–10): wasm Boron, GL, 안전한 loop/input dispatch, 데이터 초기화, 영속 저장. native 기준 플레이 통과 후 시작한다.
- Wave 3 (11–15): 메시지·상태·메뉴의 Unicode 표시, 입력 alias, 번역 runtime 경계, 전체 한국어 corpus.
- Wave 4 (16–20): 실제 오디오, 통합 게임 진행 QA, 실패/보안/회귀 QA, Pages 배포 workflow, 인수인계/재현 문서.
- Final: F1–F4 독립 검증. 공통 baseline SHA와 artifact hash를 기록한다.

동일한 `event.cpp`, `screen.cpp`, `config_boron.cpp`를 여러 작업자가 동시에 수정하지 않는다. 7/8, 11/12/13, 14/15는 별도 모듈 작업만 병렬화하고 통합은 하나의 담당자가 순서대로 한다.

**설계 계약: 구현자가 다시 선택하지 말 것**

1. 저장소: 원형 checkout은 `engine/`, `.omo/research/boron`에 그대로 남긴다. 고정 revision을 Git archive로 새 `vendor/xu4`, `vendor/boron`, `vendor/faun`, `vendor/glv`에 export하고 출처/라이선스를 함께 추적한다. 빈 목적지에만 export한다. 루트 `.gitignore`는 research checkout, game data, tools cache, build output을 제외한다. `engine/.git`을 삭제/이동하지 않는다.
2. 빌드: `build/host`, `build/native`, `build/wasm-debug`, `build/wasm-release`를 분리한다. configure가 source tree를 오염시키지 않도록 각 build directory에 source staging copy를 만든다. host Boron으로 패키지를 만들고 wasm Boron으로 읽는다. 단계별 native 결과와 비교한다.
3. 초기 Emscripten flags: `-O2 -sUSE_GLFW=3 -sUSE_LIBPNG=1 -sUSE_ZLIB=1 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -sASYNCIFY=1 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -lidbfs.js`. debug에 `-sASSERTIONS=2 -sASYNCIFY_STACK_SIZE=1048576`, 필요 export `FS`, `IDBFS`, `callMain` 및 bridge symbol 목록을 명시한다. stack 크기는 시작값이며 가장 깊은 대화/상점/엔딩 통과 후 확정한다. 처음부터 ASYNCIFY_IGNORE_INDIRECT/REMOVE 최적화를 적용하지 않는다. native `-lpthread/-lGL/-lfaun`를 wasm에 전달하지 않는다.
4. glue: 일반 ESM factory + `noInitialRun: true`. `locateFile`은 `new URL(name, engineAssetBase)` 기준. 실행 순서: factory resolve → FS 준비 → IDBFS populate 성공 → 사용자 ZIP 검증/주입 → 시작 gesture에서 audio 준비 → main 한 번 실행. 재시작은 기존 main을 다시 호출하지 않고 인스턴스 정리 후 page reload로 한다.
5. 가상 FS: `/assets/render.pak`, `/assets/Ultima-IV.mod`, `/data/ultima4.zip`, `/persist/profile/`. `initResourcePaths`와 settings의 웹 분기에서 이를 사용한다. 원본 ZIP은 MEMFS 세션 데이터이며 새 방문 시 재선택할 수 있다. 세이브/설정만 IDBFS로 영속화한다. upgrade ZIP은 기본 게임 실행의 필수 조건이 아니다.
6. Asyncify: DOM/GLFW callback은 command 또는 text-response를 queue에 복사할 뿐이다. controller dispatch와 모든 suspend는 엔진 실행 흐름 안에서만 수행한다. 한 frame에서 처리할 queue 경계를 snapshot하고, controller 전환 뒤 남은 반복키를 다음 prompt에 무작정 전달하지 않는다. foreground frame은 fsleep=0이라도 yield한다.
7. bridge: `vendor/xu4/src/web_bridge.{h,cpp}`와 `web/src/engine/bridge.ts`가 version 1의 계약을 공유한다. C ABI는 `u4_web_enqueue_key(int)`, `u4_web_submit_text(requestId,const char*,byteLength)`처럼 길이/요청 ID를 명시한다. 임시 pointer와 HEAP view는 호출 안에서 복사한다. 메모리 증가 뒤 이전 HEAP view를 재사용하지 않는다. 무효 requestId와 과대 입력은 거부한다.
8. 출력: `message`(UTF-8/control token), `clear`, `prompt`(종류/allowed keys/maxBytes/requestId), `view`(menu/status 위치와 tokens), `save-state`, `runtime-error` 이벤트를 정의한다. 원문 전체를 JS console에 찍지 않는다. HTML은 textContent/Text nodes로 만들고 게임 텍스트를 innerHTML로 해석하지 않는다.
9. 레이아웃: 게임 world raster 320×200 유지, desktop 기본 최소 2× 표시. status는 원래 x=192,y=8,width=120,height=64 logical rect와 title/summary를 따른다. canvas content rect의 실제 scale/letterbox/DPR를 사용한다. 화면 아래 대화창은 자연스러운 한글 줄바꿈과 history scroll을 제공한다. status는 구조화된 필드/짧은 번역으로 15×8칸에 들어가게 하며 원문 공백 정렬을 그대로 한국어에 적용하지 않는다. 좁은 창은 page scroll을 허용해 폰트를 읽을 수 있게 유지한다.
10. 한글 renderer: 별도 8×8 Hangul bitmap를 만들지 않는다. 게임 내부 status/menu text는 DOM overlay로, 긴 intro/castle/endgame text는 하단 패널로 표시한다. 원본 rune/avatar 마스크·지도 glyph는 raster로 남긴다. native는 영문 회귀 기준을 유지한다. overlay registry에 TextView 역할/수명/clear/scroll/cursor를 명시하고 stage/reset 때 제거한다.
11. 번역: `locales/ko/{ui,module,binary,tlk,aliases,glossary}.json`을 공개 source of truth로 둔다. ASCII semantic ID + Korean display text + placeholder signature + 제한된 metadata를 사용한다. source 영어 전문 inventory와 원본에서 추출한 private corpus는 `.local/`에만 두고 배포하지 않는다. build-time 도구가 C++ lookup와 Boron translation overlay를 생성하며 런타임 외부 JSON parser 의존성을 엔진에 추가하지 않는다. TLK 번역 lookup key는 `map:npcIndex:field`; binary는 `resource:table:index`다. 원본 키워드/행동 header는 그대로 둔다.
12. 입력: JS에서 NFC/trim 후 한국어 alias를 현재 대화 context의 canonical 영문으로 변환한다. 영어는 기존 prefix behavior를 유지한다. `compositionstart/end`, `isComposing`, 조합 확정 Enter 중복을 처리한다. NPC/free-answer, 숫자, 단일키, 이름 prompt를 구별한다. avatar 이름은 기존 최대 12 ASCII bytes와 16-byte save field를 유지한다. 숫자/명령/이름 prompt에 한국어를 억지로 허용하지 않는다.
13. 오디오: `sound_web.cpp`가 `sound.h` 전체를 구현하고 native Faun은 유지한다. Web Audio로 Ogg/WAV를 디코드하고 RFX만 Faun의 순수 C generator + 별도 seeded RNG로 PCM을 만든다. 임의의 무음 파일로 바꾸지 않는다. 사용 gesture 이후 시작하고 늦게 끝난 decode가 이전 음악을 다시 재생하지 않게 generation ID를 둔다. 한국어 음성 더빙은 요청되지 않았다.
14. Pages: single static page, project subpath와 root path 둘 다 테스트한다. 대상 repo는 `https://github.com/TaejinKim7-dev/ultima`이고 write remote는 `git@github.com:TaejinKim7-dev/ultima.git`, project-site base는 `/ultima/`다. PR이 `main`에 merge되면 GitHub Actions가 build/test/audit 후 Pages에 자동 공개 배포한다. 원본 파일은 직접 업로드 방식으로만 읽으므로 제3자 CORS proxy가 필요 없다. production staging은 allowlist로 만들고 `--preload-file .`는 금지한다. 이 계획은 구현자가 임의로 다른 원격 repo를 만들라는 지시가 아니다. SSH write 권한/기본 브랜치/Pages 설정이 없으면 Todo 19의 workflow와 로컬 dist까지 완성하고 정확한 배포 blocker를 기록한다.

계획 단계에서 새로 드러난 런타임 위험은 TDD 작업 안에 포함한다. 컴파일 실패는 해당 pinned source의 최소 수정으로 해결하고, 도구 버전 변경이 꼭 필요하면 실패 로그/새 pin/재검증 근거를 기록한다. 매번 사용자에게 기술 선택을 다시 묻지 않는다.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | 없음 | 2–20 | 없음 |
| 2 | 1 | 3,6 | 4,5 |
| 3 | 2 | 6–10 | 4,5 |
| 4 | 1 | 14,15 | 2,3,5 |
| 5 | 1 | 9,11,12,13 | 2,3,4 |
| 6 | 3 | 7,8,9,16 | 4,5 |
| 7 | 6 | 9 | 8의 독립 loop module |
| 8 | 6 | 9,13 | 7의 renderer module |
| 9 | 5,7,8 | 10–13,16 | 없음 |
| 10 | 9 | 17,18 | 11,12의 독립 TS modules |
| 11 | 5,9 | 13,14,17 | 10 |
| 12 | 5,9,11 | 14,17 | 10,13의 독립 input module |
| 13 | 8,9,11 | 14,17 | 12의 renderer module |
| 14 | 4,11,12,13 | 15,17 | 16의 audio module |
| 15 | 4,14 | 17,19 | 16 |
| 16 | 6,9 | 17,19 | 14,15 |
| 17 | 10,12,13,15,16 | 18,19 | 없음 |
| 18 | 17 | 19 | 없음 |
| 19 | 15,16,18 | 20 | 없음 (2026-09-25: workflow 골격은 branch `todo-19-pages-workflow`에서 이미 완성 -- `.github/workflows/pages.yml`, `npm run audit:dist`, `npm run verify:workflow`; 완전한 acceptance는 여전히 15,16,18 이후) |
| 20 | 19 | F1–F4 | 없음 |
| 21 | 6,8,9 | 10(e2e), 11,12,13,16,17 | 19의 workflow 골격 (2026-09-24 신규 — 실제 xu4 엔진을 wasm에 링크·실행, 세부 21.1~21.4) |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Freeze source, create root web project, and add test harness
  What to do / Must NOT do: initialize the root repository without deleting `engine/.git`; export pinned `engine/`, `.omo/research/boron/`, and `engine/src/faun/` into `vendor/xu4`, `vendor/boron`, and `vendor/faun`; add Node 22/Vite/TypeScript strict/Vitest/Playwright/CMake wrapper scripts; add `.gitignore` for research checkouts, build output, tool caches, and game data. Must not copy `ultima4.zip`, extracted original files, or temp research artifacts into Git or public artifacts.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2-20
  References (executor has NO interview context - be exhaustive): `.omo/drafts/ultima-web-source-analysis.md`; `handoff.md`; `engine/` at `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71`; Boron at `84e7a81f68aa7588419f7b164e94e096a1c3fa07`; Faun at `e175dbfabab468008906e724e9d3872097bdb560`; original ZIP hash `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`.
  Acceptance criteria (agent-executable): `npm ci`; `npm run verify:repo-sources` proves all pinned exports match recorded SHAs and no original game data is tracked; `npm run test:unit -- tests/unit/repo-sources.test.ts` has a RED log before implementation and GREEN after.
  QA scenarios (name the exact tool + invocation): happy: `npm run verify:repo-sources` writes `.omo/evidence/ultima-web/task-1/green.log`; failure: place a fake `ULTIMA4.ZIP` under a tracked candidate path and verify `npm run verify:repo-sources` rejects it, evidence `.omo/evidence/ultima-web/task-1/original-data-rejected.log`.
  Commit: Y | chore(repo): freeze sources and add web test harness

- [x] 2. Build host Boron/Faun and package xu4 modules reproducibly
  What to do / Must NOT do: make host-side Boron v2.0.8 and Faun build scripts that produce `render.pak`, `Ultima-IV.mod`, and optional `U4-Upgrade.mod` in a deterministic build directory. Patch Boron Makefile variable handling only as needed so `cc/ar/ranlib` can be overridden; do not pass nonexistent `--no-thread`; do not use wasm tools for host packaging.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3,6
  References: `engine/Makefile:13-30`; `engine/src/Makefile.common:86-98`; `engine/src/module.c:87-117`; `engine/src/config_boron.cpp:971-1005`; `.omo/research/boron/` v2.0.8 configure behavior.
  Acceptance criteria: `npm run deps:host` and `npm run build:modules` create module artifacts with recorded SHA-256; `npm run test:native -- -R module-package` proves `render.pak` and `Ultima-IV.mod` open through CDI/module loaders.
  QA scenarios: happy: build twice and compare artifact hashes in `.omo/evidence/ultima-web/task-2/reproducible-modules.log`; failure: corrupt a copied module in an isolated temp build and verify loader test fails with a clear CDI/module error, evidence `.omo/evidence/ultima-web/task-2/corrupt-module.log`.
  Commit: Y | build(modules): package xu4 assets reproducibly

- [x] 3. Establish native GLFW baseline against the original data
  What to do / Must NOT do: build the pinned xu4 native GLFW target from exported sources, point it at a verified `ULTIMA4_DATA` ZIP, and capture a real baseline: title screen, new game flow, movement, NPC talk, save, quit/restart/load. Must not count compile success or a static screenshot as gameplay verification.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 6-10
  References: `engine/src/xu4.cpp:201-264`; `engine/src/config_boron.cpp:1168-1183`; `engine/src/event.cpp:329-357`; `engine/src/game.cpp:298-377`; `engine/src/game.cpp:1162`; `engine/src/intro.cpp:907-912`.
  Acceptance criteria: `npm run build:native`; `ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip npm run qa:native-baseline` exits 0 and stores screenshots/state logs; CTest includes one negative case for missing/corrupt ZIP.
  QA scenarios: happy: Xvfb + xdotool drives title->new game->first save->restart/load, evidence `.omo/evidence/ultima-web/task-3/native-baseline/`; failure: run with wrong ZIP hash and verify startup blocks before game state mutation, evidence `.omo/evidence/ultima-web/task-3/bad-zip.log`.
  Commit: Y | test(native): lock original gameplay baseline

- [x] 4. Inventory every English source and create Korean localization schema
  What to do / Must NOT do: extract/inventory all display text from C++ strings, Boron module scripts, TLK records, `TITLE.EXE`, and `AVATAR.EXE`; create `locales/ko/{ui,module,binary,tlk,aliases,glossary}.json` with stable semantic IDs, placeholder signatures, source hashes, and field constraints. Must not overwrite TLK/EXE bytes or store the extracted full English corpus in public artifacts.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 14,15
  References: `.omo/drafts/ultima-web-source-analysis.md`; `engine/src/config_boron.cpp:1325-1340`; `engine/src/intro.cpp:24-29`; `engine/src/intro.cpp:130-140`; TLK 16 files in verified original ZIP, each 4608 bytes / 16 records * 288 bytes.
  Acceptance criteria: `npm run i18n:inventory` writes only hashed/private inventory under `.local/`; `npm run i18n:check` fails on missing translation, placeholder mismatch, over-wide status strings, or alias collision; tests cover TLK `map:npcIndex:field` and binary `resource:table:index` keys.
  QA scenarios: happy: complete schema sample passes `npm run i18n:check`, evidence `.omo/evidence/ultima-web/task-4/i18n-green.log`; failure: remove one required TLK translation and verify nonzero with exact key, evidence `.omo/evidence/ultima-web/task-4/i18n-missing-key.log`.
  Commit: Y | feat(i18n): inventory text and define Korean schema

- [x] 5. Define the browser shell, bridge ABI, and GitHub Pages asset contract
  What to do / Must NOT do: build the Vite static shell contract: `index.html`, canvas, lower dialogue panel, status overlay layer, file picker for original ZIP, import/export saves, and typed bridge events. Define C ABI version 1 and TS types for `message`, `clear`, `prompt`, `view`, `save-state`, and `runtime-error`. Must not add a server framework, login, cloud storage, or runtime translation API.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 9,11,12,13
  References: GitHub Pages docs: `https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site`; `https://docs.github.com/articles/creating-project-pages-manually`; Emscripten modularized/filesystem/OpenGL docs recorded in `.omo/drafts/ultima-web-source-analysis.md`; `engine/src/screen_glfw.cpp:584`; `engine/src/event.cpp:487-943`.
  Acceptance criteria: `npm run test:unit -- tests/unit/bridge-contract.test.ts`; `npm run build:site -- --base=/ultima/` emits `dist/index.html` at artifact root and no server-only files; typecheck has zero errors.
  QA scenarios: happy: Playwright loads static shell at `/ultima/`, opens file picker mock, and observes bridge-ready state, evidence `.omo/evidence/ultima-web/task-5/shell-ready.json`; failure: build with a wrong base path and verify route/asset checker fails before deploy, evidence `.omo/evidence/ultima-web/task-5/base-path-failure.log`.
  Commit: Y | feat(web): define static shell and bridge contract

- [x] 6. Build single-thread wasm Boron and xu4 core
  What to do / Must NOT do: compile Boron library and xu4 core with Emscripten 4.0.23 into modularized ES output; keep host/native/wasm object directories separate; use Asyncify and Emscripten filesystem; do not link native `pthread`, `GL`, PulseAudio, or Faun mixer into wasm.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 7,8,9,16
  References: `engine/src/config_boron.cpp:971-1005`; `engine/src/config_boron.cpp:1168-1183`; `engine/src/support/cdi.h:16-87`; `.omo/research/boron/`; Emscripten flags in this plan's Verification strategy.
  Acceptance criteria: `npm run build:wasm -- --debug`; `npm run test:unit -- tests/unit/wasm-symbols.test.ts` proves required exports exist; wasm build log includes Asyncify diagnostics and no native library leakage.
  QA scenarios: happy: instantiate the module in Playwright without running main and inspect exported bridge/FS symbols, evidence `.omo/evidence/ultima-web/task-6/wasm-instantiate.json`; failure: intentionally remove `FORCE_FILESYSTEM` in a temp config and verify symbol/FS test fails, evidence `.omo/evidence/ultima-web/task-6/missing-fs.log`.
  Commit: Y | build(wasm): compile single-thread xu4 engine

- [x] 7. Port OpenGL renderer to WebGL2-safe buffers and shaders
  What to do / Must NOT do: add web-safe GPU paths for dynamic work buffers and triangle lists using CPU staging plus `glBufferSubData`; update shader version/precision for WebGL2/GLES3; preserve native OpenGL behavior through compile-time branching. Must not assume `glMapBufferRange` or `glUnmapBuffer` exists in WebGL.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 9
  References: `engine/src/gpu_opengl.cpp:910-948`; `engine/src/gpu_opengl.cpp:963-985`; `engine/src/gpu_opengl.cpp:1387-1429`; `engine/src/gpu_opengl.cpp:1645-1679`; `engine/src/screen_glfw.cpp:425-485`.
  Acceptance criteria: RED first: a WebGL2 e2e test fails on current `glMapBufferRange`; GREEN: `npm run test:e2e -- tests/e2e/webgl-render.spec.ts --project=chromium` renders nonblank title/status pixels and shader compile logs have no errors.
  QA scenarios: happy: Chromium screenshot and pixel sample saved to `.omo/evidence/ultima-web/task-7/title-render.png`; failure: run with a forced bad shader fixture and verify runtime-error event plus nonzero test, evidence `.omo/evidence/ultima-web/task-7/bad-shader.log`.
  Commit: Y | fix(webgl): replace mapped buffers for WebGL2

- [x] 8. Convert blocking event loop and keyboard input to browser-safe queues
  What to do / Must NOT do: make DOM/GLFW callbacks enqueue immutable key/text events and let the engine consume them only from its normal input loop; add bounded queue, request IDs, prompt epochs, IME composition guards, and per-frame yield even when `fsleep=0`. Must not call controller dispatch directly from JS callbacks or retain stack controller pointers across Asyncify suspension.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 9,13
  References: `engine/src/event.cpp:216-357`; `engine/src/event.cpp:487-943`; `engine/src/screen_glfw.cpp:584`; `engine/src/intro.cpp:416-502`.
  Acceptance criteria: `npm run test:unit -- tests/unit/input-queue.test.ts`; `npm run test:native -- -R input-queue`; browser e2e proves repeated key during prompt transition is not delivered to the next prompt.
  QA scenarios: happy: Playwright sends movement, command key, NPC text, and IME Korean composition; evidence `.omo/evidence/ultima-web/task-8/input-flow.trace.zip`; failure: stale request ID submission is rejected and logged as a bridge error without game mutation, evidence `.omo/evidence/ultima-web/task-8/stale-request.log`.
  Commit: Y | feat(input): queue browser input safely

- [x] 9. Implement browser startup, original ZIP validation, and virtual filesystem layout
  What to do / Must NOT do: implement `noInitialRun` startup sequence: instantiate wasm, prepare MEMFS/IDBFS, validate user-selected `ultima4.zip`, mount `/assets`, write `/data/ultima4.zip`, populate `/persist/profile`, unlock audio on gesture, then call main exactly once. Must not bundle original data or call main again for restart.
  Parallelization: Wave 2 | Blocked by: 5,7,8 | Blocks: 10-13,16
  References: `engine/src/xu4.cpp:201-264`; `engine/src/config_boron.cpp:1168-1183`; `engine/src/support/cdi.c:50-82`; GitHub Pages `index.html` entry contract from GitHub Docs.
  Acceptance criteria: `ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip npm run test:e2e -- tests/e2e/startup-data.spec.ts --project=chromium`; assertions cover success, missing required files, wrong SHA allow/warn policy, corrupted ZIP, reload without reselecting data.
  QA scenarios: happy: verified ZIP reaches title screen with module assets loaded, evidence `.omo/evidence/ultima-web/task-9/startup-title.png`; failure: corrupt `WORLD.MAP` or missing TLK file is rejected before main, evidence `.omo/evidence/ultima-web/task-9/zip-validation.log`.
  Commit: Y | feat(web): validate original data and start wasm once

- [x] 10. Persist saves/settings in IDBFS with export/import
  What to do / Must NOT do: add a persistence coordinator that observes all save/settings write paths and flushes IDBFS after file close; expose `saving/saved/error` bridge states; add save backup export/import through the web shell. Must not rely on unload as the primary save path or flush only `gameSave`.
  Parallelization: Wave 2 | Blocked by: 9 | Blocks: 17,18
  References: `engine/src/game.cpp:298-377`; `engine/src/game.cpp:1162`; `engine/src/intro.cpp:907-912`; `engine/src/settings.cpp:406-510`.
  Acceptance criteria: `npm run test:unit -- tests/unit/persistence.test.ts`; `npm run test:e2e -- tests/e2e/save-reload.spec.ts --project=chromium` proves new game save, manual save, settings write, reload, export, import.
  QA scenarios: happy: create character, save, reload page, reselect ZIP, load saved state, evidence `.omo/evidence/ultima-web/task-10/save-reload.trace.zip`; failure: simulate IDBFS sync failure and verify UI shows recoverable error without claiming saved, evidence `.omo/evidence/ultima-web/task-10/idbfs-failure.log`.
  Commit: Y | feat(save): persist browser saves and settings

- [x] 11. Route long game messages to the HTML dialogue panel
  What to do / Must NOT do: convert screen message output into tokenized bridge events, render Korean/English text in a lower HTML panel with history/scroll/prompt state, and preserve control tokens such as clear, newline, backspace, right, color, prompt, and Hawkwind-style pauses. Must not append raw HTML or dump complete text to console.
  Parallelization: Wave 3 | Blocked by: 5,9 | Blocks: 13,14,17
  References: `.omo/drafts/ultima-web-source-analysis.md` screenMessage/TextView notes; `engine/src/event.cpp:909-943`; `engine/src/intro.cpp` text flow; `engine/src/config_boron.cpp:1325-1340`.
  Acceptance criteria: `npm run test:unit -- tests/unit/message-tokens.test.ts`; Playwright verifies panel rendering, clear behavior, prompt focus, CJK wrapping, and no `innerHTML` use for game text.
  QA scenarios: happy: run a talk/intro sequence and capture panel text layout, evidence `.omo/evidence/ultima-web/task-11/dialogue-panel.png`; failure: inject `<script>`-like translated text in a test locale and prove it renders as text, evidence `.omo/evidence/ultima-web/task-11/textcontent-safety.log`.
  Commit: Y | feat(ui): render dialogue in HTML panel

- [x] 12. Render status, menu, and short in-game text as DOM overlays
  What to do / Must NOT do: add an overlay registry for status/menu/TextView roles with logical rects, lifecycle cleanup, cursor/selection support, and DPR/letterbox scaling; keep map/runes/avatar masks in the raster canvas. Must not build an 8x8 Hangul bitmap font or use English fixed-space layout for Korean status fields.
  Parallelization: Wave 3 | Blocked by: 5,9,11 | Blocks: 14,17
  References: status rect contract in this plan; `engine/src/screen_glfw.cpp:425-485`; `engine/src/event.cpp:487-943`; `.omo/drafts/ultima-web-source-analysis.md` TextView/status notes.
  Acceptance criteria: `npm run test:unit -- tests/unit/overlay-layout.test.ts`; `npm run test:e2e -- tests/e2e/status-overlay.spec.ts --project=chromium` at 1x/2x/DPR variants proves overlays align and do not overlap.
  QA scenarios: happy: capture status/menu overlays at desktop sizes, evidence `.omo/evidence/ultima-web/task-12/status-overlay.png`; failure: shrink viewport to minimum supported width and verify page scroll/readability instead of clipped text, evidence `.omo/evidence/ultima-web/task-12/narrow-viewport.png`.
  Commit: Y | feat(ui): overlay Korean status and menus

- [ ] 13. Support Korean NPC aliases and prompt-specific input rules
  What to do / Must NOT do: implement context-aware Korean alias mapping to canonical English NPC keywords/answers while preserving original English prefix behavior and fixed save formats; distinguish NPC/free-answer, numeric, command, direction, and avatar-name prompts. Must not accept Korean in avatar name save field or change internal comparison IDs.
  Parallelization: Wave 3 | Blocked by: 8,9,11 | Blocks: 14,17
  References: `engine/src/event.cpp:487-943`; `engine/src/discourse.cpp:48`; `engine/src/config_boron.cpp:1325-1340`; `engine/src/savegame.h:256-266`.
  Acceptance criteria: `npm run test:unit -- tests/unit/korean-aliases.test.ts`; e2e asks an NPC with Korean and English keywords and reaches identical game state.
  QA scenarios: happy: Korean alias for a known NPC keyword maps to canonical answer and dialogue proceeds, evidence `.omo/evidence/ultima-web/task-13/npc-alias.trace.zip`; failure: Korean text in numeric/name prompt is rejected with prompt-specific message and no buffer overflow, evidence `.omo/evidence/ultima-web/task-13/prompt-reject.log`.
  Commit: Y | feat(input): add Korean aliases with prompt rules

- [ ] 14. Integrate localization runtime boundaries in C++ and web UI
  What to do / Must NOT do: generate static lookup tables or compact resources from `locales/ko/*.json`; wire C++ display calls, Boron translation overlay, TLK lookup, binary text lookup, and JS UI labels to the same semantic IDs. Must not add a runtime JSON parser to the C++ engine or localize internal command keys.
  Parallelization: Wave 3 | Blocked by: 4,11,12,13 | Blocks: 15,17
  References: `engine/src/config_boron.cpp:1325-1340`; `engine/src/module.c:210-328`; `engine/src/intro.cpp:24-29`; verified original ZIP file list; `locales/ko/*` from Todo 4.
  Acceptance criteria: `npm run i18n:check`; `npm run test:native -- -R localization-boundaries`; `npm run test:e2e -- tests/e2e/localized-flow.spec.ts --project=chromium`.
  QA scenarios: happy: intro, status, NPC talk, shrine/codex sample display Korean while logic remains English, evidence `.omo/evidence/ultima-web/task-14/localized-flow.png`; failure: alter one placeholder signature and verify build fails before runtime, evidence `.omo/evidence/ultima-web/task-14/placeholder-mismatch.log`.
  Commit: Y | feat(i18n): connect Korean localization runtime

- [ ] 15. Complete Korean translation corpus and glossary consistency
  What to do / Must NOT do: write the full Korean translation corpus for UI, module text, TLK NPCs, binary intro/castle/shrine/codex/endgame text, aliases, and glossary; run consistency checks for terms, placeholder signatures, width limits, and progression-critical answers. Must not leave English display text in covered gameplay paths or call an external translation API at runtime.
  Parallelization: Wave 3 | Blocked by: 4,14 | Blocks: 17,19
  References: `locales/ko/*`; `.local/` private inventory from Todo 4; `engine/src/intro.cpp`; `engine/src/config_boron.cpp:1325-1340`; verified TLK records.
  Acceptance criteria: `npm run i18n:check -- --strict`; `npm run test:e2e -- tests/e2e/korean-progression.spec.ts --project=chromium` covers at least intro, one town NPC, Lord British/Hawkwind, one shrine/codex answer sample, save/load UI.
  QA scenarios: happy: Korean screenshots bundle under `.omo/evidence/ultima-web/task-15/korean-screens/`; failure: insert banned untranslated ASCII display phrase in a test copy and verify strict check fails with semantic ID, evidence `.omo/evidence/ultima-web/task-15/untranslated-detected.log`.
  Commit: Y | feat(i18n): complete Korean translation corpus

- [x] 16. Implement Web Audio music, sound effects, and RFX generation
  What to do / Must NOT do: implement `sound_web.cpp` and TS Web Audio bridge for Ogg/WAV decode, playback, pause/resume/fade, generation IDs, and Faun RFX PCM generation. Predecode enough metadata before main so `soundDuration` remains synchronous. Keep native Faun backend unchanged. Must not ship fake silence or require SharedArrayBuffer/pthreads.
  Parallelization: Wave 4 | Blocked by: 6,9 | Blocks: 17,19
  References: `engine/src/sound_faun.cpp:91-222`; `engine/src/support/cdi.h:53-63`; `.omo/drafts/ultima-web-source-analysis.md` audio/RFX notes; Faun `sfx_gen.c` and RFX format notes from pinned checkout.
  Acceptance criteria: `npm run test:unit -- tests/unit/audio-manifest.test.ts`; `npm run test:e2e -- tests/e2e/audio.spec.ts --project=chromium` observes AudioContext unlock, nonzero music/effect buffers, pause/resume, and generation cancellation.
  QA scenarios: happy: title music starts after gesture and effect plays on command, evidence `.omo/evidence/ultima-web/task-16/audio-summary.json`; failure: delayed decode from old generation cannot restart stopped music, evidence `.omo/evidence/ultima-web/task-16/audio-generation-race.log`.
  Commit: Y | feat(audio): add browser music and effects

- [ ] 17. Run integrated gameplay progression QA in the browser
  What to do / Must NOT do: create deterministic e2e routes that play through meaningful slices: title/new game, overland movement, town entry, NPC talk with Korean alias, menu/status updates, combat or dungeon sample, shrine/codex sample, save/reload, and audio continuity. Must not bypass the public UI/keyboard surface for the done claim.
  Parallelization: Wave 4 | Blocked by: 10,12,13,15,16 | Blocks: 18,19
  References: all earlier web bridge, input, save, i18n, and audio tests; `engine/src/game.cpp`; `engine/src/intro.cpp`; `.omo/evidence/ultima-web/task-3/native-baseline/`.
  Acceptance criteria: `ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip npm run test:e2e -- tests/e2e/gameplay-progression.spec.ts --project=chromium`; at least one run starts from actual new-game flow instead of injected state; screenshots/traces prove user-observable behavior.
  QA scenarios: happy: full route trace and screenshots, evidence `.omo/evidence/ultima-web/task-17/progression.trace.zip`; failure: intentionally wrong Korean alias fixture fails at exact dialogue assertion, evidence `.omo/evidence/ultima-web/task-17/alias-regression.log`.
  Commit: Y | test(e2e): verify browser gameplay progression

- [ ] 18. Harden failure, privacy, and regression boundaries
  What to do / Must NOT do: add tests and checks for corrupt data, oversized ZIP, missing files, stale bridge requests, save sync failure, XSS-like text, memory growth, console leaks, original-data artifact leakage, and production test-hook leakage. Must not add cheat/state-control APIs to production bundles.
  Parallelization: Wave 4 | Blocked by: 17 | Blocks: 19
  References: Must NOT have section; `engine/src/support/cdi.c:50-82`; `engine/src/module.c:87-117`; bridge contracts from Todo 5; save contracts from Todo 10.
  Acceptance criteria: `npm run audit:dist`; `npm run test:e2e -- tests/e2e/failure-boundaries.spec.ts --project=chromium`; memory smoke runs 10 minutes or a bounded accelerated equivalent and records browser/version.
  QA scenarios: happy: production build has no original data/test hooks and failure states are recoverable, evidence `.omo/evidence/ultima-web/task-18/security-audit.log`; failure: add a fake original-data fixture to `dist` in temp and verify audit rejects it, evidence `.omo/evidence/ultima-web/task-18/dist-leak-rejected.log`.
  Commit: Y | test(web): harden browser failure boundaries

- [ ] 19. Build GitHub Pages workflow and project-site release artifact
  What to do / Must NOT do: configure the release for `https://github.com/TaejinKim7-dev/ultima` with SSH remote `git@github.com:TaejinKim7-dev/ultima.git`; create `.github/workflows/pages.yml` that installs pinned tools, builds/test/audits the site, uploads `dist/`, and deploys with official Pages Actions after PR merge to `main`. Include `.nojekyll`, base `/ultima/`, expected URL `https://taejinkim7-dev.github.io/ultima/`, and clear instructions for setting Pages Source to GitHub Actions. Verify SSH auth with a non-mutating command before the first push. Must not expose original data in Git, Pages, or Actions artifacts.
  Parallelization: Wave 4 | Blocked by: 15,16,18 | Blocks: 20 | (2026-09-24 re-plan: the workflow skeleton -- Node 22 CI, build/test/audit, Pages deploy of the current shell -- may start early, in parallel with Todo 21; Todo 19 is only marked done after its full acceptance, which still requires 15,16,18)
  References: GitHub Docs `configuring-a-publishing-source-for-your-github-pages-site`, `creating-project-pages-manually`, `using-custom-workflows-with-github-pages`; this plan's Pages guardrails.
  Acceptance criteria: `npm run build:site -- --base=/ultima/`; `npm run audit:dist`; `act` or `npm run verify:workflow` statically validates HTTPS URL, SSH write remote, Pages base `/ultima/`, required permissions `pages: write` and `id-token: write`, artifact root `index.html`, and no original data in artifact.
  QA scenarios: happy: serve `dist/` at `/ultima/` and `/` with Playwright smoke, evidence `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`; failure: remove `.nojekyll` or wrong artifact root in temp workflow and verify validator fails, evidence `.omo/evidence/ultima-web/task-19/workflow-failure.log`.
  Commit: Y | ci(pages): publish static web build via GitHub Pages
  (2026-09-25 skeleton progress, branch `todo-19-pages-workflow`, not yet merged to `main`): `.github/workflows/pages.yml` now exists (Node 22.23.3 pinned, all `uses:` actions pinned to full commit SHAs, `.nojekyll`, base `/ultima/`, Pages URL, HTTPS repo URL, SSH write remote, and setup instructions all in the file). `npm run audit:dist` (new, `scripts/audit-dist.mjs`) and `npm run verify:workflow` (new, `scripts/workflow-verifier.mjs` + `scripts/verify-workflow.mjs`) now exist with RED-then-GREEN unit tests (`tests/unit/audit-dist.test.ts`, `tests/unit/workflow.test.ts`) and pass against the real committed workflow file and the real `dist/` build. `npm run build:site -- --base=/ultima/` continues to pass. Still genuinely blocked on 15,16,18 for Todo 19's own full acceptance (Korean text, real audio, and Todo 18's fuller failure/privacy/regression audit that `audit:dist` will need to grow into). Separately discovered and left unresolved: a completely clean checkout (no local `build/wasm-release`) fails `npm run test:unit` on `tests/unit/wasm-symbols.test.ts`, because building the wasm engine needs a manually-installed pinned emsdk (docs/SOURCE_PINS.md) that no npm script or CI step installs yet -- only that one suite's own step is `continue-on-error` (with an inline comment explaining this); every other unit test still hard-gates `build` and `deploy`, confirmed by running the workflow's exact split-step commands against a genuinely clean clone (`npx vitest run --exclude tests/unit/wasm-symbols.test.ts` exits 0, the wasm-symbols-only command exits 1 without blocking the job). The CI-produced `dist/` therefore has no `/engine/` files (shell only, matching the re-plan's "deploy of the current shell" scope). A second advisor review also caught an actual YAML syntax bug (an unquoted step `name:` containing `": "`, which GitHub would have rejected before running any job) that the text-based `verify:workflow` validator could not see -- fixed and reproduced with a real parse (`python3 -c "import yaml; yaml.safe_load(...)"`) both before (real `mapping values are not allowed here` error) and after the fix. Branch tip: commit `342fe4a` (3 commits: `5f93788` skeleton, `205fcec` advisor-review-1 hardening, `342fe4a` advisor-review-2 YAML fix). Checkbox intentionally left `[ ]`.

- [ ] 20. Write reproducible handoff, user guide, and release evidence index
  What to do / Must NOT do: update `README.md`, `docs/WEB_PORT.md`, `docs/GITHUB_PAGES.md`, and `handoff.md` with exact build/run/test/deploy instructions, source pins, data handling policy, browser support, known limitations, and evidence index. Must not claim deployment happened unless a Pages URL was actually produced in the execution session.
  Parallelization: Wave 4 | Blocked by: 19 | Blocks: F1-F4
  References: all task evidence roots; `handoff.md`; GitHub Pages docs; final package manifests/workflow.
  Acceptance criteria: `npm run verify:release-docs` checks commands, pins, evidence links, and no stale placeholder text; README quickstart can be executed locally from a clean clone with user-provided `ULTIMA4_DATA`.
  QA scenarios: happy: follow docs in a fresh temp clone through `npm ci`, `npm run build:site`, static serve smoke, evidence `.omo/evidence/ultima-web/task-20/fresh-clone.log`; failure: remove one required source pin and verify docs verifier fails, evidence `.omo/evidence/ultima-web/task-20/missing-pin.log`.
  Commit: Y | docs(release): document web build and Pages handoff

- [x] 21. Link and run the real xu4 engine in the browser (replace the placeholder web entry point)
  What to do / Must NOT do: the current wasm build (Todo 6's `scripts/build-wasm.mjs`) compiles only 29 of the engine's 74 top-level source files, and `scripts/web-main.cpp`'s `main()` returns immediately, so the linker dead-strips everything: as of 2026-09-24 `build/wasm-release/xu4.wasm` contains only libc/libc++ runtime code plus the two bridge exports (`u4_web_enqueue_key`, `u4_web_submit_text`) and no game code at all (verified with `llvm-nm --defined-only`). Replace this with the real engine: build from the same source list the native build uses (`vendor/xu4/src/Makefile.common` `CSRCS`/`CXXSRCS` with `UI=glfw` through Emscripten's `-sUSE_GLFW=3` port and `CONF=boron`, i.e. `module.c`, `support/cdi.c`, `config_boron.cpp`), compile the real `src/xu4.cpp` `main()` instead of `scripts/web-main.cpp`, and remove the invented stubs in `scripts/web-stub.cpp` -- several of its names (`gpuInit`, `gpuBeginFrame`, `savegameSave`, `xu4_config_get`) exist in no engine header, and `screenInit`/`soundInit` are declared `extern "C"` returning `void` while the real functions have C++ linkage and different signatures, so they satisfy nothing. Do NOT add `gpu_opengl.cpp`, `discourse_tlk.cpp`, `discourse_castle.cpp`, or `config_data.cpp` as separate sources: `screen_glfw.cpp`, `discourse.cpp`, and `config_boron.cpp` already `#include` them, and adding them again would duplicate definitions. The only new engine-side file expected is a silent `sound.h` backend (every function declared in `vendor/xu4/src/sound.h`, as no-ops with zero durations), because `sound_faun.cpp` pulls in the Faun mixer, PulseAudio, and pthread; Todo 16 later replaces it with real Web Audio. Must not reintroduce native-only libraries (GL/pthread/libfaun/libpulse) into the wasm link; must not bypass Todo 9's startup sequence (main is still called exactly once, from `src/engine/startup.ts`); must not weaken the Todo 8 input-queue or Todo 10 persistence-coordinator contracts.
  Sub-steps (each has its own gate; Todo 21 is done only when all four pass):
    21.1 Links: the full native source list + real `xu4.cpp` + the silent sound backend link under emcc with `ERROR_ON_UNDEFINED_SYMBOLS` left at its default. Treat the first link's undefined-symbol list as the real scope list. Also fix `scripts/build-wasm.mjs`'s `-DVERSION='"DR-1.0"'`: the single quotes reach emcc literally through `spawnSync`, producing a multi-character int constant that `game.cpp:1351` passes to `%s` (a crash once that line becomes reachable).
    21.2 FS and paths resolve: `render.pak` and `Ultima-IV.mod` are currently only served over HTTP at `/engine/modules/` and never written into the wasm FS (`/assets` is created empty). Write them to a path the engine actually searches (`initResourcePaths` in `xu4.cpp` searches `.`, `$HOME/.local/share/xu4`, `/usr/share/xu4`, `/usr/local/share/xu4`). `u4fsetup` looks for `ultima4.zip` only in `.` and `u4` (`u4file.cpp:152-153`), so Todo 9's `/data/ultima4.zip` is not found unless the cwd or the search path is adjusted. Confirm where `Settings::init` puts the user path under emcc (the `__unix__`/`__linux__` branch in `settings.cpp`, the emcc `$HOME` value, or `-p <profile>` -> `./profiles/<profile>/`) and make saves/settings land inside Todo 10's IDBFS mount (`/persist/...`), or move the mount.
    21.3 Title screen renders: bind `Module.canvas` to `#game-canvas`; a verified `ULTIMA4_DATA` reaches an actually rendered, non-black title screen (reuse Todo 7's pixel-check approach, but against the real renderer instead of the standalone shader harness).
    21.4 Real input: one real keypress observably changes real game state. Decide which input path is authoritative -- the GLFW port installs its own DOM keyboard listeners while `src/main.ts` also enqueues keydown events into the Todo 8 queue -- so every key is delivered exactly once.
  After 21.4: re-verify Todo 7 against the real renderer, Todo 8 against a real controller, and add Todo 10's missing `tests/e2e/save-reload.spec.ts`.
  Parallelization: Wave 2 | Blocked by: 6,8,9 | Blocks: 10 (its still-missing e2e proof),11,12,13,16,17 | Can run alongside: Todo 19's workflow skeleton
  References: `vendor/xu4/src/Makefile.common` (the native source list to mirror); `vendor/xu4/src/xu4.cpp` (real `main`, `initResourcePaths` ~200-228, `servicesInit` ~236-264); `vendor/xu4/src/u4file.cpp:95-160` (`u4fsetup`, zip search paths); `vendor/xu4/src/settings.cpp:55-135` (user path); `vendor/xu4/src/sound.h` (full API the silent backend must implement); `vendor/xu4/src/screen_glfw.cpp` (includes `gpu_opengl.cpp`, which carries Todo 7's WebGL2 branch); `scripts/build-wasm.mjs`, `scripts/web-main.cpp`, `scripts/web-stub.cpp` (to be replaced/removed); `src/engine/startup.ts` (Todo 9, calls main); `src/engine/persistence.ts` (Todo 10); `.omo/drafts/step-10-idbfs-design.md`; `.omo/drafts/step-11-13-korean-ui-design.md`.
  Acceptance criteria: `npm run build:wasm -- --debug` links the full engine, and `llvm-nm --defined-only build/wasm-release/xu4.wasm` shows engine symbols (e.g. `GameController`); `npm run test:unit -- tests/unit/boot-sequence.test.ts` covers whatever init logic can be isolated from a full wasm run (e.g. FS/path preparation); `ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip npm run test:e2e -- tests/e2e/boot-sequence.spec.ts --project=chromium` proves a non-black rendered title screen and one real keypress changing game state.
  QA scenarios: happy: verified ZIP -> rendered title screen + one real keypress, evidence `.omo/evidence/ultima-web/task-21/title-render.png`; failure: a deliberately missing module file fails loudly through a `runtime-error` bridge event instead of a silent black screen, evidence `.omo/evidence/ultima-web/task-21/boot-failure.log`.
  Commit: Y (one commit per sub-step is fine) | feat(web): link and run the real xu4 engine in the browser

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Scope: verify every Must have and Must NOT have item maps to completed task evidence; verify no placeholder remains, no original data is tracked, and every command listed in Verification strategy exists and was run.
  Required evidence: `.omo/evidence/ultima-web/final/F1-plan-compliance.md`; include `git status --short`, task row checklist, and SHA-256 of `dist/`.
  Verdict: APPROVE only if all mapped requirements have concrete evidence paths and all failed attempts are either fixed or recorded as pre-existing/external blockers.

- [ ] F2. Code quality review
  Scope: inspect changed C/C++/TS/build files for minimality, ownership boundaries, memory/pointer lifetime, Asyncify safety, WebGL/WebAudio portability, type safety, and production/test separation.
  Required evidence: `.omo/evidence/ultima-web/final/F2-code-quality.md`; include commands `npm run typecheck`, `npm run test:unit`, `npm run test:native`, and build logs.
  Verdict: APPROVE only if no blocker findings remain and all warnings are either fixed or explicitly documented as non-blocking with evidence.

- [ ] F3. Real manual QA
  Scope: use the built site the way a player would: open static site, select original ZIP, start game, create/load save, move, talk, enter Korean aliases, hear audio, reload, export/import save. Run Chromium, Firefox, and WebKit projects where supported.
  Required evidence: `.omo/evidence/ultima-web/final/F3-real-browser-qa/` with screenshots, Playwright traces, browser versions, and observed results.
  Verdict: APPROVE only if observable browser behavior satisfies the user-facing request; skipped browsers require exact environment reason.

- [ ] F4. Scope fidelity
  Scope: compare final product to this plan and the user's direction: web 기반, GitHub Pages 연결 가능, TDD, Korean pretranslation, no external translation tool, no server/cloud save, original data not bundled.
  Required evidence: `.omo/evidence/ultima-web/final/F4-scope-fidelity.md`; include `npm run audit:dist`, workflow validation, and a Pages-readiness checklist.
  Verdict: APPROVE only if the release artifact can be hosted as static HTML/WASM/JS/assets and every deviation is approved by the user.

## Commit strategy

Use feature branches and pull requests. `main` stays the stable integration branch. Do not commit implementation work directly to `main` except repository administration changes explicitly requested by the owner.

Create one branch per Todo or tightly coupled Todo group, named `todo-<number>-<short-topic>` such as `todo-08-input-queue`. Open a PR for each branch with the Todo number, RED/GREEN logs, component Unit Test result, QA evidence path, and risk notes. Merge only after the PR evidence shows the required tests and checks passed.

Use one commit per completed todo, in dependency order, after that todo's RED/GREEN and QA evidence are written. Do not squash across unrelated risk surfaces: build/tooling, native baseline, WASM, renderer, input, save, UI, i18n, audio, QA, Pages, and docs each need reviewable boundaries. Suggested message forms are already listed on each todo.

Before any commit:

- `git status --short` must show only files belonging to the current todo or clearly documented generated outputs.
- No original ZIP, extracted original DOS files, private English corpus, browser cache, or `.omo/evidence` binary blobs intended to stay local may be staged unless explicitly allowed by docs.
- Generated lockfiles and workflow files are staged with the code that requires them.
- A failed verification log may be kept under `.omo/evidence/ultima-web/task-N/` but should not be committed unless the repository policy decides evidence artifacts are tracked. The default is to keep bulky evidence local and commit compact summaries/docs only.
- Every PR must pass the component-specific Unit Test before e2e/manual QA is accepted as completion evidence.

## Success criteria

Execution is complete only when all of the following are true:

- The game runs from a static GitHub Pages-compatible artifact: `dist/index.html` at artifact root, JS/WASM/assets under relative paths, `.nojekyll`, no server dependency.
- A user can open the site, choose their own original `ultima4.zip`, reach the title/new game flow, play with keyboard, save, reload, export/import save, and hear music/effects.
- Korean display covers UI, long messages, status/menu overlays, NPC talk, key binary-scripted story surfaces, and progression-critical answers; Korean aliases work while original English commands still work.
- Native GLFW baseline still builds and passes the planned regression checks; browser build passes Chromium e2e plus Firefox/WebKit smoke where environment permits.
- `npm run verify:release` passes from a clean checkout with user-provided `ULTIMA4_DATA`.
- `npm run audit:dist` proves the public artifact contains no original game data, private extracted corpus, test hooks, secrets, or unexpected server files.
- GitHub Actions Pages workflow is present and validated for automatic public deployment from `main` on `https://github.com/TaejinKim7-dev/ultima` with SSH remote `git@github.com:TaejinKim7-dev/ultima.git`; if SSH write/Pages permission/default branch is missing, the exact blocker is recorded and local `dist/` remains deploy-ready for `/ultima/`.
- F1-F4 all APPROVE with evidence paths, and `handoff.md` is updated to point at the finished plan, source pins, build commands, and any remaining external blockers.
