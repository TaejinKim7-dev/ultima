# Ultima IV 웹 구동 + 한글화 프로젝트

Claude Code 인수인계 문서.

---

## 0. 이 문서 사용법

- **"실측"으로 표시된 것만 확인된 사실이다.** `xu4-engine/u4` master를 clone해서 직접 읽고 컴파일한 결과다.
- **"미검증"으로 표시된 것은 가설이다.** 작업 시작 전에 반드시 직접 확인할 것.
- 추측으로 코드를 고치지 말고, 해당 파일을 먼저 열어볼 것. 이 문서의 행 번호는 clone 시점 기준이라 어긋날 수 있다.

---

## 1. 목표

Apple II 시절 Ultima IV(1985)를 **브라우저에서 구동**하고, **한글화**한다.

우선순위:

| 순위 | 목표 | 이유 |
|---|---|---|
| 1 | 브라우저에서 원본 그대로 실행 | 이게 안 되면 나머지가 의미 없음 |
| 2 | 한글 렌더링 | 번역보다 먼저. 1단계 PoC 완료 상태 |
| 3 | 텍스트 레이아웃 재설계 | 한글 8자/줄 제약 해소 (필수) |
| 4 | 텍스트 번역 | 세 군데로 흩어져 있음 (§5) |
| 5 | 입맛대로 개조 | 그 다음 |

---

## 2. 결정된 사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 베이스 저장소 | `https://github.com/xu4-engine/u4` (master) | GPL. 모던 아키텍처 |
| 플랫폼 백엔드 | **GLFW** (`./configure --glfw`) | Emscripten이 GLFW3를 포팅 제공. 기본값 `glv`는 X11 의존이라 불가 |
| 웹 이식 방식 | **Emscripten → WASM** | TS 재작성 대비 압도적으로 저비용. 게임 로직이 이미 완성품 |
| 한글 렌더링 | 별도 레이어 (`hangul.c`) | 1단계 PoC 완료. §6 참조 |

원본 게임 데이터(`ultima4.zip`, `u4upgrad.zip`)는 저장소에 없다. GOG에서 프리웨어로 배포되는 DOS판을 별도로 구해 런타임에 읽는다.

---

## 3. 코드베이스 실측 결과

### 3.1 텍스트 처리 구조 (한글화의 근거)

| 위치 | 내용 | 상태 |
|---|---|---|
| `src/textview.h` | `CHAR_WIDTH 8`, `CHAR_HEIGHT 8` | 실측 |
| `src/textview.cpp` `drawChar()` | `charset->drawLetter(..., 0, chr * CHAR_HEIGHT, ...)` — 문자코드를 글리프 스트립의 **세로 오프셋**으로 사용 → 글리프 최대 256개 | 실측 |
| `src/textview.cpp` `textAt()` | `while ((ch = *text++))` — 바이트 단위 순회 | 실측 |
| `src/screen.cpp` `screenShowChar()` | 인게임 메시지의 실제 출력 지점 | 실측 |
| `src/screen.cpp` `screenMessageN()` | 워드랩 + 스크롤 담당. **한글 분기를 넣을 곳** | 실측 |
| `src/event_sdl.cpp:27` | `key = event.key.keysym.unicode & 0x7F` — 입력이 7비트로 마스킹 | 실측 |
| `src/u4.h` | `TEXT_AREA_X 24`, `TEXT_AREA_Y 12`, `TEXT_AREA_W 16`, `TEXT_AREA_H 12` → **128x96px** | 실측 |
| `src/` 전체 | UTF-8 / wchar 처리 **없음** | 실측 (grep) |
| `module/render/font/` | `cfont.png` + `.txf` (GPU 폰트). `gpu_opengl.cpp`·`gui.cpp`에서만 사용 = **게임 브라우저/메뉴 전용** | 실측 |

**결론: 인게임 텍스트는 8x8 비트맵 격자에 갇혀 있고, 메뉴 UI만 현대적 GPU 폰트를 쓴다.**

### 3.2 빌드 의존성

| 의존 | 출처 | Emscripten 대응 |
|---|---|---|
| GLFW 3 | 시스템 | `-sUSE_GLFW=3` (내장 포트) |
| OpenGL | 시스템 + `src/support/glad.c` | **문제 있음.** §4.1 |
| libpng, zlib | 시스템 | `-sUSE_LIBPNG=1 -sUSE_ZLIB=1` |
| **boron** | 서브모듈 아님, 시스템 `-lboron` | 소스 빌드 필요. §4.3 |
| **faun** | 서브모듈 `https://codeberg.org/wickedsmoke/faun.git` | 오디오. 초기엔 스텁. §4.4 |
| glv | 서브모듈 `git.code.sf.net/p/outguard/glv` | **불필요** (GLFW 쓰므로) |
| Xcursor, X11 | 시스템 | 불필요 |

