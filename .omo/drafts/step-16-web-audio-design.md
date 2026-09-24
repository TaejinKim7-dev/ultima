# Step 16 설계 메모: Web Audio 음악/효과음 + RFX 생성

## 1. `sound_web.cpp`가 구현해야 하는 `sound.h` 전체 함수

`vendor/xu4/src/sound.h` 전체 시그니처:

```c
int  soundInit(void);
void soundDelete(void);
void soundSuspend(int halt);
void soundFreeResourceGroup(uint16_t group);
void soundPlay(Sound sound, int specificDurationInTicks = -1);
void soundSpeakLine(int streamId, int line, bool wait = false);
int  soundDuration(Sound sound);
void soundStop();
void soundSetVolume(int);
int  soundVolumeDec();
int  soundVolumeInc();
void musicPlay(int);
void musicPlayLocale();
void musicStop();
void musicFadeOut(int);
void musicFadeIn(int, bool);
void musicSetVolume(int);
int  musicVolumeDec();
int  musicVolumeInc();
bool musicToggle();
```

`sound_faun.cpp`에는 있지만 헤더엔 없는 `musicUpdate()`는 no-op이라 생략 가능(확인 필요: 호출부에서 쓰는지).

전부 C ABI, non-blocking이어야 한다(오디오는 fire-and-forget). `soundSpeakLine`의 `wait=true`(`EventHandler::wait_msecs`)만 블로킹 성격이라 wait 무시 또는 Asyncify 경계가 필요(확인 필요).

## 2. 동기 `soundDuration()` vs 비동기 디코드

`loadSoundBuffer()`(`sound_faun.cpp:78-110`)는 `faun_loadBuffer()`가 **동기적으로 duration(초)을 반환**한다고 가정하고, 그 값을 `bufferMs[]`에 캐시해 이후 `soundDuration()`이 즉시 반환하게 한다. Web Audio의 `decodeAudioData`는 본질적으로 비동기이므로 이 계약을 그대로 못 지킨다.

권장 분리:
- **빌드 타임 매니페스트**: 패키징 단계(Todo 6/9 연동)에서 각 `Sound`/`MusicTrack` 길이(ms)를 미리 계산해 JSON manifest(`tests/unit/audio-manifest.test.ts` 검증 대상)에 넣는다. `soundDuration()`은 이 캐시 테이블만 동기 조회 — **디코드는 하지 않고 메타데이터만** 읽어 동기 유지.
- **실제 PCM 디코드는 완전 비동기**: `soundPlay`/`musicPlay` 시 TS 브리지가 `decodeAudioData` 후 재생, 디코드 전 반환돼도 됨(원본 `faun_playSource`도 트리거만 하고 블로킹하지 않음).
- 매니페스트에 없는 트랙은 `BUFFER_MS_FAILED`(=1ms) 규약대로 재시도 안 함.

## 3. Faun RFX 생성: wasm 포팅 vs TS 재구현

`vendor/faun/support/sfx_gen.c`(964줄) + `sfx_gen.h`(126줄)는 **의존성 없는 순수 C**(stdint/assert/math/stdio/stdlib/string만 사용)이고, RNG는 `extern int sfx_random(int range)` 하나만 외부에 요구한다. `cdi.h`에 `DA7A_AUDIO_RFX` 포맷 코드가 이미 정의돼 있어 RFX가 CDI 컨테이너 안에 저장되는 구조임을 확인.

**권장: pure C를 wasm으로 그대로 컴파일**(TS 재작성 아님). 이유:
- 964줄의 파형 합성(square/saw/sine/noise/pink noise/phaser/lpf/hpf) 로직을 TS로 재작성하면 부동소수점 연산 순서 차이로 원본과 다른 음이 날 위험이 크고 검증 비용이 큼.
- `build-wasm.mjs`가 이미 `vendor/faun/support`를 조건부 복사하고 `-Ivendor/faun/support` include까지 갖춰(well512 RNG용) 빌드 배관 절반이 준비돼 있다.
- `sfx_random()`만 seeded RNG(well512 또는 `xu4_random` 스텁)로 구현하면 나머지는 무수정 컴파일된다.
- `sfx_gen.o` 링크는 `libfaun.a`(재생 백엔드)를 끌어오지 않는다 — 순수 신시사이저라 Faun의 PulseAudio/미니오디오 레이어와 무관하다. `build-wasm.mjs`의 "no libfaun/libpulse" release-log guard는 로그 문자열만 검사하므로 이 변경으로 깨지지 않을 것(확인 필요: 실제 emcc 링크에서 `libfaun` 심볼 의존이 전혀 없는지는 미검증).
- `sfx_load_params`/`sfx_saveRfx`의 파일 I/O는 이미 마운트된 Emscripten FS/IDBFS로 자연스럽게 동작.
- 생성된 PCM(`SfxSynth.samples`, 44100Hz 고정)은 wasm 메모리에서 `HEAPF32`/`HEAPU8` 뷰로 JS에 복사 → `AudioBuffer`에 채워 재생. Faun의 재생 계층 자체는 필요 없다.

