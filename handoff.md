# Ultima IV 웹 한글판 개발 인수인계

최종 갱신: 2026-09-20 KST.

## 현재 상태

**Todo 1(source freeze + web test harness + CMake command surface)을 완료하고 검증했다. `.omo/plans/ultima-web.md`의 Todo 1 checkbox를 `[x]`로 표시했다. commit `8f95fb5` (`chore(repo): freeze sources and add web test harness`)로 `todo-01-build-test-harness` 브랜치에 커밋했고 `origin`(`git@github.com:TaejinKim7-dev/ultima.git`)에 push, PR #1로 `main`에 merge 완료(merge commit `36a128e`). 이후 Git 정책을 "PR 생략 + `main` merge 전 로컬 검증 필수"로 변경했다(`AGENTS.md` "Git 작업 방식", commit `1e8191b`). `docs/NEXT_FIVE_STEPS.md`를 만들어 Todo 2~6 시작점을 정리했다(commit `44f4bc3`).**

**Todo 2(호스트 Boron 빌드 + xu4 모듈 패키징)를 `todo-02-module-packaging` 브랜치에서 완료했다 — 상세는 아래 "Todo 2 완료 기록" 참고.**

**Todo 4(영어 원문 inventory + 한국어 로컬라이제이션 스키마)를 `todo-04-i18n-inventory` 브랜치에서 완료했다 — TITLE.EXE/AVATAR.EXE 바이너리 문자열 추출까지 실제 원본 데이터로 검증했다(당초 "pending 처리 가능"이라고 허용됐던 항목이었으나 `vendor/xu4/src`에서 정확한 오프셋 근거를 찾아 실제로 구현했다). 상세는 아래 "Todo 4 완료 기록" 참고.**

- root Vite/TypeScript strict/Vitest/Playwright harness와 minimal build shell이 있다.
- `vendor/source-manifest.json`은 xu4, Faun, GLV, Boron의 deterministic file count/tree SHA-256과 pinned revision을 기록한다.
- `npm run verify:repo-sources`는 manifest mismatch와 Git-tracked `.zip`, `.sav`, `.ega`, `.map`, `.tlk`, `.exe`를 실패시킨다.
- `scripts/cmake-wrapper.mjs`가 Todo 1의 blocker(CMake command surface 누락)를 해소했다: `npm run cmake:version`은 host cmake(3.22.1)를 그대로 호출해 exit 0. **(Todo 2에서 갱신)** `npm run cmake:configure`/`cmake:build`/`cmake:test`는 더 이상 stub가 아니다 — 실제로 `cmake -S . -B build/native`/`cmake --build build/native`/`ctest --test-dir build/native`를 실행하며, `native/`의 CTest 프로젝트(module-package 테스트)를 빌드·실행한다. `npm run test:native`도 동일한 경로의 별칭이다.
- evidence는 `.omo/evidence/ultima-web/task-1/`에 local-only로 남긴다 (git-ignored).
- Todo 2~6의 바로 실행 가능한 시작점은 [NEXT_FIVE_STEPS.md](docs/NEXT_FIVE_STEPS.md)에 있다.

Todo 1 검증 완료 (2026-09-13 재검증, 모두 실제로 실행함):

```
npm ci                        # exit 0 (EBADENGINE warning, 아래 참고)
npm run cmake:version         # exit 0 (host cmake 3.22.1)
npm run cmake:configure       # exit 1 (unavailable message, 의도된 동작)
npm run cmake:build           # exit 1 (unavailable message, 의도된 동작)
npm run cmake:test            # exit 1 (unavailable message, 의도된 동작)
npm run test:unit             # exit 0 (2 tests passed)
npm run verify:repo-sources   # exit 0 (4 pinned components)
npm run typecheck             # exit 0
npm run build                 # exit 0 (vite build)
git diff --check              # exit 0
```

fake tracked `ULTIMA4.ZIP`를 별도 임시 Git 저장소(scratchpad, repo 밖)에 만들어 `node scripts/verify-repo-sources.mjs <tmp-repo>`로 직접 검증했다: `forbidden original-game-data path is tracked: ULTIMA4.ZIP` 메시지와 함께 exit 1로 거부됨을 재확인했다. 임시 저장소는 검증 후 삭제했다.

**Node 버전 주의**: 이 host의 Node는 20.20.2이고 `package.json`의 `engines.node`는 `>=22.0.0`이다. `npm ci`는 성공하지만 `EBADENGINE` warning을 출력한다. Todo 1 완료 기준을 낮추기 위해 engines 요구사항을 내리지 않았다 — CI/실제 배포 환경은 Node 22를 준비해야 한다. 로컬에서 계속 작업할 경우 nvm 등으로 Node 22를 설치하는 것을 권장하되, 필수 차단 요소는 아니다(현재 명령들은 Node 20에서도 정상 동작 확인됨).

독립 게이트 리뷰(별도 subagent, 이 저장소를 수정하지 않고 read-only로 재검증)를 완료했다. **Verdict: CONFIRMED.** 리뷰어는 위 10개 명령을 자체적으로 재실행하고, `/tmp` 아래 별도 임시 git 저장소에서 fake tracked `ULTIMA4.ZIP` 거부를 독립적으로 재현했으며, `.gitignore`/`git ls-files`로 원본 데이터·node_modules·dist 미추적을 확인했고, `.omo/plans/ultima-web.md`에서 Todo 1만 `[x]`이고 Todo 2 이후는 `[ ]`로 유지됨(scope creep 없음)을 확인했다. 상세 로그: `.omo/evidence/ultima-web/task-1/gate-review-2026-09-13.log`.