`.gitmodules`에 `src/glv`, `src/faun` 두 개가 있으나 clone 직후 비어 있다.

### 3.3 이미 존재하는 GLES 경로

`src/gpu_opengl.cpp` 42행 근처에 `#ifdef ANDROID` / `#elif defined(USE_GLES)` 분기가 있어 `#version 310 es` 셰이더를 쓴다. `android/` 디렉터리에 Android 빌드가 있다. **웹 포팅 시 이 분기를 그대로 참고할 것.** 다만 버전 숫자는 그대로 쓰면 안 된다(§4.2).

기본 설정은 `project.b`에 `gpu_render: false`이므로 GPU 렌더 경로는 스케일링에만 쓰인다. 셰이더 노출 면적이 작아서 다행이다.

---

## 4. 웹 이식 위험 요소 (착수 전 필독)

### 4.1 glad — GL 로더 ★높음

`src/gpu_opengl.h`가 `glad.h`를 include하고, `gpu_opengl.cpp:167`이 `glad.c`를 통째로 include한다. `screen_glfw.cpp:427`에서 `gladLoadGL()`을 호출한다.

Emscripten은 GL 함수를 동적 로딩하지 않는다. glad는 동작하지 않는다.

→ `__EMSCRIPTEN__` 분기를 만들어 glad를 배제하고 `<GLES3/gl3.h>`를 직접 include, `gladLoadGL()` 호출을 건너뛰도록 한다.

### 4.2 셰이더 GLSL 버전 ★높음

`src/gpu_opengl.cpp`의 `DVERSION`이 `#version 330` 또는 `#version 310 es`다.

**WebGL2는 GLSL ES 3.00만 지원한다. `310 es`는 지원되지 않는다.**

→ 기존 ANDROID 분기 옆에 `__EMSCRIPTEN__` 분기를 추가하고 `#version 300 es` + `precision highp float;`로 지정. 셰이더 본문에 310 es 전용 문법이 있으면 하향 수정 필요(미검증 — 컴파일 로그로 확인할 것).

### 4.3 boron 인터프리터 ★중간

`src/Makefile.common`의 boron 블록은 `#ifeq` 주석 처리 상태로 **항상 켜져 있다**. 즉 선택이 아니다.

```
	CSRCS+=module.c support/cdi.c
	CXXSRCS+=config_boron.cpp
```

`module/Ultima-IV/*.b`가 Boron 스크립트라 인터프리터 없이는 게임 설정 자체를 못 읽는다.

→ boron 소스를 받아 `emcc`로 함께 빌드. 순수 C로 알려져 있으나 스레드/동적로딩 사용 여부는 **미검증**. 빌드 시도해서 확인할 것.

### 4.4 faun 오디오 ★중간

`src/sound_faun.cpp`가 `<faun.h>`를 쓴다. faun은 별도 서브모듈이며 믹서 스레드를 쓸 가능성이 높다(미검증).

→ **Phase 1에서는 무음 스텁으로 대체**한다. `sound.h`의 인터페이스를 만족하는 `sound_null.cpp`를 만들고 `SOUND=null`로 빌드. 오디오는 Phase 4로 미룬다.

### 4.5 블로킹 메인 루프 ★★최고 위험

`src/event.cpp:329` `EventHandler::run()`:

```c
resume:
    while (! ended && ! controllerDone) {
        handleInputEvents(NULL, updateScreen);
        ...
        screenSwapBuffers();
        frameSleep(&fs, 0);
    }
    if (paused && ! runPause())
        goto resume;
```

- 블로킹 `while` 루프
- `runRecursion` 카운터가 있다 = **재귀적으로 중첩 호출된다** (대화창, 상점 등)
- `frameSleep()`으로 직접 대기

브라우저는 단일 스레드라 이런 루프는 탭을 얼려버린다. 그리고 중첩 호출 때문에 `emscripten_set_main_loop`로 단순 변환이 **불가능하다.**

→ **`-sASYNCIFY`를 쓴다.** `frameSleep`을 `emscripten_sleep()`으로 치환. 코드 바이너리가 커지고 느려지지만, 재귀 루프 구조를 갈아엎는 것보다 훨씬 싸다.
→ `-sASYNCIFY_STACK_SIZE`를 넉넉히 잡을 것. 기본값으로는 중첩 시 스택 부족이 날 수 있다(미검증).

### 4.6 파일시스템

