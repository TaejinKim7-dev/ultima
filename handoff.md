# Ultima IV 웹 한글판 개발 인수인계

최종 갱신: 2026-09-20 KST.

## 현재 상태

**Todo 1(source freeze + web test harness + CMake command surface)을 완료하고 검증했다. `.omo/plans/ultima-web.md`의 Todo 1 checkbox를 `[x]`로 표시했다. commit `8f95fb5` (`chore(repo): freeze sources and add web test harness`)로 `todo-01-build-test-harness` 브랜치에 커밋했고 `origin`(`git@github.com:TaejinKim7-dev/ultima.git`)에 push, PR #1로 `main`에 merge 완료(merge commit `36a128e`). 이후 Git 정책을 "PR 생략 + `main` merge 전 로컬 검증 필수"로 변경했다(`AGENTS.md` "Git 작업 방식", commit `1e8191b`). `docs/NEXT_FIVE_STEPS.md`를 만들어 Todo 2~6 시작점을 정리했다(commit `44f4bc3`).**

- root Vite/TypeScript strict/Vitest/Playwright harness와 minimal build shell이 있다.
- `vendor/source-manifest.json`은 xu4, Faun, GLV, Boron의 deterministic file count/tree SHA-256과 pinned revision을 기록한다.
- `npm run verify:repo-sources`는 manifest mismatch와 Git-tracked `.zip`, `.sav`, `.ega`, `.map`, `.tlk`, `.exe`를 실패시킨다.
- `scripts/cmake-wrapper.mjs`가 이전 세션의 blocker(CMake command surface 누락)를 해소했다: `npm run cmake:version`은 host cmake(3.22.1)를 그대로 호출해 exit 0. `npm run cmake:configure`/`cmake:build`/`cmake:test`는 native workflow가 아직 구현되지 않았다는 명시적 메시지(`cmake:<step> is unavailable until the future native workflow is implemented.`)와 함께 exit 1을 반환한다. 이는 Todo 2/3에서 실제 CMake 빌드를 붙일 때까지 의도된 동작이다.
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