`cmake-red.log`/`cmake-green.log`(이전 세션 산출물)는 vitest 유닛 테스트가 아니라 `npm run cmake:*` package-command-seam 동작을 손으로 기록한 CLI RED/GREEN transcript다. `tests/unit/`에는 cmake 관련 테스트가 없다 — 삭제된 테스트가 아니라 원래부터 CLI transcript 방식으로 검증한 것이다.

**Node 버전 관련 추가 주의**: `npm run cmake:version`의 exit 0은 이 host에 실제 `cmake` 3.22.1이 설치되어 있기 때문이다. `cmake` 바이너리가 없는 host에서는 wrapper가 `spawnSync` 오류를 잡아 exit 127로 실패한다(`scripts/cmake-wrapper.mjs`의 `result.error` 분기). 이는 회귀가 아니라 host에 cmake가 없다는 신호이므로, 다음 에이전트는 native 빌드 환경을 준비할 때 이 exit code 의미를 참고한다.

## Todo 2 완료 기록 (2026-09-20, branch `todo-02-module-packaging`)

**범위**: Boron 2.0.8 host CLI를 빌드하고, 그걸로 `vendor/xu4/module/{render,Ultima-IV,U4-Upgrade}`를 `render.pak`/`Ultima-IV.mod`/`U4-Upgrade.mod`로 패키징하고, CDI/module loader(`vendor/xu4/src/module.c`)가 정상/빈/손상 파일을 올바르게 구분하는 native CTest를 추가했다.

**Faun 관련 스코프 결정 (명시적 deferral)**: Todo 2 제목은 "Boron/Faun" 둘 다 언급하지만, 실제로 필요한 건 Boron뿐이었다 — `vendor/xu4/tools/pack-xu4.b`는 모듈 패키징 시 오디오 파일을 그대로 CDI chunk로 복사만 하고 Faun 런타임을 호출하지 않는다(`vendor/xu4/Makefile`에도 faun 참조 없음 확인). Faun을 host에서 실제로 빌드하지는 않았다 — `vendor/faun/Makefile`의 `DEP_LIB = -lpulse -lvorbisfile -lpthread -lm` (+`-lFLAC`)이 `libpulse-dev`/`libvorbis-dev`(`libvorbisfile`)/`libflac-dev`를 요구하는데 이 host에는 미설치다(2026-09-20 환경 점검 참고). **Todo 3(native GLFW 기준선, 실제 오디오 포함)이 Faun host 빌드를 실제로 필요로 하는 첫 지점이다** — 그때 `sudo apt-get install libpulse-dev libvorbis-dev libflac-dev`(passwordless sudo 아님, 사용자 직접 실행 필요)를 요청해야 한다.

**구현**:
- `scripts/deps-host.mjs` (`npm run deps:host`): `cc`/`ar`/`ranlib` 존재를 확인하고, `vendor/boron`을 `build/host/boron`으로 복사한 뒤(원본은 절대 건드리지 않음 — `vendor/`는 `verify:repo-sources`가 물리 디렉터리 트리 해시로 검증하므로 그 안에서 빌드하면 검증이 깨진다) `./configure --static`(bundled linenoise, zlib compress, thread 없음 — 기존 소스 분석 기록과 일치) + `make`로 정적 링크된 `boron` 바이너리를 만든다. `--static`을 쓴 이유는 shared 빌드 시 `build:modules`가 다른 cwd에서 `boron`을 실행할 때 `libboron.so.2`를 못 찾는 문제(LD_LIBRARY_PATH/rpath 필요)를 피하기 위함이다.
- `scripts/build-modules.mjs` (`npm run build:modules`): `build/host/boron/boron`(env `BORON_BIN`으로 override 가능, 테스트용)이 없으면 "run npm run deps:host first" 메시지와 exit 1. 있으면 `vendor/xu4/tools/pack-xu4.b`를 호출해 `build/host/modules/`에 세 모듈을 생성하고 각각 SHA-256을 출력한다.
- `CMakeLists.txt`(root) + `native/CMakeLists.txt` + `native/tests/module_package_test.c`: `vendor/xu4/src/module.c` + `support/cdi.c` + `support/stringTable.c` + `vendor/boron/urlan/array.c`를 정적 라이브러리로 묶고, `mod_query()`를 호출하는 `module_package_test` 실행파일을 CTest `module-package`로 등록했다. `module.h`가 요구하는 `<boron/urlan.h>` 레이아웃은 `vendor/boron/include/`에 실제로 없어서(그 레이아웃은 `make install-dev`가 `/usr/local`에 만드는 것) `build/native/boron_shim/boron/*.h` 심볼릭 링크를 CMake configure 시점에 생성해 해결했다(`vendor/` 무수정 유지). `module.c`가 링크 타임에 요구하는 `u4find_pathc`(실제 정의는 `vendor/xu4/src/u4file.cpp`)는 테스트가 부르는 `mod_query()` 경로에서는 호출되지 않으므로(그 경로는 `mod_addLayer()`의 "requires 부모 모듈 찾기"에서만 쓰임) 테스트 파일 안에 스텁을 정의했다 — 코멘트로 왜 안전한지 설명해둠.
- `scripts/cmake-wrapper.mjs` 갱신: `configure`/`build`/`test`가 이제 실제로 `cmake -S . -B build/native` / `cmake --build build/native` / `ctest --test-dir build/native --output-on-failure`를 실행한다(extra args pass-through 지원, 예: `-R module-package`). `npm run test:native`는 동일 경로의 별칭.
- `tests/unit/build-modules.test.ts`: `BORON_BIN`을 존재하지 않는 경로로 override했을 때 `build:modules`가 exit 1 + "run npm run deps:host first" 메시지를 내는지 검증하는 vitest 테스트.

