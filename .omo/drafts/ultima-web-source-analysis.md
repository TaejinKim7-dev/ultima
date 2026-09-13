# Ultima IV 웹 한글판: 소스 분석 및 인수인계 기록

분석일: 2026-09-07 KST. 실제 소스 열람과 원본 ZIP 무결성 검사를 수행했다. 엔진 컴파일, 게임 실행, WASM 빌드, 브라우저 플레이는 아직 수행하지 않았다. 이 문서에서 **확인**은 정적 소스 확인이며 **검증 과제**는 실행 담당자가 증명해야 하는 항목이다.

최종 실행 계획: [ultima-web.md](../plans/ultima-web.md). 원래 인수인계 문서: [project.md](../../project.md). 요구사항 결정 기록: [ultima-web.md](ultima-web.md).

## 1. 사용자가 확정한 결과

- Ultima IV 전체 게임을 데스크톱 브라우저와 키보드로 플레이한다. xu4의 DOS 기본 EGA 그래픽과 원작 규칙을 기준으로 한다.
- 네이티브 기준 실행 → 웹 구동 → 업로드/세이브 → 한글 표시/입력/레이아웃 → 전체 번역 → 실제 오디오까지 모두 범위에 포함한다.
- 긴 대화는 게임 화면 아래 HTML 영역에 표시한다. 상태 정보는 게임 화면의 원래 위치에 둔다.
- NPC 키워드는 한글과 영어를 모두 지원한다. 기존 명령키와 원작의 대화/퀘스트 분기는 보존한다.
- 번역은 개발 담당 AI가 미리 작성하고 배포물에 포함한다. 사용자 번역 도구, API 키, 외부 번역 서비스, 실행 중 LLM 호출은 없다.
- GitHub Pages에 배포할 수 있는 정적 사이트를 만든다. 원본 게임 ZIP/맵/실행파일/대화 데이터는 배포하지 않는다.
- TDD로 구현한다. 자동 테스트 외에 실제 네이티브와 브라우저 플레이 증거가 필요하다.
- 기존 한글 PoC는 없고 원본 데이터만 있었다. 사용자 요청으로 원본 데이터도 직접 찾아 확보했다.
- 최신 요청은 소스 다운로드·분석·구체적인 계획 문서 작성까지 승인한다. 이번 세션은 제품 구현, 원격 저장소 생성, push, 배포를 수행하지 않는다.

## 2. 확보한 자료와 재현 정보

