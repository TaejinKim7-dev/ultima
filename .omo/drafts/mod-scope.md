# 개조(goal.md 우선순위 5) 범위 제안 — Todo 43 (2026-10-03, 읽기 전용 조사)

goal.md §1은 "입맛대로 개조"를 우선순위 5로만 적고 내용을 정하지 않았다. 아래는 코드에서 실제로 확인한 후보 6개다. **이 문서는 제안일 뿐이며 범위는 사용자가 정한다.** 구현은 하지 않았다. `확인 필요`는 코드를 읽었지만 실행으로 확인하지 못한 부분이다.

## 후보

### A. 선택형 VGA 업그레이드 (`u4upgrad.zip`을 사용자가 직접 선택)
- **사용자가 보는 결과**: 원본 EGA 그림 대신 256색 VGA 그림으로 플레이.
- **코드 근거**: `vendor/xu4/src/u4file.cpp:248`가 `u4upgrad.zip`을 찾아 `u4zip_upgrad`로 연다. 설치 여부는 `u4file.cpp:112-122`가 `u4vga.pal`·`ega.drv` 크기로 판단한다. 팔레트는 `imagemgr.cpp:659-661`(`vgaPalette()`)이 읽고, VGA 모드 판정은 `imagemgr.cpp:37-44`다.
- **웹에서 필요한 일**: 셸에 두 번째 파일 선택기를 추가한다(`src/main.ts:89`는 `#rom-picker` 하나뿐). 검증 후 wasm FS 루트에 `u4upgrad.zip`으로 기록한다(`ultima4.zip`과 같은 방식, Todo 21.2). 그래픽 설정이 VGA 이미지를 고르는 경로는 확인 필요.
- **크기**: 중간(셸 UI + 검증 + e2e). 엔진 코드는 이미 있다.
- **위험**: 원본 데이터 규칙. zip을 저장소·배포물·evidence에 넣으면 안 된다. 사용자가 올린 파일의 SHA-256 검증 기준이 필요하다. 라이선스는 ultima4.zip과 같은 방식으로 취급한다(사용자 보유 파일).
- **테스트**: 파일이 없을 때와 손상됐을 때 거부, 있을 때 `isUpgradeAvailable` 경로 단위 테스트, 실제 파일이 있을 때만 도는 e2e(`ULTIMA4_UPGRAD` 환경변수).

### B. 한국어 설정 패널 (xu4 자체 옵션)
- **사용자가 보는 결과**: 게임 속도, 전투 속도, 음악·효과음 볼륨 등을 한국어 HTML 패널에서 바꾼다.
- **코드 근거**: `vendor/xu4/src/settings.h:100-128`(`battleSpeed`, `gameCyclesPerSecond`, `musicVol`, `soundVol`, `volumeFades`, `shortcutCommands`, `shrineTime` 등). 지금은 인트로의 Configure 메뉴로만 바꾼다(Todo 26이 한국어 오버레이로 덮음).
- **웹에서 필요한 일**: 설정을 읽고 쓰는 브리지(EM_JS)가 필요하다. 지금은 없다. 값은 `$HOME/.xu4/`(IDBFS)에 저장되므로 쓰기 후 syncfs가 필요하다.
- **크기**: 중~큼(엔진 브리지 + 패널 + 영속화).
- **위험**: 엔진이 실행 중일 때 설정을 바꾸면 일부 값이 다시 읽히지 않을 수 있다(확인 필요). 인트로 Configure 메뉴와 중복.
- **테스트**: 값 변경 → 저장 → 새로고침 후 유지(IDBFS) e2e.

### C. 게임플레이 개선 옵션 토글 (원작 버그 수정 포함)
- **사용자가 보는 결과**: xu4가 이미 가진 향상 기능을 켜고 끈다.
- **코드 근거**: `settings.h:72-86` `SettingsEnhancementOptions`: `activePlayer`, `u5spellMixing`, `u5shrines`, `u5combat`, `slimeDivides`, `gazerSpawnsInsects`, `textColorization`, `c64chestTraps`, `smartEnterKey`, `peerShowsObjects`, `u4TileTransparencyHack` 등. 기본값은 `settings.cpp`의 `DEFAULT_ENHANCEMENTS`(`settings.cpp:235`). Debug Mode(Cheats)는 이미 인트로에서 켤 수 있다(Todo 13·17이 e2e에서 사용).
- **웹에서 필요한 일**: B와 같은 설정 브리지를 쓴다. B의 일부로 묶는 것이 효율적이다.
- **위험**: 원작과 다른 규칙이 켜진다. 기본값은 원작 그대로 두고 명시적 선택이어야 한다. `textColorization`처럼 화면 텍스트에 영향을 주는 옵션은 한국어 표시(Todo 22~27)와 충돌할 수 있다(확인 필요).
- **테스트**: 옵션 하나(예: `smartEnterKey`)를 골라 켠 상태의 동작을 e2e로 확인.