**검증 (2026-09-20, 전부 실제 실행, `rm -rf build` 이후 clean 상태에서 전체 파이프라인 1회 포함)**:
```
npm run deps:host              # exit 0 — Boron 2.0.8 static 빌드 성공 (pinned revision과 버전 일치)
npm run build:modules          # exit 0 — render.pak/Ultima-IV.mod/U4-Upgrade.mod 생성
npm run cmake:configure        # exit 0
npm run cmake:build            # exit 0 (module.c의 미사용 파라미터 warning 1건, 에러 없음)
npm run cmake:test             # exit 0 — module-package 1/1 Passed
npm run test:unit              # exit 0 — 2 files / 3 tests
npm run verify:repo-sources    # exit 0 — vendor/ 4개 component 모두 무결
npm run typecheck              # exit 0
npm run build                  # exit 0
git diff --check               # exit 0
```
재현성: `npm run build:modules`를 두 번 실행해 `sha256sum build/host/modules/*.pak build/host/modules/*.mod`가 완전히 동일함을 확인했다(`.omo/evidence/ultima-web/task-2/reproducible-modules.log`).

**Module SHA-256** (이 소스로 재현 시 반드시 동일해야 함 — `build/` 자체는 git-ignored라 여기 기록):
| 파일 | SHA-256 | 크기 |
|---|---|---|
| `render.pak` | `f175fab6778c07c931b30b463d752f7ba87e3d4825412b354385c7be5dd2ccad` | 305237 bytes |
| `Ultima-IV.mod` | `145e8786a1cb2291fea8ce7aefd7d9db505737db5fe0fd515b3a7e9f7106fbd4` | 7412174 bytes |
| `U4-Upgrade.mod` | `b8cd142b1e4309ef16ed67f9763f0cbb64e4c2716b35164e1238ac9f11a090a0` | 130363 bytes |

**부정 케이스가 실질적임을 별도 확인**: `render.pak` 사본의 앞 4바이트(CDI magic)를 뒤집어 `module_package_test <손상된 파일> Ultima-IV.mod`를 직접 실행 → 손상된 인자만 `FAIL`, 정상 `Ultima-IV.mod`는 `ok`로 정확히 구분됨을 확인했다(exit 1). 단순히 항상 통과하는 가짜 테스트가 아님을 증명한다. 로그: `.omo/evidence/ultima-web/task-2/corrupt-module.log`.

**Todo 6(WASM) 확장 지점 메모**: `deps-host.mjs`가 이미 `vendor/boron`을 `build/host/boron`으로 복사한 뒤 그 복사본에서 빌드한다 — emcc/emar로 다시 빌드해야 할 때도 이 복사본(또는 별도 `build/wasm/boron`)에서 `CC=emcc AR=emar ./configure ...`처럼 override하면 되고, `vendor/boron/Makefile` 자체를 고칠 필요는 없었다(고쳤다면 tree hash가 깨져 `vendor/source-manifest.json`도 갱신해야 했을 것). Boron Makefile은 `cc`/`ar`/`ranlib`를 하드코딩하지만 이 host의 `cc`가 이미 시스템 gcc라 문제가 없었다 — emcc로 바꾸려면 그때 가서 Makefile 변수화가 실제로 필요한지 다시 판단한다.

**독립 게이트 리뷰**: 별도 subagent가 read-only로 위 파이프라인을 clean 상태(`rm -rf build`)에서 자체 재실행했다. **Verdict: CONFIRMED.** 재현성(두 번 빌드 후 해시 동일)과 손상 파일 거부(손상된 render.pak만 FAIL, 정상 Ultima-IV.mod는 ok)를 독립적으로 재확인했고, vendor/ 무수정·git 추적 파일 목록도 검증했다. 리뷰어가 자체적으로 손상 파일을 직접 만들어 재현하는 과정에서 이미 손상된 사본을 다시 XOR하여 우연히 원래 magic byte로 되돌아간 경우가 1건 있었는데(리뷰어 본인 재현 스크립트의 아티팩트, 실제 테스트 로직 결함 아님), 이는 이 저장소의 `corrupt-module.log` 증거(매번 원본에서 새로 복사 후 1회만 XOR)에는 해당하지 않는다.

## Todo 4 완료 기록 (2026-09-20, branch `todo-04-i18n-inventory`)

**범위**: 4개 영어 원문 소스(Boron 모듈 스크립트, 원본 TLK 16개 파일, C++ UI 문자열, TITLE.EXE/AVATAR.EXE 바이너리) 전체를 inventory하고, hash-only 공개 스키마(`locales/ko/{ui,module,binary,tlk,aliases,glossary}.json`)와 `npm run i18n:inventory`/`npm run i18n:check` 두 CLI를 만들었다. **TITLE.EXE/AVATAR.EXE는 "근거를 못 찾으면 pending 처리"가 허용된 항목이었지만, `vendor/xu4/src/intro.cpp`(title.exe)와 `vendor/xu4/src/discourse_castle.cpp`/`codex.cpp`/`shrine.cpp`(avatar.exe)에서 정확한 바이트 오프셋 근거를 찾아 실제로 구현하고 실제 원본 ZIP으로 검증했다** — 모든 4개 소스가 `pending` 플레이스홀더가 아니라 실제 동작하는 추출 파이프라인이다.

