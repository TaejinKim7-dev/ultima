// Web-specific stub implementations for platform-dependent functions
// These replace native GLFW/OpenGL/Faun implementations for WASM build

#include <stdint.h>
#include <stdlib.h>

// Forward declarations for types used in stubs
struct GameState;
struct UThread;
struct Person;
struct Party;
struct Location;
struct Map;
struct Config;
enum Stage { StagePlay = 1 };

// Global game state (defined in xu4.cpp)
extern "C" struct GameState* xu4;

// Config interface
extern "C" {
const char* xu4_config_get(const char* key);
void xu4_config_set(const char* key, const char* value);
struct Config* xu4_config_get_ptr();
struct UThread* xu4_config_boronThread();
}

// RNG (if not using well512)
extern "C" uint32_t xu4_random(uint32_t n);

// Bridge functions (called from JavaScript)
extern "C" {
int u4_web_enqueue_key(int key);
int u4_web_submit_text(int requestId, const char* text, int byteLength);
}

// Internal implementations
int xu4_enqueue_key(int key) {
    // Queue a key press for the engine to consume
    return 0;
}

int xu4_submit_text(int requestId, const char* text, int byteLength) {
    // Submit text input (for NPC dialogue, etc.)
    return 0;
}

// Screen stubs (replace native GLFW screen)
extern "C" {
void screenInit() {}
void screenShutdown() {}
void screenSetTitle(const char*) {}
void screenSwapBuffers() {}
void screenGetSize(int*, int*) {}
void screenSetSize(int, int) {}
void screenSetFullscreen(bool) {}
bool screenIsFullscreen() { return false; }
void screenShowCursor() {}
void screenHideCursor() {}
void screenSetCursorPos(int, int) {}
void screenGetCursorPos(int*, int*) {}
void screenTextAt(int, int, const char*, ...) {}
void screenTextAtFmt(int, int, const char*, ...) {}
void screenClear(int) {}
void screenSetClipRect(int, int, int, int) {}
void screenResetClipRect() {}
}

// GPU stubs (replace native OpenGL)
extern "C" {
void gpuInit() {}
void gpuShutdown() {}
void gpuSetViewport(int, int, int, int) {}
void gpuClear(int) {}
void gpuBeginFrame() {}
void gpuEndFrame() {}
void gpuFlush() {}
}

// Sound stubs (replace native Faun)
extern "C" {
void soundInit() {}
void soundShutdown() {}
void soundPlay(int) {}
void soundPlayMusic(const char*) {}
void soundStopMusic() {}
void soundSetMusicVolume(float) {}
void soundSetSfxVolume(float) {}
}

// Savegame stubs (replace native file I/O - will use IDBFS)
extern "C" {
void savegameInit() {}
void savegameShutdown() {}
bool savegameSave(int, const char*) { return true; }
bool savegameLoad(int, const char*) { return true; }
bool savegameExists(int) { return false; }
void savegameDelete(int) {}
}

// Config stubs
const char* xu4_config_get(const char*) { return ""; }
void xu4_config_set(const char*, const char*) {}
struct Config* xu4_config_get_ptr() { return nullptr; }
struct UThread* xu4_config_boronThread() { return nullptr; }

// RNG (if not using well512)
uint32_t xu4_random(uint32_t n) {
    if (n < 2) return 0;
    return (uint32_t)rand() % n;
}

// Global game state placeholder
struct GameState* xu4 = nullptr;