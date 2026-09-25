/*
 * sound_web.cpp -- Todo 16: the real wasm/browser sound.h backend.
 *
 * Replaces scripts/web-sound-silent.cpp (Todo 21.1's silent no-op stub,
 * which existed only so the real engine would link before this Todo could
 * implement real audio) with real playback: real Ogg/WAV decode+playback
 * via the browser's own Web Audio decoder (through the TS bridge in
 * src/engine/audio.ts, reached via the EM_JS trampolines below) and real
 * procedurally-synthesized sound effects via Faun's sfx_gen.c synthesizer
 * (vendor/faun/support/sfx_gen.c, compiled directly into this wasm build --
 * see scripts/build-wasm.mjs). RFX assets are a real, exercised part of
 * this game module: SOUND_UI_CLICK/UI_TICK (menu navigation), SOUND_CANNON,
 * SOUND_PARTY_STRUCK, SOUND_WHIRLPOOL/STORM, SOUND_FIZZLE and SOUND_IGNITE
 * are all *.rfx entries in vendor/xu4/module/Ultima-IV/config.b's sound:
 * block (verified against a real built Ultima-IV.mod during this Todo's
 * investigation -- see handoff.md), not silent placeholders.
 *
 * This file owns every piece of xu4 sound.h *decision* state exactly the
 * way sound_faun.cpp (the native SOUND=faun backend, left completely
 * unchanged by this Todo) does: currentTrack, musicEnabled, the
 * volumeFades branch, the same-track guard, the BUFFER_MS_FAILED cache
 * convention. It differs from sound_faun.cpp only in *how* it executes a
 * decision once made: instead of calling into Faun's mixer, it calls a JS
 * function (via EM_JS) that executes the same action through the Web
 * Audio API. See src/engine/audio.ts's module doc comment for the JS side
 * of this contract, and its EM_JS call sites below for the exact shape.
 *
 * soundDuration() must be SYNCHRONOUS -- every sound.h caller assumes this
 * (e.g. game.cpp:277's `uniqueSpellSounds = soundDuration(SOUND_SPELL_A) >
 * 0`, creature.cpp's `EventHandler::wait_msecs(soundDuration(...))`) -- but
 * AudioContext.decodeAudioData() is asynchronous. Two different answers
 * depending on format:
 *   - WAV/Ogg Vorbis: src/engine/audio-manifest.ts parses just the
 *     container header (never the compressed payload) synchronously in
 *     TS, BEFORE callMain() ever runs (src/engine/startup.ts), keyed by
 *     CDIEntry.offset (unique within one module file). soundDuration()
 *     answers via a single synchronous EM_JS lookup into that table.
 *   - RFX: there is no stored duration anywhere -- sfx_generateWave() *is*
 *     the only way to learn how many samples a given SfxParams blob
 *     produces -- so this file generates once (synchronously; every RFX
 *     clip in this module is a short UI/impact sound, well under a second
 *     of samples) and caches the frame count in bufferMs[], exactly like
 *     every other Sound id.
 *
 * soundSpeakLine() is implemented against the real contract (matching
 * sound_faun.cpp's guard chain exactly) but this module ships no `voice:`
 * block in config.b, so config_musicFile(VOICE_*) can never actually
 * return non-null here -- verified by grepping config.b and by computing
 * every VOICE_* id's CDI appId against a real built Ultima-IV.mod's TOC
 * during this Todo's investigation (zero matches). Faun's sub-range
 * (start, duration) playback within an already-open stream
 * (faun_playStreamPart()) is therefore left unimplemented rather than
 * guessed at and shipped untested: if this module ever grows real voice
 * data, this is the one function that needs a second pass.
 */

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include <emscripten.h>

#include "sound.h"

#include "cdi.h"
#include "config.h"
#include "context.h"
#include "debug.h"
#include "error.h"
#include "settings.h"
#include "xu4.h"

extern "C" {
#include "sfx_gen.h"
}