**구현**:
- `scripts/lib/tlk-codec.mjs`: 원본 `.TLK` 레코드 코덱(288바이트 고정 레코드, 16레코드/파일, 12개 문자열 필드). 근거는 `vendor/xu4/src/util/tlkconv.c`의 `struct Talk`/`talk_init()`과 `vendor/xu4/src/discourse_tlk.cpp:199-238,261-277`의 `struct U4Talk`/`U4Talk_load()` 두 개의 독립적인 xu4 소스가 정확히 일치함을 대조 확인했다. `tlkKey(map, npcIndex, field)` → `"map:npcIndex:field"` 형태(acceptance criteria가 요구하는 정확한 shape)를 만든다.
- `scripts/lib/binary-strings.mjs`: TITLE.EXE/AVATAR.EXE의 8개 문자열 테이블(introQuestions/introText/introGypsy, lordBritishKeyword/lordBritishText, hawkwindText, virtueQuestions/endgameText1/endgameText2, shrineAdvice) 추출. 모든 오프셋은 `vendor/xu4/src/intro.cpp:59,97,101-103`, `discourse_castle.cpp:44,50-51,59,62,70,73,76-77`, `codex.cpp:43-45`, `shrine.cpp:54`의 실제 호출부 리터럴을 그대로 인용했다(추측 없음). Lord British 블록에 문서화된 바이트 손상 보정(오프셋 2724, 7바이트, `discourse_castle.cpp:53-60`)도 그대로 재현했다. `binaryKey(resource, table, index)` → `"resource:table:index"` shape을 만든다.
  - **교차검증 중 발견한 불일치**: `vendor/xu4/doc/FileFormats.md`(899-1005번째 줄, xu4 프로젝트 자체 공개 문서)는 Hawkwind/Lord British 오프셋·길이·문자열 개수를 약간 다르게 기술한다(Lord British keyword 시작 오프셋 87565 vs 우리가 실제 사용한 87581, 문자열 개수 27+25=52 vs 우리가 쓴 25+24=49). **`discourse_castle.cpp`(실제로 컴파일·실행되는 코드)를 신뢰했다** — 실제 원본 ZIP으로 추출을 실행한 결과 25개 키워드(마지막 1개는 문서화된 "extra empty string"과 정확히 일치하는 빈 문자열) + 24개 응답 텍스트가 끝까지 깨짐 없이 정확히 종료되는 것을 직접 확인했다(`.local/i18n-inventory/binary.json`, git-ignored라 여기 인용 불가). `FileFormats.md`는 이 지점에서 stale하거나 다른 관점으로 작성된 문서로 보인다 — 코드가 아니라 문서 쪽 오류일 가능성이 높다.
- `scripts/lib/boron-strings.mjs`: Boron 모듈 스크립트(`.b` 파일)의 `"..."`/`{...}`(중첩 balance 지원) 문자열 리터럴 추출 + caret escape 해석(`^-`→tab, `^/`→newline, `^(HEX)`, 그 외 `^X`→X 리터럴 — `vendor/boron/urlan/tokenize.c:376-393`의 `ur_caretChar()` 정확히 재현). `;` 라인 주석과 `/* */` 블록 주석도 스킵한다. 텍스트에 공백이 있으면 `display`, 없으면 `identifier`로 best-effort 분류(완벽하지 않음을 명시).
- `scripts/lib/cpp-strings.mjs`: `screenMessage("...")`와 `Menu::add(ID, "...")`/`new XxxMenuItem("...")` 두 호출 패턴만 스캔(76개 전체 소스 파일이 아니라 player-visible 호출부만). 8진 이스케이프(`\010` 등, 메뉴 커서 글리프에 실제로 쓰임)까지 정확히 해석한다.
- `scripts/lib/{hash,placeholders,text-width,schema-io,alias-check,zip-extract}.mjs`: sha256 해시, printf류 placeholder 서명(정렬된 multiset 비교 — 한국어는 어순이 바뀌므로 순서 무시, 개수/종류만 비교), status-line 폭 휴리스틱(`STATUS_AREA_WIDTH_COLUMNS = 15`, 근거 `vendor/xu4/src/stats.h:13` `STATS_AREA_WIDTH`; 한글 음절은 2칸으로 계산), 스키마 로드/저장과 기존 번역 보존 merge(소스 해시가 바뀌면 번역은 유지하되 `stale: true` 플래그), 별칭 충돌 감지(NFC 정규화, 동일 별칭 중복 등록 / 별칭이 다른 항목의 canonical 키워드와 겹치는 경우), `unzip -p`/`unzip -Z1` 기반 ZIP 엔트리 추출(새 npm 의존성 없음).
- `scripts/i18n-inventory.mjs`(`npm run i18n:inventory`): 위 코덱들을 이용해 module/ui는 항상, tlk/binary는 `$ULTIMA4_DATA`가 설정되고 실존할 때만 추출한다. PRIVATE 전체 corpus(원문 텍스트 포함)는 `.local/i18n-inventory/*.json`(git-ignored)에, PUBLIC 스키마(해시/placeholder/번역 필드만, 원문 없음)는 `locales/ko/*.json`에 쓴다. 재실행 시 기존 번역/status/category/notes를 보존한다(merge, `scripts/lib/schema-io.mjs`).
- `scripts/i18n-check.mjs`(`npm run i18n:check`): `status: "pending"`인 항목은 기본 모드에서는 통과시키고(번역은 Todo 15의 범위), `--strict`에서는 실패시킨다. `status`가 pending이 아닌 항목은 번역 존재/placeholder 서명 일치/(category가 "status"인 경우) 폭 예산/stale 플래그를 검사한다. 별칭 충돌은 항상 검사한다. 실패마다 정확한 파일+키를 명시한 메시지를 stderr에 출력하고 exit 1.
- `locales/ko/aliases.json`, `locales/ko/glossary.json`: 실제 한국어 alias/번역 자체는 Todo 13/15의 범위라 비워두되(`alias` 필드 빈 문자열 + `status: "pending"`), `discourse_tlk.cpp:93,129,131,136,157`에서 확인한 전역 NPC discourse 키워드(`bye/look/name/give/join/job/health/yes/no`) 9개와 8버추/3원칙/6개 핵심 용어(Avatar/Rune/Shrine/Mantra/Codex/Companion/Virtue) glossary 18개를 스캐폴딩했다. 빈 alias끼리는 충돌 검사에서 제외한다(그렇지 않으면 빈 문자열끼리 항상 "충돌"로 오탐된다).
- 테스트: `tests/unit/i18n-lib-selftest.test.ts`(19개, TLK/binary key shape 왕복 테스트를 합성 버퍼로 수행 — 실제 원본 데이터 불필요), `tests/unit/i18n-check.test.ts`(8개, happy path + 4가지 실패 모드[누락 번역/placeholder 불일치/status-line 폭 초과/별칭 충돌/stale] + `--strict`), `tests/unit/i18n-inventory.test.ts`(3개, `ULTIMA4_DATA` 미설정 시 정상 skip과 원문 비유출, 재실행 시 번역 보존). tsconfig가 `allowJs`를 켜지 않아 `.ts` 테스트가 `.mjs`를 직접 import하면 typecheck가 깨지므로, 기존 관례(`build-modules.test.ts`)를 따라 `scripts/lib/selftest-cli.mjs`라는 테스트 전용 CLI 하니스로 spawn하여 검증한다.