## 4. 제안 TS 모듈 API (시그니처만)

```ts
// audio-bridge.ts
export interface AudioManifestEntry { id: number; kind: "sound" | "music"; url: string; durationMs: number }
export function loadManifest(entries: AudioManifestEntry[]): void
export function soundDuration(id: number): number                  // sync, manifest lookup only
export function soundPlay(id: number, limitMs?: number): void       // fire-and-forget, async decode inside
export function soundStop(): void
export function soundSetVolume(vol: number): void
export function musicPlay(trackId: number): void
export function musicStop(): void
export function musicFadeOut(ms: number): void
export function musicFadeIn(ms: number, loadFromMap: boolean): void
export function musicSetVolume(vol: number): void
export function unlockAudioContext(): Promise<void>                 // called from a user gesture handler
export function generateRfx(paramsPtr: number, seed: number): Float32Array  // calls into wasm sfx_gen
export function resetForTest(): void                                 // test-only escape hatch
```

내부적으로 각 `play*` 호출은 monotonic **generation ID**를 증가시키고, 디코드 Promise가 resolve될 때 당시 generation과 "현재 generation"을 비교해 stale하면 재생을 취소한다(자세한 내용은 5절).

## 5. 첫 RED 테스트로 유닛 테스트 가능한 동작

`AudioContext` 없이도 순수 로직으로 테스트 가능한 것:
- **generation 취소 로직**: `startGeneration()` → 증가된 id 반환; `isStale(id)` → 현재 id보다 작으면 true. `musicStop()`이나 새로운 `musicPlay()` 호출이 먼저 오고, 이전 호출의 (모의) decode Promise가 나중에 resolve되면 재생을 시작하지 않아야 함 — `AudioContext`/`decodeAudioData`를 스텁/모의로 교체해 순수 Promise 타이밍만 테스트.
- **manifest 기반 `soundDuration()` 동기성**: manifest 로드 후 `soundDuration(id)`가 Promise 없이 즉시 숫자 반환하는지.
- **volume 변환**: `musicSetVolume`/`soundSetVolume`이 0~`MAX_VOLUME` 정수를 0.0~1.0 float로 정확히 매핑하는지(원본 `float(volume)/MAX_VOLUME` 규약 재현).
- **fade 상태 머신**: `musicFadeOut`이 이미 `MUSIC_NONE`이면 아무 일도 안 하는지(원본 `if (currentTrack != MUSIC_NONE)` 가드 재현).

이 항목들이 plan의 `tests/unit/audio-manifest.test.ts`가 다뤄야 할 최소 RED 세트다.

## 6. 열린 위험/확인 필요

- **확인 필요**: `musicUpdate()` 실제 호출부(`game.cpp` 등) — 헤더에 없어 이식 시 빠뜨릴 위험.
- **확인 필요**: `sfx_gen.c` 링크 시 `libfaun` 심볼 의존이 전혀 없는지 실제 emcc 빌드로 미검증(정적 리딩만 함).
- **확인 필요**: `soundSpeakLine(wait=true)`가 실제로 어디서 `wait=true`로 호출되는지, Asyncify 경계 필요 여부.
- Todo 6/9 산출물이 정확히 무엇을 완료해 두는지 이 세션에서 미확인 — manifest 빌드 스크립트가 Todo 9 산출물에 의존할 가능성.
- AudioContext unlock 훅 위치(사용자 gesture)는 이 메모에서 미설계(HTML shell 쪽 결정 필요).
