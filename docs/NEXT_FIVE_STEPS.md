# Todo 1 이후 바로 할 일 (Todo 2 ~ 6)

각 Todo는 `.omo/plans/ultima-web.md`의 canonical 정의를 요약한 것이다. 실행 전 그 문서의 해당 Todo 항목(References/Acceptance criteria/QA scenarios 전체)을 반드시 원문으로 확인한다. 이 문서는 빠른 시작점일 뿐, 세부 계약이 충돌하면 canonical plan이 우선한다.

Git 작업 방식은 `AGENTS.md`의 "Git 작업 방식"을 따른다: PR 없이 `todo-<n>-<topic>` 브랜치에서 작업하고, `main` merge 전 로컬 검증(해당 Todo의 검증 명령 전부 exit 0)을 통과해야 하며 결과를 `handoff.md`에 기록한다.

## Todo 2: 호스트 모듈 패키징

- Branch: `todo-02-module-packaging`
- First test: `tests/native/module-package`에서 빈 또는 손상된 `render.pak`/`Ultima-IV.mod`를 CDI/module loader가 거부하는 RED case를 만든다.
- First implementation: `vendor/boron`과 `vendor/faun`의 host build dependency를 검사하는 `npm run deps:host`와 deterministic `npm run build:modules`를 만든다.
- Verification: `npm run deps:host`, `npm run build:modules`, `npm run test:native -- -R module-package`.
- Blockers: CMake, native compiler, GLFW/PNG/Vorbis/PulseAudio 개발 패키지의 설치 상태를 아직 확인하지 않았다.

## Todo 3: native GLFW 기준선

- Branch: `todo-03-native-baseline`
- First test: 잘못된 `ULTIMA4_DATA` ZIP hash가 게임 상태 변경 전에 시작을 중단하는 native negative case를 만든다.
- First implementation: exported `vendor/xu4`만 사용해 native build wrapper와 `qa:native-baseline`을 추가한다.
- Verification: `npm run build:native`, `ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip npm run qa:native-baseline`.
- Blockers: 실제 원본 ZIP, Xvfb/xdotool, native dependency availability와 플레이 가능성은 이 작업에서 검증해야 한다. 원본 ZIP과 화면/본문을 repo 또는 evidence에 넣지 않는다.

## Todo 4: 한국어화 inventory

- Branch: `todo-04-i18n-inventory`
- First test: source hash 또는 placeholder signature가 없는 required inventory entry를 `npm run i18n:check`가 거부하는 RED case를 만든다.
- First implementation: semantic ID와 source hash만 포함한 private extraction workflow 및 public `locales/ko` schema를 추가한다.
- Verification: `npm run i18n:check`와 inventory coverage report를 실행한다.
- Blockers: C++/Boron/TLK/TITLE.EXE/AVATAR.EXE 표시면을 빠짐없이 inventory하는 방법은 아직 구현되지 않았다. 추출한 영어 corpus나 원본 바이너리를 공개 repo/evidence에 넣지 않는다.

## Todo 5: 브라우저 셸/브릿지 ABI/Pages 자산 계약

- Branch: `todo-05-browser-shell`
- First test: `tests/unit/bridge-contract.test.ts`에서 정의되지 않은 브릿지 이벤트(`message`/`clear`/`prompt`/`view`/`save-state`/`runtime-error` 외) 또는 잘못된 base path 자산이 거부되는 RED case를 만든다.
- First implementation: `index.html` + canvas + 하단 dialogue panel + status overlay + 원본 ZIP 파일 picker + save import/export를 갖춘 Vite 정적 셸과, C ABI v1에 대응하는 TS 브릿지 타입을 추가한다. 서버 프레임워크/로그인/클라우드 저장/실시간 번역 API는 추가하지 않는다.
- Verification: `npm run test:unit -- tests/unit/bridge-contract.test.ts`, `npm run build:site -- --base=/ultima/`, `npm run typecheck`.
- Blockers: 실제 GitHub Pages project-site base(`/ultima/`) 배포 검증은 이 Todo에서 하지 않는다(Todo 19에서 workflow로 완성). Playwright로 정적 셸의 file picker mock 상태만 확인한다.

## Todo 6: 단일 스레드 wasm Boron + xu4 core 빌드

- Branch: `todo-06-wasm-core`
- First test: `tests/unit/wasm-symbols.test.ts`에서 필수 브릿지/파일시스템 export 심볼이 없으면 실패하는 RED case를 만든다.
- First implementation: Emscripten 4.0.23으로 Boron 라이브러리와 xu4 core를 modularized ES output으로 컴파일한다. Asyncify와 Emscripten filesystem을 사용하고, native `pthread`/`GL`/PulseAudio/Faun mixer는 wasm에 링크하지 않는다. host/native/wasm object directory를 분리한다.
- Verification: `npm run build:wasm -- --debug`, `npm run test:unit -- tests/unit/wasm-symbols.test.ts`.
- Blockers: emsdk 설치 상태를 아직 확인하지 않았다. Todo 3의 native 기준선(빌드/실행 확인)이 선행되어야 한다.