| 자료 | 현재 위치 | 고정 식별자 |
|---|---|---|
| xu4 | `engine/` | `https://github.com/xu4-engine/u4.git`, `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71` |
| Faun | `engine/src/faun/` | upstream gitlink `e175dbfabab468008906e724e9d3872097bdb560` |
| Boron | `.omo/research/boron/` | `https://git.code.sf.net/p/urlan/boron/code`, tag `v2.0.8`, `84e7a81f68aa7588419f7b164e94e096a1c3fa07` |
| Emscripten SDK 채택 기준 | 아직 설치하지 않음 | emsdk tag `4.0.23` 존재 확인; tag commit `c0bb220cb6e6f4e0fabb6f6db9efd53390ef5e56` |
| DOS 원본 데이터 | `/tmp/ultima4-source-aeN4qd/ultima4.zip` | 529,099 bytes; SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74` |

원본 ZIP 출처: [배포 설명](https://ultima.thatfleminggent.com/u4download.html), [ZIP](https://ultima.thatfleminggent.com/ultima4.zip), 배포자가 공개한 [Origin 관련 서신](https://ultima.thatfleminggent.com/boomer.txt). 이 ZIP은 잡지 배포판으로 설명되어 있으며 GOG판과 바이트 단위로 같다고 확인한 것은 아니다. [GOG 공식 상품](https://www.gog.com/en/game/ultima_iv_quest_of_the_avatar)도 존재한다. xu4의 `engine/Makefile:39` 역시 같은 호스트의 ZIP 다운로드 규칙을 갖고 있다.

`unzip -t`에서 160개 파일 검사 통과. `WORLD.MAP` 65,536 bytes, `SHAPES.EGA` 32,768 bytes, `AVATAR.EXE`, `TITLE.EXE`, TLK 16개 존재. TLK 각각 4,608 bytes = 288 bytes × 16 records. 임시 파일이 사라지면 같은 URL로 재다운로드하여 해시를 재검증한다. 이 사실만으로 실제 xu4 실행 호환성이 증명되지는 않는다.

저장소 루트는 아직 Git 저장소가 아니며 `engine/.git`만 존재한다. `engine/`은 원형 소스 보관용 checkout으로 유지한다. 최종 계획은 별도 `vendor/`로 고정 소스를 export해 루트 저장소에 일반 파일로 관리한다. 중첩 Git 저장소를 실수로 gitlink로 커밋하는 문제를 피한다. `engine/.git`을 삭제할 필요가 없다.

## 3. 원문에서 수정해야 할 사항

| 원래 문서의 주장/범위 | 실제 확인 | 개발 계획의 수정 |
|---|---|---|
| glad가 웹의 큰 공통 장애물 | `gpu_opengl.h:1`의 glad include, `gpu_opengl.cpp:166`의 glad.c include, `screen_glfw.cpp:425`의 로더가 모두 Windows 조건부 | 이미 보호된 코드를 무조건 제거하지 않는다. 웹용 GLES3 include/컨텍스트/셰이더 경로를 추가한다. |
| `module/`를 preload하면 됨 | `Makefile:13`, `config_boron.cpp:971`, `module.c:87`은 패키지 로딩 구조 | host Boron으로 만든 `render.pak`, `Ultima-IV.mod`를 preload한다. 디렉터리 통째 번들 금지. |
| 번역 원천은 C++/Boron/TLK 세 가지 | `intro.cpp:91`, `discourse.cpp:67`, `shrine.cpp:51`, `codex.cpp:38`에서 DOS EXE string table 로드 | `TITLE.EXE` 도입부, `AVATAR.EXE` 성/신전/엔딩도 별도 번역 ID로 포함한다. |
| `frameSleep()`만 치환 | `event.cpp:216` pause와 `screen_glfw.cpp:485` shake도 `msecSleep()` 사용 | 중앙 sleep 분기와 매 프레임 zero-delay yield를 함께 다룬다. |
| GLFW callback을 그대로 두고 Asyncify만 추가 | `screen_glfw.cpp:233`에서 controller를 즉시 호출 | 브라우저 이벤트는 queue에 넣고 실행 루프에서만 dispatch한다. 중첩 async unwind를 방지한다. |
| 한글 비트맵 PoC 통합이 필수 선행 | PoC 없음; 원본 화면은 320×200, status는 15×8 cells | 웹에서는 HTML 대화층과 원래 status 위치의 고해상도 텍스트층으로 구현한다. 없는 PoC를 있다고 가정하거나 불필요하게 다시 만들지 않는다. |
| Faun 믹서 스레드 가능성 미확인 | 실제 Faun native Makefile/source가 pthread와 플랫폼 오디오 사용 | native Faun 유지, 웹은 `sound_web.cpp` + Web Audio. 순수 C RFX 합성만 재사용한다. |
| 세이브는 IDBFS sync 호출 하나 | `game.cpp:298`가 party/monsters 및 던전 파일을 나누어 기록 | 모든 파일 쓰기 종료 후 저장 세대를 확정하고 IDBFS flush 성공을 알려야 한다. |
| 원문 번역 결과 미배포 | 사용자가 사전 번역 포함을 명시적으로 지시 | 원본 데이터 미배포는 유지하되 번역 결과와 필요한 라이선스 고지는 포함한다. |

## 4. 엔진 구조와 실제 수정 지점

### 실행/렌더링

`xu4.cpp:353 main` → `servicesInit` → `Settings::init`/`u4fsetup`/`configInit`/`soundInit` → StageIntro 또는 StagePlay → `EventHandler::runController` → `EventHandler::run`.

- `event.cpp:329`: controller가 종료될 때까지 도는 중첩 루프. 상점/대화/대기에서 재귀 진입할 수 있다.
- `event.cpp:230`: fsleep가 0이면 현재는 sleep을 전혀 하지 않는다. 웹은 이 경우에도 이벤트 루프에 제어권을 넘겨야 한다.
- `support/getTicks.c`: 네이티브는 `nanosleep`. 웹 분기는 `emscripten_sleep`를 사용한다.
- `screen_glfw.cpp:161`, `:245`, `:583`: 키/포인터 callback과 `handleInputEvents`. 브라우저 callback에서 controller를 직접 호출하지 않는 경로가 필요하다.
- `gpu_opengl.cpp:42`: GLSL 330/310 es; WebGL2용 300 es + precision이 필요하다. 셰이더는 `module/render/shader/`에도 있다.
- `screen_glfw.cpp:350`: desktop context hints, monitor/fullscreen/cursor API는 웹 분기를 만든다. fullscreen은 사용자 gesture에 묶는다.
- `gpu_opengl.cpp:578`: 텍스처 internal format이 GLES 여부에 따라 달라진다. WebGL2에서 RGBA upload 조합까지 검증한다.

### 빌드/Boron/모듈

- `configure`: `--glfw` 지원, WASM target 없음. Linux 기본은 glv이므로 native 검증에서도 `--glfw`를 명시한다.
- `src/Makefile`: Faun/Boron/pthread/GLFW/OpenGL native 링크가 하드코딩되어 있다. WASM은 별도 Makefile을 사용한다.
- `src/Makefile.common`: C/C++ 목록과 `sound_$(SOUND).cpp`, `screen_$(UI).cpp` 선택이 있다. `gpu_opengl.cpp`, `discourse_tlk.cpp`, `script_boron.cpp` 등의 include 방식도 확인하고 중복 컴파일하지 않는다.
- Boron은 host CLI(패키지 생성)와 wasm static library(런타임)가 각각 필요하다. host/wasm의 `.o`, include staging, config.opt는 분리한다.
- **Boron v2.0.8에는 `--no-thread` 옵션이 없다.** 기본 thread=off이므로 `--thread`를 주지 않는다. `--static --no-execute --no-socket`를 사용하고 기본 zlib/random/hashmap을 유지한다.
- Boron Makefile은 `cc`를 recipe에 직접 쓰고 `AR_LIB=ar rc`를 설정한다. `emmake make`만 실행해서는 compiler 교체가 보장되지 않는다. 도구 변수화 패치가 필요하다.
- Boron의 `UThread*`는 VM context이며 OS pthread 활성화와 동일하지 않다. 타입/GC/context를 제거하지 않는다.
- `eval/wait.c`, `unix/os.c`, `src/support/cdi.c`의 POSIX/endian 헤더는 실제 WASM compile gate 대상이다.
- `config_boron.cpp:971`에서 Boron으로 host가 만든 직렬화 CONF를 해제한다. 한글 포함 host→wasm serialize roundtrip도 테스트한다.

### 대화/번역/입력

`game.cpp:2491 talk` → `talkAt` → `discourse_run` → TLK / castle / vendor / Boron 대화.

- `discourse_tlk.cpp:266`: 첫 3 bytes가 행동 메타데이터, 다음 12개 NUL 문자열을 읽는다. 원본 pointer/record에 긴 UTF-8 번역을 덮어쓰지 않는다.
- `discourse_tlk.cpp:69`, `:349`, `:440`: 영어 명령 및 topic prefix matching. 한국어 별칭은 현재 NPC/context에서 canonical key로 바꾼 뒤 원래 분기로 보낸다.
- `event.cpp:485`: ReadStringController는 ASCII bitset. `event.cpp:921`은 고정 readStringBuf로 복사한다. 무조건 UTF-8 bytes를 이 경로에 밀어 넣지 않는다.
- `screen.cpp:399`: format 후 buffer size 처리. `vsnprintf` 반환값이 실제 버퍼보다 클 수 있으므로 한글 도입과 함께 유효 byte 수 및 Unicode 경계를 검사한다.
- `screen.cpp:436 screenMessageCenter`는 길이 제한 없는 복사 경로. 변경 대상에 포함하고 긴 번역 회귀 테스트를 먼저 만든다.
- `screen.cpp:466`은 newline/backspace/carriage-return/right/color를 처리한다. HTML은 단순 append-only 로그가 아니라 control semantics를 보존하는 message model을 갖는다.
- `TextView::textAt`, `textAtFmt`, `textSelectedAt`, `scroll`, `clear`는 별도 텍스트 경로. 인트로/메뉴는 context `c`가 없으므로 screenMessage hook 하나로는 해결할 수 없다.
- `stats.cpp:100`의 view 전환/flash/aura invalidation을 텍스트 overlay에 반영한다. rune/avatar mask는 원본 glyph로 유지한다.
- `savegame.h:168`, `savegame.cpp:258`: 이름은 16 bytes 고정; intro 입력은 최대 12 ASCII bytes. 플레이어 이름은 이 규격을 유지하고 동료/직업 이름의 번역은 display-only로 한다. 한국어 NPC 입력 지원과 저장 이름 포맷 변경을 혼동하지 않는다.
- `shrine.cpp`, `codex.cpp`, `discourse_castle.cpp`도 의미 있는 문자열 비교를 한다. 표시 문자열을 번역했다고 비교 대상까지 바꾸면 진행이 막힌다. canonical answers와 표시 번역을 분리한다.

### 저장/업로드

- `xu4.cpp:196`의 자원 탐색은 현재 디렉터리와 OS user paths이다. 웹은 `/assets`, `/data`, `/persist`를 명시한다.
- `settings.cpp`: native user path/`profiles` 처리; 웹 저장 path는 `/persist/profile/`로 고정하고 사이트별 IndexedDB 분리를 문서화한다.
- `game.cpp:298`: party.sav, monsters.sav, dngmap.sav, outmonst.sav; `settings.cpp`의 설정 파일도 저장 대상이다.
- 일부 `fwrite`/`fclose` 실패를 기존 코드가 확인하지 않는다. 웹이 저장 성공을 보장하려면 수정 범위 내에서 이 반환값도 검사한다.
- ZIP은 `/data/ultima4.zip`에 쓰며 `u4file.cpp`가 읽는다. ZIP entry 이름 정규화, 중복 이름, 비정상 압축 크기, TLK 경계를 엔진 진입 전에 검증한다. 브라우저 데이터 선택으로 실행파일을 네이티브 실행하지 않는다.

### 오디오

- `sound.h` 전체 API가 계약이다. `sound_faun.cpp`의 음악/효과음/발화 volume, fade, stop, duration, suspend 동작을 보존한다.
- `Config::soundFile/musicFile`이 반환한 CDIEntry의 `offset`과 `bytes` 범위만 복사한다. 음악 ID는 내부에서 1을 빼고, 효과음 ID는 그대로 쓴다.
- 원본 모듈 자산은 Ogg/WAV/RFX가 섞여 있다. `.rfx`를 `decodeAudioData`에 넣으면 안 된다.
- `faun/support/sfx_gen.c`는 MIT 표기의 순수 C generator. `sfx_random`은 호출자가 제공해야 하며 Faun WELL512 시드를 맞춘다. 44.1kHz/최대 6초 생성 semantics를 보존한다.
- Faun `faun.c:658`의 RFX v200 header/parameter 읽기와 `:382`의 PCM 변환이 참고점이다. native device/mixer/pthread를 통째로 웹에 링크하지 않는다.
- 게임 시작 클릭에서 AudioContext를 생성/resume한다. 디코딩과 현재 track 전환의 비동기 순서, pause 후 재개, 음소거 복구를 테스트한다.

## 5. 외부 플랫폼 계약

- [Emscripten Asyncify](https://emscripten.org/docs/porting/asyncify.html): 기존 동기 흐름을 보존할 수 있지만 code size/stack/reentrancy 검증이 필요하다. browser callback 재진입 방지가 핵심이다.
- [WebGL 지원](https://emscripten.org/docs/porting/multimedia_and_graphics/OpenGL-support.html): WebGL2/GLES3 대상으로 명시하고 실제 shader compile/link를 확인한다.
- [모듈 출력](https://emscripten.org/docs/compiling/Modularized-Output.html): 일반 modularized factory를 사용한다. 실험적 instance 모드와 혼용하지 않는다.
- [파일시스템](https://emscripten.org/docs/api_reference/Filesystem-API.html): 시작 전에 IDBFS `syncfs(true)`, 저장 후 `syncfs(false)` 완료를 기다린다.
- [pthreads](https://emscripten.org/docs/porting/pthreads.html): SharedArrayBuffer 및 cross-origin isolation 요구를 피하기 위해 이 프로젝트는 단일 스레드로 설계한다.
- [Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): build/test 후 Pages artifact upload, deployment job의 `needs`, `pages:write`, `id-token:write`, `github-pages` environment를 구성한다.
- [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): 게시 사이트는 1GB 이하. 업로드 artifact 도구의 10GB 상한과 혼동하지 않는다.

계획용 기술 선택은 버전 고정된 native/wasm 빌드, TypeScript + Vite의 작은 정적 shell, Vitest/Playwright, CMake/CTest 기반 native tests다. 이번에는 이 도구들을 설치하지 않았다.

## 6. 현재 환경과 실행 증거의 한계

확인된 도구: `node`, `gcc`, `g++`, `cmake`, `make`, `gh`, `curl`, `unzip`, `git`.
PATH에서 찾지 못한 도구: `emcc`, `emmake`, `emcmake`, `boron`, `bun`, `xvfb-run`, `Xvfb`, `xdotool`.
pkg-config에서 `glfw3`, `libpng`, `vorbisfile`, `libpulse-simple` 개발 패키지를 찾지 못했다. native 빌드 성공을 보고할 수 없다.

실행한 확인: git clone/고정 SHA 확인, Faun submodule checkout, Boron v2.0.8 clone, emsdk tag 존재 확인, 원본 ZIP HTTP/CRC/SHA 검사, 원문과 실제 코드 대조, 공식 문서 조회. 제품 파일 수정과 게임 실행은 하지 않았다.

## 7. 검토 기록

읽기 전용 조사 5개 영역(빌드, 텍스트/입력, 오디오/저장, 호스팅 계약, QA)을 병렬 조사했다. 결과는 main agent가 실제 소스를 다시 열어 확인했다. 다음 조사 오류를 채택하지 않았다: 존재하지 않는 `engine/project.md` 경로, 기본 native `--glfw` 누락, Boron의 존재하지 않는 `--no-thread` 옵션, CDI app ID를 파일 첫 4 bytes magic으로 단정, scope 밖 모바일/touch 지원.

계획 gap 검토 결과와 마지막 구조 검사는 최종 계획 작성 후 결정 기록에 덧붙인다. 고정밀 이중 검토는 요청되지 않았으며 수행했다고 주장하지 않는다.