**TDD**: 구현 완료 후 `scripts/lib/*.mjs`와 `scripts/i18n-{inventory,check}.mjs`를 임시로 다른 경로로 옮겨 RED을 재현하고(`Cannot find module` 오류로 28개 테스트 전부 실패, `.omo/evidence/ultima-web/task-4/red.log`) 원복 후 GREEN을 확인했다(`.omo/evidence/ultima-web/task-4/green.log`, 이후 stale 테스트 추가로 최종 33개).

**검증 (2026-09-20, 전부 실제 실행)**:
```
npm ci                          # exit 0 (Node 20 EBADENGINE warning, Todo 1 기록과 동일)
npm run i18n:inventory          # exit 0, ULTIMA4_DATA 미설정: module 729 + ui 369 추출, tlk/binary는 명시적으로 skip
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npm run i18n:inventory
                                 # exit 0, tlk 3072 필드(16 맵 × 16 NPC, 사용되지 않는 슬롯 0개) + binary 214/216 슬롯 추가 추출
                                 # 재실행 시 0 new/0 stale/0 removed로 재현성 확인(같은 소스 → 같은 해시)
npm run i18n:check               # exit 0 — locales/ko 4411개 엔트리(4402 pending, 정상) 검사 통과
npm run test:unit                # exit 0 — 5 files / 33 tests (기존 3 + 신규 30)
npm run verify:repo-sources     # exit 0 — locales/scripts/tests를 git add한 뒤 재확인(파일명이 `verify:repo-sources`가 금지하는 `.tlk/.exe/...` 확장자와 우연히 충돌하지 않는지 별도로 검증함)
npm run typecheck               # exit 0
npm run build                   # exit 0
git diff --check                # exit 0
```

**실제 원본 데이터로 품질 확인**(내용 자체는 공개 아티팩트에 포함하지 않음 — `.local/i18n-inventory/`에서만 직접 확인): TLK 256개 레코드 전부에서 이름·직업·질문 필드가 실제 Ultima IV 대화로 보이는 정상적인 영어 문장으로 디코딩됐고(빈 이름 레코드 0개), TITLE.EXE의 28개 intro 질문·15개 집시 카드 텍스트, AVATAR.EXE의 Lord British 25키워드/24응답·Hawkwind 53줄·버추 질문 11개·엔딩 텍스트 12개·shrine 조언 24개가 전부 끝까지 깨짐 없이 정상 종료되는 것을 확인했다. `.local/i18n-inventory/tlk.json`에서 `%` 문자를 grep해 printf-placeholder 오탐 가능성도 확인했다 — 0건(원본 TLK 대화문에는 `%`가 없다).

**부분 구현 사항 명시**:
- C++ UI 문자열은 76개 전체 `vendor/xu4/src/*.cpp`가 아니라 `game.cpp/menu.cpp/menuitem.cpp/stats.cpp/event.cpp/combat.cpp/item.cpp/creature.cpp/dungeon.cpp/camp.cpp/portal.cpp/death.cpp/spell.cpp/intro.cpp` 14개 파일의 `screenMessage(...)`/`Menu::add(...)` 두 호출 패턴만 스캔한다(과제 지시사항이 "player-visible 텍스트만, 76개 전체 불필요"라고 명시). 변수로 전달되는 메시지(`screenMessage(msg)`)나 문자열 연결은 포착하지 못한다 — 그런 문자열은 대개 자신의 리터럴 정의 지점에서 별도로 잡히거나, 이미 module/TLK/binary로 잡힌 데이터다.
- Boron 문자열의 `display`/`identifier` 분류는 공백 유무 기반 휴리스틱이라 완벽하지 않다(예: 공백이 없는 짧은 display 문구는 identifier로 오분류될 수 있음). Todo 15에서 사람이 검토하며 걸러낼 것으로 예상한다.
- `.local/i18n-inventory/*.json`의 TLK/binary 원문은 latin1로 디코딩한 human-readable 사본이다(원본 DOS 텍스트는 CP437 계열이라 완벽한 1:1 매핑은 아님) — 그러나 `sourceHash`는 항상 raw byte에 대해 계산하므로 hash 정합성/drift 감지에는 영향이 없고, 이 근사는 순수히 사람이 읽기 편하게 하기 위한 것이다.
- `locales/ko/{aliases,glossary}.json`은 스키마와 스캐폴딩(canonical 키워드/용어 목록)만 갖췄고 실제 한국어 값은 비어 있다 — Todo 13(별칭)/15(전체 번역)의 범위다.
- `binaryKey`/`tlkKey`의 인덱스는 연속적이지 않을 수 있다(예: `title.exe:introGypsy:12`, `avatar.exe:lordBritishKeyword:24`는 원본에 빈 슬롯이라 스키마에 없음 — 16/216개 슬롯 중 2개, `discourse_castle.cpp:30`의 "+1 for extra empty string" 주석과 일치). Todo 14에서 lookup table을 만들 때 `0..N` 연속 순회를 가정하면 안 되고, 스키마의 실제 key 목록을 기준으로 순회해야 한다.
- `i18n-green.log`는 `locales/ko`가 아니라 `tests/unit/i18n-check.test.ts`의 `baseSchema()`와 동일한 구조의 임시 fixture(`/tmp`, 실행 후 삭제)에 대해 실행한 결과다 — 실제 프로덕션 corpus(`locales/ko`)는 의도적으로 4402/4411개가 `pending`이며, `npm run i18n:check`(strict 아님)로는 통과하지만 각 항목이 "번역 완료"라는 뜻은 아니다. 재현하려면 `tests/unit/i18n-check.test.ts`의 `baseSchema()`를 참고한다.

