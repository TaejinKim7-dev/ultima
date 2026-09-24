// Minimal web entry point for Step 6.
// Platform stubs (screen/gpu/sound/savegame/RNG/config) live in web-stub.cpp;
// this file only provides the JS bridge functions and main().

#include <emscripten.h>

// Bridge functions (called from JavaScript)
extern "C" {

EMSCRIPTEN_KEEPALIVE
int u4_web_enqueue_key(int key) {
    // Queue a key press for the engine to consume
    // Returns 0 on success, negative on error
    (void) key;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int u4_web_submit_text(int requestId, const char* text, int byteLength) {
    // Submit text input (for NPC dialogue, etc.)
    // Returns 0 on success, negative on error
    (void) requestId;
    (void) text;
    (void) byteLength;
    return 0;
}

} // extern "C"

// Minimal main - real game initialization happens in Step 9
int main() {
    // Placeholder - real implementation in Step 9 (browser startup)
    return 0;
}