| 대상 | 방식 |
|---|---|
| `ultima4.zip`, `u4upgrad.zip` | 사용자가 브라우저에서 업로드 → `FS.writeFile`로 MEMFS에 주입 |
| `module/` (config.b, graphics.b, maps.b, vendors.b, 폰트) | `--preload-file`로 번들 |
| 세이브 | IDBFS 마운트 + `FS.syncfs(false, cb)`로 영속화 |

**게임 데이터를 저장소나 배포물에 포함하지 말 것.** 저작권은 EA에 있다. 사용자가 각자 GOG판을 올리는 구조로 간다.

`src/support/unzip.c`가 zip 읽기를 자체 처리하므로 시스템 minizip 의존은 없다(실측).

---

## 5. 번역 대상 텍스트 (3군데)

| 위치 | 형태 | 규모 | 접근법 |
|---|---|---|---|
| C++ 하드코딩 | `src/*.cpp` 문자열 리터럴 (`"It's Dark!\n"`, `"Cmd (h = help):"`) | 대문자 시작 6자 이상만 431건 (grep, 중복 포함) | ID 기반 문자열 테이블로 추출 |
| 모듈 스크립트 | `module/Ultima-IV/vendors.b` (36KB, 큰따옴표 240개), `config.b` (무기·방어구·몬스터 이름) | 상점 대사 전체 | Boron 스크립트 직접 수정 |
| **원본 데이터** | `.TLK` 16개 | NPC당 288바이트 고정 블록 × 널종료 문자열 12개 | **외부 번역 테이블** |

`.TLK` 파일 목록 (실측, `module/Ultima-IV/maps.b`에서 추출):
`britain, cove, den, empath, jhelom, lcb, lycaeum, magincia, minoc, moonglow, paws, serpent, skara, trinsic, vesper, yew`

### .TLK 바이너리를 직접 패치하지 말 것

NPC 한 명당 **288바이트 고정 블록**이다. 한글 UTF-8은 글자당 3바이트라 원문 자리에 들어가지 않는다.

→ `파일명:NPC인덱스:문자열인덱스 → 한글` 매핑을 담은 외부 JSON/텍스트를 만들고, `src/discourse_tlk.cpp`의 문자열 조회 지점에서 후킹한다.

저장소에는 **번역 테이블 생성 스크립트만** 두고, 결과물은 사용자의 게임 데이터에서 로컬 생성하게 한다. 번역문은 원문의 2차적저작물이라 배포가 곤란하다.

---

## 6. 이미 만들어진 것 — 한글 렌더링 PoC

`xu4-hangul-poc/` 디렉터리에 있다.

```
src/hangul.h            인터페이스
src/hangul.c            UTF-8 디코더 + 16x16 글리프 blit
tools/mkhangulfont.py   TTF → 한글 11,172자 비트맵 아틀라스
tools/test_hangul.c     검증 하네스
tools/preview.py        텍스트영역 규격 미리보기
xu4-hangul-poc.patch    screen.cpp / Makefile.common 통합 지점
```

### 검증된 것

```
hangul16.bin: 357504 bytes, 11172 glyphs, blank=0
glyphs drawn=9, lit pixels=441
truncated seq -> cp=U+FFFD advance=1
illegal byte   -> cp=U+FFFD advance=1
'가' -> U+AC00
```

`gcc -Wall -Wextra`로 xu4 헤더(`support/image32.h`)와 함께 컴파일해 단독 실행한 결과다. 경고 없음.

### 검증되지 않은 것

**xu4 본체에 붙인 상태로는 빌드하지 않았다.** Allegro/GLFW·Boron·Faun 의존성 때문이다. 패치 적용 후 동작은 직접 확인해야 한다.

### 설계 원칙

기존 ASCII 경로를 건드리지 않는다. `screenMessageN()`의 바이트 루프에서 `0x80` 이상만 새 경로로 분기시킨다. `hangul16.bin`이 없으면 게임은 원래대로 돈다.

**분기는 반드시 `switch (buffer[i])` 앞에 넣어야 한다.** switch가 `buffer[i]`를 signed char로 비교하므로 0x80 이상 바이트가 엉뚱한 case에 걸린다.

### 웹 이식 관점

`hangul.c`는 순수 C에 표준 라이브러리만 쓴다. wasm으로 그대로 넘어간다. 아틀라스 350KB는 `--preload-file`로 번들하면 된다.

---

## 7. 작업 단계

### Phase 0 — 네이티브 빌드 통과 (선행 필수)

웹으로 가기 전에 리눅스에서 먼저 돌려야 한다. 여기서 막히면 Emscripten에서는 원인 분리가 불가능하다.