- [AI 코딩 에이전트 규칙](AGENTS.md): 다른 AI가 이 저장소를 이어받을 때 지켜야 할 프로젝트 운영 규칙.
- [AI 코딩 에이전트 인계 규칙](docs/AI_AGENT_HANDOFF.md): `handoff.md`를 어떻게 작성·갱신해야 하는지에 대한 표준.
- [실행 계획서](.omo/plans/ultima-web.md): 요구사항·설계 계약·20개 구현 작업·4개 최종 검증 작업·GitHub Pages 배포 방향을 작성했다. 구현 담당자가 이 문서를 기준으로 실행할 수 있다.
- [소스 분석 기록](.omo/drafts/ultima-web-source-analysis.md): 실제 수정 지점, 원문 오류, 의존성, 위험, 출처를 정리했다.
- [요구사항 결정 기록](.omo/drafts/ultima-web.md): 사용자와 확인한 결정 및 진행 상태.
- [처음 전달받은 문서](project.md): 최신 사용자 결정과 실제 코드 분석이 이 문서보다 우선한다.

## AI 코딩 에이전트 인계 작성 규칙

다른 AI 코딩 에이전트에게 자연스럽게 연결하려면 `handoff.md`를 단순 대화 요약이 아니라 재현 가능한 작업 지시서로 유지한다.

인계 전 반드시 아래 항목을 최신화한다.

1. 현재 목표: 지금 완성하려는 Todo와 범위.
2. 확정된 방향: 기술 스택, 배포 방식, TDD/PR 정책, 원본 데이터 처리 정책.
3. 현재 작업 상태: 브랜치, 마지막 관련 커밋, 수정 파일, 실행한 명령, 테스트 결과.
4. 다음 에이전트가 바로 할 일: 첫 명령부터 실행 가능한 순서로 작성.
5. 금지사항: 원본 게임 데이터, private corpus, 사용자 save, secret 커밋 금지.
6. 검증 명령: 실제로 실행했거나 다음에 실행할 명령을 구분해서 기록.
7. 남은 위험과 미검증 사실: 추정과 검증 완료 사실을 섞지 않는다.

상세 작성 포맷은 [AI 코딩 에이전트 인계 규칙](docs/AI_AGENT_HANDOFF.md)을 따른다.

## 사용자 확정 요구사항

