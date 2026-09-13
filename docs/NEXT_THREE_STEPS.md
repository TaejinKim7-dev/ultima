# Todo 1 이후 바로 할 일

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
