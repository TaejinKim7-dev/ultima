// Todo 21.1: silent sound.h backend for the wasm build.
//
// sound_faun.cpp (the native SOUND=faun backend) pulls in the Faun mixer,
// PulseAudio, and pthread -- none of which belong in the wasm link. This
// file implements every function declared in vendor/xu4/src/sound.h as a
// no-op / zero-duration stub so the real engine (xu4.cpp, game.cpp, ...)
// links and runs with audio calls that do nothing. Todo 16 replaces this
// with a real Web Audio backend behind the same sound.h contract.
#include <cstdint>
#include "sound.h"

int soundInit(void) { return 1; }
void soundDelete(void) {}
void soundSuspend(int) {}
void soundFreeResourceGroup(uint16_t) {}

void soundPlay(Sound, int) {}
void soundSpeakLine(int, int, bool) {}

int soundDuration(Sound) { return 0; }
void soundStop() {}
void soundSetVolume(int) {}
int soundVolumeDec() { return 0; }
int soundVolumeInc() { return 0; }

void musicPlay(int) {}
void musicPlayLocale() {}
void musicStop() {}
void musicFadeOut(int) {}
void musicFadeIn(int, bool) {}
void musicSetVolume(int) {}
int musicVolumeDec() { return 0; }
int musicVolumeInc() { return 0; }
bool musicToggle() { return false; }