#define config_soundFile(id)    xu4.config->soundFile(id)
#define config_musicFile(id)    xu4.config->musicFile(id)
#define BUFFER_LIMIT    SOUND_MAX
#define BUFFER_MS_FAILED    1

namespace {

uint16_t bufferMs[BUFFER_LIMIT];
uint16_t bufferResGroup[BUFFER_LIMIT];
int currentTrack = MUSIC_NONE;
int musicEnabled = 1;
int musicFadeMs = 0;
float soundVolume = 0.0f;
float musicVolume = 0.0f;

/*
 * CDI format tag for a procedurally-synthesized (RFX) sound effect.
 * vendor/xu4/src/support/cdi.h: DA7A_AUDIO_RFX.
 *
 * Compared against ent->cdi through CDI_MASK_FORMAT, never by raw equality
 * -- vendor/xu4/src/module.c's mod_addLayer() OVERWRITES every loaded
 * entry's low cdi byte (the on-disk 0xDA magic byte) with that module's
 * layer index ("Replace high 0xDA byte with layer number in all entries"),
 * for mod_path() to later recover which layer file an entry came from. The
 * upper two bytes (the actual DA7A_AUDIO_* format code, CDI_MASK_FORMAT)
 * are left untouched. Nothing before this Todo ever compared a runtime
 * CDIEntry's cdi field against a DA7A_* constant (native sound_faun.cpp
 * only ever reads ent->offset/ent->bytes), so this repurposing was never a
 * problem until RFX detection needed it -- confirmed empirically against
 * the real engine during this Todo's investigation (see handoff.md): a
 * real SOUND_UI_TICK CDIEntry's raw on-disk cdi (0x30207ada, layer 0)
 * reads back at runtime as 0x30207a01 (layer 1) once Boron loads it.
 */
const uint32_t WEB_AUDIO_RFX = CDI32(0xDA, 0x7A, 0x20, 0x30);
const uint32_t WEB_AUDIO_RFX_FORMAT = WEB_AUDIO_RFX & CDI_MASK_FORMAT;

/*
 * Independent tiny xorshift32 RNG for sfx_gen.c's required `sfx_random()`
 * entry point. Deliberately NOT vendor/faun's well512 (that algorithm is
 * already compiled into libboron.a -- vendor/xu4/src/xu4.cpp's own
 * well512_init() call already links it -- so compiling well512.c a second
 * time here would duplicate-define its symbols) and NOT xu4's own gameplay
 * RNG (xu4_random(), seeded/consumed by the DEBUG replay-recording feature
 * in xu4.cpp; real audio synthesis must never perturb that stream). This
 * is reseeded per RFX generation from the asset's own stored randSeed
 * field, mirroring vendor/faun/faun.c's faun_generateSfx() (`
 * faun_randomSeed(&_rng, sp->randSeed)`), which exists so sfxr-style noise
 * texture is reproducible per saved RFX asset rather than different every
 * time it plays.
 */
uint32_t sfxRngState = 1;

void sfxSeed(uint32_t seed) {
    sfxRngState = seed ? seed : 0x9E3779B9u;
}

}  // namespace

extern "C" int sfx_random(int range) {
    if (range <= 0)
        return 0;
    sfxRngState ^= sfxRngState << 13;
    sfxRngState ^= sfxRngState >> 17;
    sfxRngState ^= sfxRngState << 5;
    return (int) (sfxRngState % (uint32_t) range);
}

