# HANDOFF
작성 시각: 2026-09-26 04:40 KST — Todo 16(Web Audio 음악/효과음/RFX) 완료 반영

## 1. 목표 (What we're building)
- xu4 기반 Ultima IV를 GitHub Pages 정적 웹 앱(WASM/WebGL2/Web Audio)으로 이식한다. 진행 기준은 `/home/taejin/ultima/plan.md`(25단계 = Todo 1~21 + F1~F4).
- 이번 세션: Todo 16(Web Audio 음악/효과음/RFX 생성)을 처음부터 끝까지 구현 — Todo 21.1의 무음 `scripts/web-sound-silent.cpp` 스텁을 실제 재생으로 교체.

## 2. 현재 상태 (Current state)
- **branch `todo-16-web-audio`, commit `541d6ca`** (main `ce88bc1`에서 분기, 아직 main에 merge 안 함). 이 브랜치는 지금 `/home/taejin/ultima/.claude/worktrees/agent-a07d0d283bf448a5f` 워크트리에서 만들어졌지만, 같은 저장소이므로 `/home/taejin/ultima`(메인 체크아웃)에서도 `git checkout todo-16-web-audio`로 바로 보인다.
- **Todo 16 전부 완료, 실제 게임에서 확인**: 실제 `ultima4.zip`으로 부팅 → AudioContext unlock → 자동 트리거되는 실제 음악(94초 트랙) 재생 → 실제 메뉴 조작(Configure 서브메뉴 화살표+닫기)으로 실제 RFX 합성 효과음(UI_TICK/UI_CLICK) 재생 → pause/resume → generation-race(오래된 decode가 이미 멈춘 음악을 되살리지 못함) 전부 `tests/e2e/audio.spec.ts`로 증명.
- **진행률: 승인 기준 11/25 = 44.0%** (Step 1~9, 16, 21 ✅, Step 10 🟡).
- 이 과정에서 예상 못 한 **진짜 버그 1개**를 찾아 고쳤다(자세한 근거는 `handoff.md` "Todo 16 완료 기록" 참고): `vendor/xu4/src/module.c`의 `mod_addLayer()`가 로드된 모든 CDIEntry의 `cdi` 필드 최하위 바이트(온디스크 0xDA 매직 바이트)를 **의도적으로 레이어 번호로 덮어쓴다**(`mod_path()`가 나중에 역추적하려고) — Todo 16 이전엔 아무 코드도 런타임 `cdi`를 `DA7A_*` 상수와 비교한 적이 없어서 드러난 적 없던 문제. `CDI_MASK_FORMAT`(안 건드리는 상위 2바이트)으로 비교하도록 `sound_web.cpp`에서 수정.
- 검증 게이트 전부 exit 0 (이 브랜치, Node 22, 실제 `ultima4.zip` 사용): `npm ci` · `npm run test:unit`(15 files/**130 tests**) · `npm run verify:repo-sources`(4 pinned components) · `npm run typecheck` · `npm run build` · `git diff --check` · `npm run deps:wasm` · `npm run build:wasm -- --debug`(70/70 소스) · `npm run test:e2e -- tests/e2e/audio.spec.ts --project=chromium`(2/2) · 전체 e2e 스위트(`npx playwright test --project=chromium`, **12/12 통과**, 기존 10개 무회귀 + 신규 2개) · `npm run build:native`(sound_faun.o 그대로 링크, native 무수정 확인) · `ctest --test-dir build/native`(3/3).

## 3. 변경한 파일 (Files changed, commit `541d6ca`)
- `vendor/xu4/src/sound_web.cpp` (신규, 492줄) — sound.h 전체 구현. C++이 decision state(currentTrack/musicEnabled/volumeFades/동일-트랙 가드/BUFFER_MS_FAILED 캐시) 소유, 실행만 EM_JS로 `src/engine/audio.ts`에 위임. RFX(Faun `sfx_gen.c`)는 C++이 동기 합성.
- `scripts/web-sound-silent.cpp` (삭제) — Todo 21.1의 무음 스텁, 이걸로 교체됨.
- `scripts/build-wasm.mjs` — 소스 목록에서 `web-sound-silent.cpp` 제거, `src/sound_web.cpp` + `vendor/faun/support/sfx_gen.c` 추가. release log 문구 갱신("sound backend: Web Audio bridge").
- `src/engine/audio-manifest.ts` (신규) — CDI 컨테이너 TOC 파서 + WAV/Ogg **헤더만으로** duration 계산(압축 페이로드 디코드 안 함). `callMain()` 이전에 동기 계산해두는 표.
- `src/engine/audio.ts` (신규) — AudioContext 싱글턴, 실제 Web Audio 재생(음악 루프+페이드, 효과음, RFX PCM 직접 재생), 채널별 generation 취소 카운터, `unlockAudioContext()`/`armAutoResumeOnGesture()`.
- `src/engine/startup.ts` — `buildAudioManifest()` → `createAudioBridge()` → `module.u4Audio` 배선(`callMain()` 이전, `persistence.attach()` 직후). `StartEngineResult`에 `audioBridge` 추가.
- `src/main.ts` — `window.ultimaAudio` 노출(e2e/수동 QA 전용).
- `vendor/source-manifest.json` — xu4 `fileCount` 409→410, `treeSha256` 갱신(`sound_web.cpp` 신규 반영).
- `tests/unit/audio-manifest.test.ts`(신규, 15 tests), `tests/unit/audio-bridge.test.ts`(신규, 14 tests), `tests/unit/startup-sequence.test.ts`(+2), `tests/e2e/audio.spec.ts`(신규, 2 시나리오).
- `plan.md`, `handoff.md`, 이 파일, `.omo/plans/ultima-web.md`/`docs/ULTIMA_WEB_PLAN.md`(Todo 16 체크박스 `[x]`, byte-identical 확인) — Todo 16 완료 기록.

## 4. 주요 결정과 근거 (Key decisions)
- **C++이 decision, TS가 execution**: `sound_web.cpp`가 native `sound_faun.cpp`와 똑같은 상태 머신을 갖고, `src/engine/audio.ts`는 시키는 대로만 실행하는 "dumb executor". 이래야 native와 web이 같은 게임 로직(동일-트랙 가드, 볼륨 fade 분기 등)을 보장한다.
- **`soundDuration()` 동기 계약을 두 가지 방법으로 지킴**: WAV/Ogg는 TS가 `callMain()` 이전에 CDI 헤더만 파싱해 표로 미리 계산(C++은 `u4_web_audio_duration_ms(offset)` 동기 EM_JS 조회만). RFX는 저장된 duration이 없어서(sfx_generateWave가 유일한 방법) C++이 그 자리에서 1회 합성해 캐시. 왜 TS 매니페스트만으로 안 되냐면: RFX는 매 순간 합성해야 프레임 수를 알 수 있고 그건 C++/sfx_gen.c 쪽에서만 가능하기 때문.
- **Generation 취소는 TS에만**: 채널별 monotonic 카운터, decode resolve 시점에 비교. RFX는 C++이 이미 동기 합성한 PCM이라 async gap 자체가 없어서 이 체크가 필요 없음.
- **테스트 전용 엔트리 `playMusicFromBytesForTest`**: `playMusic()`과 완전히 같은 generation-guard 코드 경로를 타지만 FS 경로 대신 원본 바이트를 직접 받음 — e2e의 generation-race 시나리오가 엔진 내부 FS 경로 문자열을 몰라도 되게 하려고 추가.
- **RFX RNG는 독립 xorshift32** — vendor/faun의 well512는 `libboron.a`에 이미 링크돼 있어(재컴파일하면 심볼 중복), xu4 자체 게임 RNG는 DEBUG 리플레이 녹화가 소비하므로(오염 금지) 재사용 안 함.

## 5. 다음 할 일 (Next steps)
- [ ] **`todo-16-web-audio` 브랜치의 main merge** — AGENTS.md 규칙상 사용자(코디네이팅 세션) 확인 필요, 이 세션에서는 안 함. 커밋 `541d6ca` 하나, diff는 이 파일 3번 섹션 참고.
- [ ] **Todo 10의 `tests/e2e/save-reload.spec.ts`** — persistence coordinator는 Todo 21.2에서 연결됐지만 실제 저장 트리거(캐릭터 생성 등)가 아직 자동화 안 됨. 남은 항목 중 우선순위 1순위.
- [ ] 병렬 가능: Todo 19 workflow 골격(Node 22 CI) — 아직 착수 안 함. 완료 판정은 15·16·18 이후지만 16은 이제 완료.
- [ ] Todo 11~13(한국어 UI, 설계 메모 `.omo/drafts/step-11-13-korean-ui-design.md`) → 14 → 15(번역 4402건) → 17 → 18 → 19 완료 → 20 → F1~F4.

## 6. 막힌 부분 / 주의사항 (Blockers & gotchas)
- **`soundSpeakLine()`의 stream sub-range 재생 미구현** — 이 게임 모듈(`config.b`)에 `voice:` 블록이 아예 없어서 `VOICE_*` id 조회가 항상 NULL임을 실제 빌드된 Ultima-IV.mod TOC로 확인. 구현해도 테스트 불가능하니 guard까지만 하고 `errorWarning()`으로 남김 — 다음에 이 모듈에 진짜 음성 데이터가 추가되면 그때 구현할 것.
- **AudioContext "제스처 전에는 잠겨 있어야 한다"는 계약의 절반이 이 Playwright/Chromium 하네스에서 증명 불가** — `--autoplay-policy=user-gesture-required`를 줘도 `page.goto()` 직후 `navigator.userActivation.hasBeenActive`가 이미 `true`로 나옴(CDP 자동화 특성으로 보임). resume-if-suspended 로직 자체는 유닛 테스트로 커버했지만, "진짜 사용자가 제스처 없이 열면 잠겨 있는지"는 F3(실제 브라우저 수동 QA)에서 확인 필요.
- **WebKit/Firefox의 실제 Ogg Vorbis `decodeAudioData` 지원 여부 미검증** — e2e는 Chromium 전용. F3 필요.
- **CDI `cdi` 필드를 다시 만질 일이 생기면**: 런타임에 얻은 `CDIEntry*`의 `cdi` 필드는 절대 원본 파일의 `DA7A_*` 매직/포맷 값 그대로가 아니다 — `mod_addLayer()`가 최하위 바이트를 레이어 인덱스로 덮어쓴다(`vendor/xu4/src/module.c`, "Replace high 0xDA byte with layer number"). 포맷 비교는 반드시 `CDI_MASK_FORMAT`으로 마스킹한 뒤 할 것.
- `vendor/xu4/src/sound_web.cpp`를 또 고칠 일이 생기면 반드시 `vendor/source-manifest.json`의 `treeSha256`도 같이 갱신할 것 — `node -e "import('./scripts/repo-source-verifier.mjs').then(({summarizeSourceTree}) => console.log(JSON.stringify(summarizeSourceTree('vendor/xu4'))))"`로 재계산.
- 로그인 셸이 아닌 환경에선 `/usr/bin/node`(v20)가 먼저 잡힌다 — `export PATH="$HOME/.local/opt/node22/bin:$PATH"` 필요. wasm 빌드 시 emsdk PATH도 직접 걸어야 할 수 있다(워크트리 격리 환경에서 `source .emsdk/emsdk_env.sh`가 sandbox에 막힐 수 있음 — 이 세션은 `PATH="$HOME/.local/opt/node22/bin:/home/taejin/ultima/.emsdk:/home/taejin/ultima/.emsdk/upstream/emscripten:/home/taejin/ultima/.emsdk/node/22.16.0_64bit/bin:$PATH" EM_CONFIG="/home/taejin/ultima/.emsdk/.emscripten"`을 명령 앞에 직접 붙이는 방식으로 우회함).
- 원본 데이터: `/home/taejin/ultima4-original-data/ultima4.zip`. repo에 복사 안 함.

## 7. 재개 방법 (How to resume)
```bash
cd /home/taejin/ultima
git checkout todo-16-web-audio   # main ce88bc1에서 분기, 커밋 541d6ca
export PATH="$HOME/.local/opt/node22/bin:$PATH"; node -v   # v22.23.3
git status -sb && git log --oneline -5
npm ci
PATH="$HOME/.local/opt/node22/bin:$HOME/ultima/.emsdk:$HOME/ultima/.emsdk/upstream/emscripten:$HOME/ultima/.emsdk/node/22.16.0_64bit/bin:$PATH" \
  EM_CONFIG="$HOME/ultima/.emsdk/.emscripten" \
  npm run deps:wasm && npm run build:wasm -- --debug
npm run test:unit && npm run verify:repo-sources && npm run typecheck && npm run build && git diff --check
ULTIMA4_DATA=/home/taejin/ultima4-original-data/ultima4.zip npx playwright test --project=chromium
```
- 공식 인계: `handoff.md` "Todo 16 완료 기록 (2026-09-26, ...)". 진행률/순서: `plan.md`. Todo 16 전문: `.omo/plans/ultima-web.md`. 운영 규칙: `AGENTS.md`.
