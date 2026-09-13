# Ultima IV 웹 한글판 개발 인수인계

최종 갱신: 2026-09-08 KST.

## 현재 상태

**요구사항 확인과 원본 코드 분석을 마쳤고, 웹 기반 + GitHub Pages 정적 호스팅 방향의 실행 계획서를 작성했다. 제품 구현은 시작하지 않았다.**

- [실행 계획서](.omo/plans/ultima-web.md): 요구사항·설계 계약·20개 구현 작업·4개 최종 검증 작업·GitHub Pages 배포 방향을 작성했다. 구현 담당자가 이 문서를 기준으로 실행할 수 있다.
- [소스 분석 기록](.omo/drafts/ultima-web-source-analysis.md): 실제 수정 지점, 원문 오류, 의존성, 위험, 출처를 정리했다.
- [요구사항 결정 기록](.omo/drafts/ultima-web.md): 사용자와 확인한 결정 및 진행 상태.
- [처음 전달받은 문서](project.md): 최신 사용자 결정과 실제 코드 분석이 이 문서보다 우선한다.

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
| DOS 원본 ZIP | `/tmp/ultima4-source-aeN4qd/ultima4.zip` | `94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74` |

ZIP 크기: 529099 bytes. 임시 파일이 없으면 `https://ultima.thatfleminggent.com/ultima4.zip`에서 재다운로드하여 위 hash를 확인한다. `WORLD.MAP`, `SHAPES.EGA`, `TITLE.EXE`, `AVATAR.EXE`, TLK 16개 존재를 확인했다. 원본 파일은 GitHub/Pages/공개 CI artifact에 포함하지 않는다. GOG판과 동일한 hash라고 확인한 것은 아니다.

루트는 아직 Git 저장소가 아니며 `engine/.git`만 있다. `engine/.git`을 삭제하지 않는다. 최종 계획은 원형 checkout을 보존하고 고정 소스를 `vendor/`로 export해 루트 저장소에서 관리하도록 설계했다. Faun은 gitlink이므로 별도 export가 필요하다.

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

- 제품 소스 수정, 한글 번역 작성, HTML/TS 구현 없음.
- native 빌드/실행, WASM 빌드/실행, 실제 브라우저 게임 플레이 없음.
- emsdk/Boron CLI/GLFW·PNG·Vorbis·PulseAudio 개발 패키지 설치 없음. 관련 도구/패키지를 현재 환경에서 찾지 못했다.
- 원본 ZIP이 실제 xu4에서 시작·플레이되는지는 미검증이다.
- commit/push/Pages 배포 없음. `https://github.com/TaejinKim7-dev/ultima`와 SSH remote `git@github.com:TaejinKim7-dev/ultima.git`는 배포 대상으로 기록했지만 실제 push/deploy는 하지 않았다.
- 고정밀 이중 계획 검토는 요청되지 않았으며 수행하지 않았다. gap 검토와 소스 대조만 수행했다.

## 이 계획 이후 이어서 할 일

1. 선택 사항: 실행 전 고정밀 이중 계획 검토를 돌린다.
2. 구현 시작: 별도 worker 세션에서 `$start-work .omo/plans/ultima-web.md`로 실행한다.
3. 구현자는 계획서의 Todo 1–20을 순서대로 진행하고, 각 단계에서 RED/GREEN 테스트, 컴포넌트별 Unit Test, 실제 QA 증거를 남긴다.
4. 모든 Todo 완료 후 F1–F4 최종 검증을 통과해야 완료로 본다.
5. `git@github.com:TaejinKim7-dev/ultima.git`의 SSH write 권한과 Pages 권한이 준비되어 있으면 workflow로 배포하고, 없으면 로컬 `dist/`와 정확한 배포 blocker를 기록한다.

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