namespace {

/* ------------------------------------------------------------------
 * EM_JS bridge to src/engine/audio.ts (attached to Module.u4Audio by
 * src/engine/startup.ts before callMain(), keyed by the exact same
 * modulePath()/CDIEntry.offset/CDIEntry.bytes native code already reads).
 * Every call is guarded with `Module.u4Audio &&` so a build that never
 * attaches a bridge (e.g. a future headless/test harness) degrades to
 * silence instead of throwing.
 * ------------------------------------------------------------------ */

EM_JS(int, u4_web_audio_duration_ms, (int offset), {
    return (Module.u4Audio && Module.u4Audio.durationMs(offset)) || 0;
});

EM_JS(void, u4_web_audio_play_effect, (const char *path, int offset, int bytes, int limitMs), {
    if (Module.u4Audio)
        Module.u4Audio.playEffect(UTF8ToString(path), offset, bytes, limitMs);
});

EM_JS(void, u4_web_audio_play_effect_pcm, (int samplesPtr, int frameCount, int limitMs), {
    if (Module.u4Audio) {
        var view = new Float32Array(HEAPF32.buffer, samplesPtr, frameCount);
        /* Copy now, inside this call: the caller frees the synth buffer
         * right after u4_web_audio_play_effect_pcm() returns, and wasm
         * memory growth can move the heap out from under a lingering
         * view. */
        Module.u4Audio.playEffectPcm(view.slice(), limitMs);
    }
});

EM_JS(void, u4_web_audio_stop_effects, (), {
    Module.u4Audio && Module.u4Audio.stopEffects();
});

EM_JS(void, u4_web_audio_set_effect_volume, (double volume), {
    Module.u4Audio && Module.u4Audio.setEffectVolume(volume);
});

EM_JS(void, u4_web_audio_play_music, (const char *path, int offset, int bytes, int fadeInMs), {
    if (Module.u4Audio)
        Module.u4Audio.playMusic(UTF8ToString(path), offset, bytes, fadeInMs);
});

EM_JS(void, u4_web_audio_stop_music, (), {
    Module.u4Audio && Module.u4Audio.stopMusic();
});

EM_JS(void, u4_web_audio_fade_out_music, (int fadeMs), {
    Module.u4Audio && Module.u4Audio.fadeOutMusic(fadeMs);
});

EM_JS(void, u4_web_audio_set_music_volume, (double volume), {
    Module.u4Audio && Module.u4Audio.setMusicVolume(volume);
});

EM_JS(void, u4_web_audio_suspend, (int halt), {
    Module.u4Audio && Module.u4Audio.suspend(!!halt);
});

/* ------------------------------------------------------------------
 * RFX synthesis (sfx_gen.c, compiled directly into this wasm build --
 * scripts/build-wasm.mjs).
 * ------------------------------------------------------------------ */

/*
 * An RFX CDIEntry's bytes are: 4-byte magic "rFX ", 2-byte format version,
 * 2 unused bytes, then a raw 96-byte SfxParams (vendor/faun/support/
 * sfx_gen.h) -- the same 8-byte-header-then-SfxParams layout
 * vendor/faun/faun.c's faun_readBuffer() RFX branch reads, and verified
 * byte-for-byte against a real built Ultima-IV.mod's ui_tick.rfx entry
 * during this Todo's investigation (see handoff.md).
 */
bool readRfxParams(const uint8_t *blob, uint32_t blobBytes, SfxParams *out) {
    if (blobBytes < 8 + sizeof(SfxParams))
        return false;
    if (memcmp(blob, "rFX ", 4) != 0)
        return false;
    uint16_t version;
    memcpy(&version, blob + 4, sizeof(version));
    if (version != 200)
        return false;
    memcpy(out, blob + 8, sizeof(SfxParams));
    return true;
}

/*
 * Generates the full waveform for an RFX entry, synchronously. Returns the
 * sample count (0 on failure); if samplesOut is non-null, allocates and
 * fills a HEAPF32-backed buffer the caller must free().
 */
uint32_t generateRfx(const CDIEntry *ent, float **samplesOut) {
    const char *path = xu4.config->modulePath(ent);
    FILE *fp = fopen(path, "rb");
    if (!fp)
        return 0;

    uint32_t frames = 0;
    uint8_t *blob = (uint8_t *) malloc(ent->bytes);
    if (blob != nullptr && fseek(fp, ent->offset, SEEK_SET) == 0 &&
        fread(blob, 1, ent->bytes, fp) == ent->bytes) {
        SfxParams params;
        if (readRfxParams(blob, ent->bytes, &params)) {
            SfxSynth *synth = sfx_allocSynth(SFX_F32, 44100, 6);
            if (synth != nullptr) {
                sfxSeed(params.randSeed);
                int generated = sfx_generateWave(synth, &params);
                if (generated > 0) {
                    frames = (uint32_t) generated;
                    if (samplesOut != nullptr) {
                        float *copy = (float *) malloc(frames * sizeof(float));
                        if (copy != nullptr) {
                            memcpy(copy, synth->samples.f, frames * sizeof(float));
                            *samplesOut = copy;
                        } else {
                            frames = 0;
                        }
                    }
                }
                free(synth);
            }
        }
    }
    free(blob);
    fclose(fp);
    return frames;
}

uint16_t loadSoundBuffer(int sound) {
    uint16_t ms;
    const CDIEntry *ent = config_soundFile(sound);
    if (ent == nullptr) {
        ms = BUFFER_MS_FAILED;
    } else if ((ent->cdi & CDI_MASK_FORMAT) == WEB_AUDIO_RFX_FORMAT) {
        uint32_t frames = generateRfx(ent, nullptr);
        ms = frames > 0 ? (uint16_t) ((uint64_t) frames * 1000 / 44100) : (uint16_t) 0;
        if (ms == 0)
            ms = BUFFER_MS_FAILED;
    } else {
        int fromManifest = u4_web_audio_duration_ms((int) ent->offset);
        ms = fromManifest > 0 ? (uint16_t) fromManifest : (uint16_t) BUFFER_MS_FAILED;
    }
    bufferMs[sound] = ms;
    bufferResGroup[sound] = xu4.resGroup;
    return ms;
}

bool music_start(int music, int fadeInMs) {
    ASSERT(music < MUSIC_MAX, "Invalid music_start() track id");

    /* Track already loaded -- mirrors sound_faun.cpp's music_start()
     * exactly (same-track guard, checked before anything else). */
    if (music == currentTrack)
        return false;

    const CDIEntry *ent = config_musicFile(music);
    if (ent == nullptr)
        return false;

    currentTrack = music;
    u4_web_audio_play_music(xu4.config->modulePath(ent), (int) ent->offset, (int) ent->bytes, fadeInMs);
    return true;
}

}  // namespace