- [ ] `git clone https://github.com/xu4-engine/u4`
- [ ] boron, faun, glfw, libpng, zlib 설치
- [ ] `./configure --glfw && make`
- [ ] GOG 프리웨어 U4 데이터로 실행 확인

**완료 조건: 네이티브에서 게임이 시작되고 브리타니아를 걸어다닐 수 있다.**

### Phase 1 — Emscripten 빌드 통과

- [ ] `sound_null.cpp` 작성, `SOUND=null` 빌드 경로 추가 (§4.4)
- [ ] glad 배제 + `<GLES3/gl3.h>` 분기 (§4.1)
- [ ] 셰이더 `#version 300 es` 분기 (§4.2)
- [ ] boron를 emcc로 빌드 (§4.3)
- [ ] `-sASYNCIFY` + `frameSleep` → `emscripten_sleep` (§4.5)
- [ ] `-sUSE_GLFW=3 -sUSE_LIBPNG=1 -sUSE_ZLIB=1 -sFULL_ES3 -sALLOW_MEMORY_GROWTH`
- [ ] `module/` preload, 게임 데이터 업로드 UI, IDBFS 세이브 (§4.6)

**완료 조건: 브라우저에서 인트로가 뜨고 게임이 시작된다. 무음이어도 무방.**

### Phase 2 — 한글 렌더링 통합

- [ ] `hangul.c` + `hangul16.bin` 편입
- [ ] `xu4-hangul-poc.patch` 적용
- [ ] 브라우저에서 한글 출력 확인

**완료 조건: 게임 메시지 영역에 한글이 찍힌다.**

### Phase 3 — 텍스트 레이아웃 재설계 ★핵심

현재 `TEXT_AREA_W 16`, `TEXT_AREA_H 12` = **한글 8자/줄, 6줄.** NPC 대사 한 마디도 못 담는다.

검토할 방향:

| 안 | 내용 | 트레이드오프 |
|---|---|---|
| A | 텍스트 영역을 캔버스 밖 HTML 오버레이로 분리 | 웹이라 가능. 원본 화면은 그대로 두고 대사만 아래 별도 영역. 가장 유연 |
| B | `cfont/txf` GPU 폰트를 인게임까지 확장 | 원본 통합감 유지. 8x8 격자 코드 대수술 필요 |
| C | 텍스트 영역 자체를 확대 | 원본 레이아웃 파괴 |

**웹 기반이라면 A안이 유력하다.** 브라우저의 텍스트 렌더링을 쓰면 폰트 아틀라스도, 워드랩 재작성도, 한글 8자 제약도 한 번에 사라진다. 이 경우 Phase 2의 비트맵 렌더러는 상태창 등 좁은 영역용으로만 남는다.

**Phase 1~2를 끝내고 실물을 본 뒤 결정할 것.**

### Phase 4 — 번역

§5의 세 경로를 순서대로. `vendors.b`(쉬움) → 하드코딩 문자열(중간) → `.TLK`(어려움).

### Phase 5 — 오디오, 개조

---

## 8. 하지 말 것

| 금지 | 이유 |
|---|---|
| `.TLK` 바이너리 직접 패치 | 288바이트 고정 블록. 한글이 안 들어감 |
| 게임 데이터(zip, 맵, 대사)를 저장소에 커밋 | 저작권 EA |
| 번역 결과물 배포 | 원문의 2차적저작물 |
| 문서의 행 번호를 그대로 신뢰 | clone 시점 기준. 반드시 파일을 열어 확인 |
| Phase 0 건너뛰고 Emscripten 직행 | 원인 분리 불가능해짐 |
| 한글 렌더링 없이 번역 먼저 | 화면에 띄울 방법이 없어 전부 헛일 |

---

## 9. 참고

| 항목 | 링크 |
|---|---|
| 베이스 저장소 | github.com/xu4-engine/u4 |
| 개발 최전선 포크 | github.com/WickedSmoke/xu4 |
| 독일어 번역 선례 (구 SDL 1.2 계열) | github.com/TeaRex73/xu4-deutsch |
| U4 내부 포맷 문서 | wiki.ultimacodex.com/wiki/Ultima_IV_internal_formats |
| U4 데이터 탐색 도구 | github.com/jtauber/ultima4 |
| U4 디컴파일 | github.com/ergonomy-joe/u4-decompiled |
| faun (오디오) | codeberg.org/wickedsmoke/faun |

폰트: PoC는 Noto Sans CJK를 16px로 구웠으나 **받침 있는 글자의 획이 뭉개진다.** 갈무리·둥근모 계열 전용 픽셀 폰트로 교체를 권장한다. `mkhangulfont.py`는 폰트 파일만 바꾸면 재사용된다. 라이선스는 개별 확인 필요.