### D. 터치·모바일 입력
- **사용자가 보는 결과**: 휴대폰·태블릿에서 화면 버튼으로 이동·명령.
- **코드 근거**: `settings.h:114` `MouseOptions`가 있으나 키보드 중심. GLFW 웹 포트는 키 이벤트를 받는다(`screen_glfw.cpp`). 현재 계획의 Must have 2는 "데스크톱 키보드 플레이"로 모바일을 범위 밖으로 둔다.
- **웹에서 필요한 일**: 가상 키패드를 만들고 합성 키 이벤트를 보낸다(`src/shell.ts`의 `synthesizeKeystrokes`와 같은 경로). 한국어 입력창은 모바일 IME와 충돌 위험이 높다.
- **크기**: 중~큼. **위험**: 범위 확대(Must have 2 변경 필요), 실기기 검증 불가(이 환경은 WSL2).
- **테스트**: Playwright 터치 에뮬레이션은 가능하나 실기기 증거가 아니다.

### E. 한국어 글꼴·글자 크기 선택
- **사용자가 보는 결과**: 대화 패널과 오버레이의 글꼴·크기를 고른다.
- **코드 근거**: `src/shell.css:17` `font-family: "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif`. 오버레이 글자 크기는 `src/shell.ts`가 canvas 실측 박스로 계산한다(`src/overlay/overlay-layout.ts`).
- **웹에서 필요한 일**: CSS 변수 + 설정 UI + `localStorage` 저장. 엔진 변경이 없다.
- **크기**: 작음. **위험**: 오버레이가 원본 래스터 글자를 덮는 규칙(Todo 26·27)이 글자 크기에 민감하다. 폰트 라이선스는 웹폰트를 번들할 경우 개별 확인이 필요하다(goal.md §9 폰트 메모와 같음).
- **테스트**: 크기 변경 후 오버레이가 영어 래스터를 계속 가리는지 e2e(`korean-status-overlay`에 단언 추가).

### F. 브라우저 안 번역 수정·제안 흐름
- **사용자가 보는 결과**: 어색한 번역을 보면 그 자리에서 수정안을 제출하거나 내 브라우저에서만 덮어쓴다.
- **코드 근거**: 번역은 id 기반(`locales/ko/*.json`, `src/i18n/localization.ts:81` `resolveDisplayText`)이라 id → 문장 덮어쓰기가 가능하다.
- **웹에서 필요한 일**: 번역 id를 화면에서 식별하는 UI와 사용자 덮어쓰기 저장소. 서버가 없다는 계획(Must have 3, "server/cloud save 없음") 때문에 "제출"은 GitHub issue 링크 정도가 한계다.
- **크기**: 중. **위험**: 사용자 덮어쓰기가 `placeholder` 정합성(Todo 36)을 깨뜨릴 수 있어 같은 검증이 필요하다. 영어 원문을 노출하면 안 된다(TRANSLATION_POLICY.md).
- **테스트**: 덮어쓴 문장이 표시되고 새로고침 후 유지되며, 인자 순서가 틀린 덮어쓰기는 거부되는 단위·e2e.

## 비교

| 후보 | 사용자 체감 | 크기 | 엔진 수정 | 위험 |
|---|---|---|---|---|
| A VGA 업그레이드 | 큼(화면 품질) | 중 | 없음(이미 있음) | 중(원본 데이터 규칙) |
| B 설정 패널 | 중 | 중~큼 | 있음(EM_JS 브리지) | 중 |
| C 개선 옵션 | 중 | B에 포함 | B와 공유 | 중(원작 규칙 변경) |
| D 터치 | 큼(모바일) | 중~큼 | 없음 | 높음(범위·검증) |
| E 글꼴·크기 | 작음 | 작음 | 없음 | 낮음 |
| F 번역 수정 | 중 | 중 | 없음 | 중 |

## 권장
가장 가성비가 좋은 순서는 **E → A → B+C**다. E는 엔진을 건드리지 않고 작아서 위험이 낮다. A는 엔진 코드가 이미 있어 웹 셸 작업만 필요하고 체감이 크다. B와 C는 같은 설정 브리지를 공유하므로 묶는 것이 낫다. D(터치)는 Must have 2를 바꾸는 결정이고 실기기 검증이 불가능해서 보류를 권한다. F는 번역 품질 작업(Todo 36~41)이 끝난 뒤에 가치가 커진다.

## 사용자가 답해야 할 질문
1. 모바일(D)을 목표에 포함할 것인가? 포함하면 계획의 Must have 2를 바꾼다.
2. VGA 업그레이드(A)를 지원할 것인가? `u4upgrad.zip`은 사용자가 직접 선택하는 방식으로만 한다.
3. 원작과 다른 규칙(C)을 허용할 것인가? 허용하면 기본값은 원작 그대로로 한다.
4. 개조 작업은 현재 웨이브(Todo 34~44) 뒤로 미룰 것인가, 아니면 일부를 끼워 넣을 것인가?