int soundInit(void) {
    currentTrack = MUSIC_NONE;
    musicFadeMs = 0;
    memset(bufferMs, 0, sizeof(bufferMs));
    memset(bufferResGroup, 0, sizeof(bufferResGroup));

    musicEnabled = 1;
    musicSetVolume(xu4.settings->musicVol);
    soundSetVolume(xu4.settings->soundVol);
    return 1;
}

void soundDelete(void) {
    u4_web_audio_stop_music();
    u4_web_audio_stop_effects();
}

void soundSuspend(int halt) {
    u4_web_audio_suspend(halt);
}

void soundFreeResourceGroup(uint16_t group) {
    for (int i = 0; i < BUFFER_LIMIT; ++i) {
        if (bufferMs[i] > BUFFER_MS_FAILED && bufferResGroup[i] == group) {
            bufferMs[i] = 0;
            bufferResGroup[i] = 0;
        }
    }
}

void soundPlay(Sound sound, int limitMSec) {
    ASSERT(sound < SOUND_MAX, "Invalid soundPlay() id");

    /* Do nothing if muted or soundInit failed -- mirrors sound_faun.cpp. */
    if (soundVolume <= 0.0f)
        return;

    const CDIEntry *ent = config_soundFile(sound);
    if (ent == nullptr)
        return;

    if (bufferMs[sound] == 0)
        loadSoundBuffer(sound);

    if ((ent->cdi & CDI_MASK_FORMAT) == WEB_AUDIO_RFX_FORMAT) {
        float *samples = nullptr;
        uint32_t frames = generateRfx(ent, &samples);
        if (frames > 0 && samples != nullptr) {
            u4_web_audio_play_effect_pcm((int) (intptr_t) samples, (int) frames, limitMSec);
        }
        free(samples);
    } else {
        u4_web_audio_play_effect(xu4.config->modulePath(ent), (int) ent->offset, (int) ent->bytes, limitMSec);
    }
}