1. 원작 Ultima IV 전체: native 기준 검증, 웹 구동, 데이터 업로드, 영속 세이브, 한글 UI/입력/전체 번역, 실제 오디오까지.
2. xu4 + GLFW + Emscripten/WASM. DOS 기본 EGA 그래픽과 원작 규칙 유지. 데스크톱 키보드 대상.
3. 긴 대화는 게임 화면 아래 HTML 패널. 상태 정보는 원래 게임 화면 위치 유지.
4. 한글/영문 NPC 키워드 지원. 원래 게임 명령키와 내부 규칙 유지.
5. 번역은 개발 담당 AI가 사전에 작성하여 배포한다. 사용자 외부 번역 도구·API·LLM 호출 없음.
6. GitHub Pages 정적 배포. 원본 게임 데이터는 배포하지 않고 사용자 브라우저에서 선택한다.
7. TDD + 실제 native/browser QA.
8. 이번 세션의 요청은 소스를 받고 분석해서 GPT-5가 실행할 상세 Markdown 계획을 만드는 것. 사용자에게 같은 요구사항이나 게임 데이터 경로를 다시 묻지 않는다.
9. 최종 배포 대상 저장소는 `https://github.com/TaejinKim7-dev/ultima`다. SSH write remote는 `git@github.com:TaejinKim7-dev/ultima.git`로 사용한다. Pages base는 `/ultima/`, 예상 URL은 `https://taejinkim7-dev.github.io/ultima/`다. 사용자가 공개 키 등록을 완료했다고 밝혔다.
10. 새로 작성되는 코드는 TDD 기반으로 구현한다. 각 컴포넌트는 Unit Test를 먼저 만들고 RED/GREEN 로그와 evidence를 남긴다. 정책 문서는 `docs/TESTING_POLICY.md`다.
11. **(2026-09-13 갱신)** 구현 작업은 기능별 브랜치에서 진행한다. 1인 개발이므로 PR 리뷰는 생략하고 feature branch를 `main`에 직접 merge한다. 단, merge 전에 반드시 로컬 검증(`npm ci`, `npm run test:unit`, `npm run verify:repo-sources`, `npm run typecheck`, `npm run build`, `git diff --check`와 해당 Todo의 추가 검증 명령)을 전부 실행하고 결과를 `handoff.md`에 기록해야 하며, 하나라도 실패하면 merge를 금지한다. 상세 규칙은 `AGENTS.md`의 "Git 작업 방식"을 따른다. (Todo 1은 예외적으로 PR #1을 만들어 merge했다 — 이후 Todo부터 이 정책을 적용한다.)
12. 공개 기본 정책: repo, 계획서, 구현 코드, vendor source, 한국어 번역 원천 JSON, Actions workflow는 공개한다. `main` merge 후 GitHub Pages에 자동 공개 배포한다. 원본 게임 데이터, private corpus, 사용자 save, secret은 공개하지 않는다.

## 지금까지 한 작업

- `project.md` 전체를 읽고 객관식으로 요구사항을 확정했다.
- `xu4-engine/u4` 소스를 `engine/`에 clone했다. 원형은 수정하지 않았다.
- Faun submodule을 `engine/src/faun/`에 받았다.
- Boron v2.0.8을 `.omo/research/boron/`에 받았다.
- 원본 DOS 데이터를 웹에서 찾아 다운로드하고 HTTP/파일 크기/SHA-256/ZIP CRC를 검사했다. 160개 파일 무결성 검사 통과.
- 빌드, 텍스트/입력, 저장/오디오, 호스팅, QA를 읽기 전용으로 병렬 조사하고 실제 소스로 교차 확인했다.
- Emscripten/GitHub Pages 공식 문서를 확인하고 설계 계약을 기록했다.
- 계획 gap 검토를 받았다. 중요 발견은 아래에 정리했으며 상세 계획에 반영 중이다.

## 받은 코드와 데이터

| 항목 | 경로 | revision/hash |
|---|---|---|
| xu4 | `engine/` | `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71` |
| Faun | `engine/src/faun/` | `e175dbfabab468008906e724e9d3872097bdb560` |
| GLV | `engine/src/glv/` | `20ab75d39ae1ab27c55f1eea09c83b3985738110` |
| Boron 2.0.8 | `.omo/research/boron/` | `84e7a81f68aa7588419f7b164e94e096a1c3fa07` |
| DOS 원본 ZIP | `/home/taejin/ultima4-original-data/ultima4.zip` (repo 밖, 이 host 로컬) | `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74` |

ZIP 크기: 529099 bytes. 경로가 사라지면 `https://ultima.thatfleminggent.com/ultima4.zip`에서 재다운로드하여 위 hash를 확인한다(2026-09-20 재다운로드로 hash 일치 재확인함). `WORLD.MAP`, `SHAPES.EGA`, `TITLE.EXE`, `AVATAR.EXE`, TLK 16개 존재를 확인했다. 원본 파일은 GitHub/Pages/공개 CI artifact에 포함하지 않는다. GOG판과 동일한 hash라고 확인한 것은 아니다.

**엔진 소스코드(vendor/xu4) 대조 확인 (2026-09-20)**: 사용자가 xu4 GitHub master와 v1.4.3 태그를 비교해 `src/Makefile.common`의 `ifneq ($(UI),glfw)` GLFW 조건 분기가 v1.4.3 이후 master에만 있다고 알려왔다. `engine/`(git 히스토리 보존, branch `master`)에서 확인한 결과 pinned commit `6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71`의 커밋 메시지가 정확히 "Makefile.common: Fix GLFW build."이고 `vendor/xu4/src/Makefile.common:80`에 해당 분기가 이미 포함되어 있음을 확인했다. 즉 이미 올바른(GLFW fix 포함) master 커밋을 pin하고 있으며 재-clone 불필요.

루트 Git 저장소는 `vendor/` source export를 추적한다. `engine/.git`을 삭제하지 않는다. 원형 checkout은 `engine/`, `.omo/research/boron/`에 보존하고, Todo 1의 verifier가 `vendor/` snapshot의 deterministic digest를 검사한다.

## 핵심 분석 결과

- **GLSL 수정만으로 웹 이식이 끝나지 않는다.** `gpu_opengl.cpp`의 HUD/GUI도 `glMapBufferRange/glUnmapBuffer`를 쓴다. 웹 경로는 CPU staging + `glBufferSubData`가 필요하다.
- glad include/loader는 이미 Windows 조건부다. 무조건 제거할 문제가 아니다.
- 엔진은 `module/` 디렉터리를 직접 읽는 것이 아니라 Boron이 만든 `render.pak`, `Ultima-IV.mod`를 읽는다. host Boron CLI와 wasm Boron library를 따로 만든다.
- Boron 2.0.8에는 `--no-thread`가 없다. thread 기본 off이므로 `--thread`를 주지 않는다. Makefile의 `cc/ar/ranlib` 하드코딩을 고쳐야 emcc/emar로 빌드된다.
- Asyncify를 사용하되 GLFW/DOM callback에서 controller를 직접 호출하지 않는다. queue를 다음 엔진 입력 처리 지점에서 소비한다. fsleep가 0이어도 매 프레임 yield가 필요하다.
- 번역 원천은 C++/Boron/TLK 외에 TITLE.EXE의 도입부와 AVATAR.EXE의 성/신전/엔딩 문자열이 있다. 원본 바이너리는 유지하고 번역 lookup을 별도로 둔다.
- 한글 PoC는 없다. 웹에서는 하단 대화 패널과 원래 status 위치의 고해상도 DOM text overlay를 사용한다. native는 영문 기준 검증 경로다.
- 읽기 입력은 ASCII bitset/고정 buffer 기반이다. 한국어 alias는 먼저 canonical 영어로 매핑하고, IME Enter 중복·prompt ID·입력 제한을 지킨다. avatar name은 원래 ASCII save 규격 유지.
- 저장은 `gameSave`뿐 아니라 새 게임 생성과 `Settings::write`에도 있다. 모든 write/close 완료 후 한 persistence coordinator에서 IDBFS flush한다.
- 웹 오디오는 Faun native mixer를 가져오지 않는다. Web Audio + Faun 순수 C RFX generator를 사용한다. `soundDuration`의 동기 계약과 비동기 decode를 연결해야 한다.
- 웹 시작은 IDBFS 복원·ZIP 검증·음원 준비 이후 main을 한 번 실행한다. Pages project subpath와 원본 데이터 artifact 유출을 테스트한다.

## 아직 하지 않은 작업 / 검증하지 않은 사항

- 게임 엔진 수정, 한글 번역, native/WASM runtime 구현은 아직 없다. Todo 1에는 build smoke용 최소 Vite shell만 있다.
- native 빌드/실행, WASM 빌드/실행, 실제 브라우저 게임 플레이 없음.
- 원본 ZIP이 실제 xu4에서 시작·플레이되는지는 미검증이다.
- Todo 1 변경은 commit `8f95fb5`로 `todo-01-build-test-harness` 브랜치에 push 후 PR #1로 `main`에 merge 완료했다 (merge commit `36a128e`, base commit `5855e96` 위). GitHub Pages 배포는 아직 미검증이다.
- 고정밀 이중 계획 검토는 요청되지 않았으며 수행하지 않았다. gap 검토와 소스 대조만 수행했다.

### 2026-09-20 환경 점검 결과 (이 host, `/home/taejin/ultima` 및 worktree 공통)

- `cmake`(3.22.1), `gcc`, `g++`, `clang`, `clang++`, `pkg-config`는 설치되어 있다.
- `pkg-config` 기준 `glfw3`, `libpng`, `vorbisfile`, `libpulse` 개발 패키지는 **설치되어 있지 않다**. `apt-cache policy libglfw3-dev`는 후보 패키지(3.3.6-1)를 보여주므로 apt 소스에는 있지만 미설치 상태다. 이 host는 **passwordless sudo가 아니다** (`sudo -n true` 실패) — 에이전트가 직접 `sudo apt-get install`을 실행할 수 없다. 사용자가 `! sudo apt-get install libglfw3-dev libpng-dev libvorbis-dev libpulse-dev` 형태로 직접 실행해야 한다.
- `emsdk`는 파일시스템 어디에도 없다(`find / -iname "emsdk*"` 결과 없음). Todo 6(WASM 빌드) 착수 전 설치가 필요하며, 이는 다운로드 용량이 크므로 apt 패키지와는 별개로 사용자 동의가 필요하다.
- **(2026-09-20 해결)** 원본 `ultima4.zip`을 사용자 지시로 `https://ultima.thatfleminggent.com/ultima4.zip`에서 재다운로드하여 `/home/taejin/ultima4-original-data/ultima4.zip`(repo 밖, 이 host 로컬 전용)에 보관했다. SHA-256 `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74`이 이전 세션 기록과 정확히 일치하고 크기 529099 bytes, `unzip -t` 무결성 검사 통과를 확인했다. 이 경로는 Git에 추가하지 않고 `.gitignore`의 `*.zip` 규칙과 무관하게 repo 트리 밖에 있다 — Todo 3(native 기준선)과 Todo 4(TLK/EXE 텍스트 추출)에서 `ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip`로 참조한다. **주의: 이 경로는 이 host(로컬 환경)에만 존재하며 세션이 바뀌어도 파일시스템이 유지되는 한 남아있지만, 다른 host/worktree로 이관 시 재확인이 필요하다.**
- `vendor/xu4/module/{render,Ultima-IV,U4-Upgrade}`와 `vendor/boron/Makefile`을 확인한 결과, 모듈 패키징(Todo 2)은 Boron 인터프리터(표준 `cc/ar/ranlib`만 요구, `pthread` 외 native 의존성 없음)만으로 가능해 보이며 GLFW/Faun native mixer에 의존하지 않는다. 따라서 Todo 2는 위 미설치 패키지 없이도 시도 가능하다 — 실제 시도 결과는 진행하면서 갱신한다.

## 이 계획 이후 이어서 할 일

1. (완료) `todo-01-build-test-harness`에서 검증 명령을 실행하고 `chore(repo): freeze sources and add web test harness`(commit `8f95fb5`)로 commit/push했다. PR #1로 `main`에 merge 완료(commit `36a128e`). 이후 Todo부터는 PR 없이 로컬 검증 후 `main`에 직접 merge한다 (`AGENTS.md`의 "Git 작업 방식" 참고).
2. `todo-02-module-packaging` branch를 만들고 [NEXT_FIVE_STEPS.md](docs/NEXT_FIVE_STEPS.md)의 Todo 2 RED test부터 시작한다. 이어서 Todo 3~6도 같은 문서에 있다.
3. 각 Todo는 RED/GREEN log, component unit test, relevant QA evidence를 남기고, `main` merge 전 로컬 검증 결과를 `handoff.md`에 기록한다.
4. 원본 게임 data/private corpus/user save/secret은 Git, Pages, CI public artifact, evidence에 넣지 않는다.

## 구현 담당자의 이후 순서

최종 계획 완성 후 그 문서를 우선한다. 예상 순서는 아래와 같다.

1. pinned source export와 build/test 환경 준비.
2. native GLFW 게임을 실제 실행해 기준선을 확보.
3. Boron·GL·loop/input을 single-thread WASM으로 이식.
4. 원본 파일 import와 IDBFS 세이브를 실제 reload로 검증.
5. 한글 출력/IME/alias와 전체 번역을 통합.
6. BGM·효과음·RFX·pause/fade를 통합.
7. 전체 게임 흐름·잘못된 입력·재시작·원본 save 호환성·배포물 검사를 수행.
8. GitHub Pages workflow와 프로젝트 경로 build를 완성하고 최종 검증 기록을 제출.

단계마다 관측한 결과만 완료로 기록한다. 현재 계획 문서의 예정 명령을 이미 존재하는 도구나 실행 증거로 취급하지 않는다.
