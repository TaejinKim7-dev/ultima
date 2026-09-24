// Web entry point (Steps 6+8).
// Platform stubs (screen/gpu/sound/savegame/RNG/config) live in web-stub.cpp.
// The JS bridge functions u4_web_enqueue_key / u4_web_submit_text are defined
// queue-backed in vendor/xu4/src/web_bridge.cpp (Step 8): DOM callbacks only
// enqueue immutable events; the engine consumes them from its input loop.
// This TU provides main() only, so the bridge symbols stay singly defined
// and exported (see EXPORTED_FUNCTIONS in scripts/build-wasm.mjs).

// Minimal main - real game initialization happens in Step 9
int main() {
    // Placeholder - real implementation in Step 9 (browser startup)
    return 0;
}