/*
 * Play a line of spoken dialogue. See this file's header comment: this
 * module ships no voice data, so the guard chain below always returns
 * before reaching real playback (verified: every VOICE_* id's
 * config_musicFile() lookup misses against a real built Ultima-IV.mod).
 */
void soundSpeakLine(int streamId, int line, bool wait) {
    if (soundVolume <= 0.0f || streamId < 1)
        return;

    const float *streamPart = xu4.config->voiceParts(streamId);
    if (streamPart == nullptr)
        return;
    streamPart += line * 2;
    if (streamPart[0] < 0.3f)
        return;

    const CDIEntry *ent = config_musicFile(streamId);
    if (ent == nullptr) {
        errorWarning("Dialogue audio stream %d not found", streamId);
        return;
    }

    /* Sub-range (start, duration) playback within an already-open stream
     * (Faun's faun_playStreamPart()) is not implemented for the web
     * backend -- see this file's header comment for why that is safe to
     * leave unimplemented rather than guessed at. */
    errorWarning("soundSpeakLine: web backend has no voice stream support for stream %d", streamId);
    (void) wait;
}

int soundDuration(Sound sound) {
    ASSERT(sound < SOUND_MAX, "Invalid soundDuration() id");
    uint16_t ms = bufferMs[sound];
    if (ms == 0)
        ms = loadSoundBuffer(sound);
    if (ms == BUFFER_MS_FAILED)
        return 0;
    return ms;
}

void soundStop() {
    u4_web_audio_stop_effects();
}

void soundSetVolume(int volume) {
    soundVolume = float(volume) / MAX_VOLUME;
    u4_web_audio_set_effect_volume((double) soundVolume);
}

int soundVolumeDec() {
    if (xu4.settings->soundVol > 0)
        soundSetVolume(--xu4.settings->soundVol);
    return (xu4.settings->soundVol * 100 / MAX_VOLUME);
}

int soundVolumeInc() {
    if (xu4.settings->soundVol < MAX_VOLUME)
        soundSetVolume(++xu4.settings->soundVol);
    return (xu4.settings->soundVol * 100 / MAX_VOLUME);
}

void musicPlay(int track) {
    if (musicEnabled && musicVolume > 0.0f)
        music_start(track, 0);
}

void musicPlayLocale() {
    musicPlay(c->location->map->music);
}

void musicStop() {
    currentTrack = MUSIC_NONE;
    u4_web_audio_stop_music();
}

void musicFadeOut(int msec) {
    if (currentTrack != MUSIC_NONE) {
        currentTrack = MUSIC_NONE;
        if (xu4.settings->volumeFades) {
            musicFadeMs = msec;
            u4_web_audio_fade_out_music(msec);
        } else {
            u4_web_audio_stop_music();
        }
    }
}

void musicFadeIn(int msec, bool loadFromMap) {
    int fadeInMs = 0;
    if (xu4.settings->volumeFades && msec > 0) {
        musicFadeMs = msec;
        fadeInMs = msec;
    }
    if (loadFromMap || currentTrack == MUSIC_NONE)
        music_start(c->location->map->music, fadeInMs);
}

void musicUpdate() {}

void musicSetVolume(int volume) {
    musicVolume = float(volume) / MAX_VOLUME;
    u4_web_audio_set_music_volume((double) musicVolume);
}

int musicVolumeDec() {
    if (xu4.settings->musicVol > 0)
        musicSetVolume(--xu4.settings->musicVol);
    return (xu4.settings->musicVol * 100 / MAX_VOLUME);
}

int musicVolumeInc() {
    if (xu4.settings->musicVol < MAX_VOLUME)
        musicSetVolume(++xu4.settings->musicVol);
    return (xu4.settings->musicVol * 100 / MAX_VOLUME);
}

bool musicToggle() {
    musicEnabled = !musicEnabled;
    if (musicEnabled)
        musicFadeIn(1000, true);
    else
        musicFadeOut(1000);
    return musicEnabled;
}
